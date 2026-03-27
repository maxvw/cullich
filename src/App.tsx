import "./index.css";

import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { MonthGridPicker } from "./components/MonthGridPicker";
import { PlayIcon } from "./components/PlayIcon";
import { SettingsModal } from "./components/SettingsModal";
import { SubmitModal } from "./components/SubmitModal";
import { UnsavedModal } from "./components/UnsavedModal";
import { useAutoSave } from "./hooks/useAutoSave";
import { usePreloader } from "./hooks/usePreloader";
import type {
  Direction,
  HistoryEntry,
  IndexedMonth,
  Month,
  PendingMonth,
  Photo,
  PhotoStatus,
  TagBinding,
} from "./types";

async function getPhotosForMonth(
  year: number,
  month: number,
  tagBindings: TagBinding[],
): Promise<Photo[]> {
  const tagNames = tagBindings.map((b) => b.name);
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  if (tagNames.length > 0) {
    params.set("tags", tagNames.join(","));
  }
  const result = await fetch(`/api/photos?${params}`);
  const { photos } = await result.json();
  return photos;
}

async function fetchMonths(): Promise<Month[]> {
  const result = await fetch("/api/buckets");
  return await result.json();
}

async function persistPhotos(photos: Photo[], tagBindings: TagBinding[]) {
  const picks = photos.filter((p) => p.status === "pick").map((p) => p.id);
  const rejects = photos.filter((p) => p.status === "reject").map((p) => p.id);

  // Build tag map: { "Dog": ["id1", "id2"], "Family": ["id3"] }
  const tags: Record<string, string[]> = {};
  // Build untag map: assets that had a tag initially but no longer do
  const untags: Record<string, string[]> = {};

  for (const binding of tagBindings) {
    tags[binding.name] = photos
      .filter((p) => p.tags.includes(binding.name))
      .map((p) => p.id);

    const removed = photos
      .filter(
        (p) =>
          p.initialTags.includes(binding.name) &&
          !p.tags.includes(binding.name),
      )
      .map((p) => p.id);
    if (removed.length > 0) {
      untags[binding.name] = removed;
    }
  }

  await fetch("/api/persist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ picks, rejects, tags, untags }),
  });
}

function loadTagBindings(): TagBinding[] {
  try {
    const raw = localStorage.getItem("cull:tagBindings");
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function saveTagBindings(bindings: TagBinding[]) {
  try {
    localStorage.setItem("cull:tagBindings", JSON.stringify(bindings));
  } catch {
    // storage unavailable
  }
}

const statusColor = {
  pick: "#4ade80",
  reject: "#f87171",
  unreviewed: "rgba(255,255,255,0.15)",
};
const statusLabel = { pick: "KEEP", reject: "REJECT", unreviewed: null };

// ─── Main ─────────────────────────────────────────────────────────────────────
export function App() {
  const [months, setMonths] = useState<Month[]>([]);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState<false | "months" | "photos">("months");
  const [current, setCurrent] = useState(0);
  // history and future stored together so undo/redo updates are always atomic
  const [undoStack, setUndoStack] = useState<{
    history: HistoryEntry[];
    future: HistoryEntry[];
  }>({ history: [], future: [] });
  const [filter, setFilter] = useState("all");
  const [zoom, setZoom] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<PendingMonth | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSave, setAutoSave] = useState(() => {
    try {
      return localStorage.getItem("cull:autoSave") === "true";
    } catch {
      return false;
    }
  });
  const [tagBindings, setTagBindings] = useState<TagBinding[]>(loadTagBindings);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef(null);
  const loadRef = useRef(0); // tracks latest load request to discard stale responses
  const tagBindingsRef = useRef(tagBindings);
  tagBindingsRef.current = tagBindings;

  usePreloader(photos, current);

  // Read initial month from URL query params (?year=2024&month=3), fallback to index 0
  useEffect(() => {
    setLoading("months");
    fetchMonths().then((result) => {
      setMonths(result);
      const params = new URLSearchParams(window.location.search);
      const urlYear = parseInt(params.get("year") ?? "", 10);
      const urlMonth = parseInt(params.get("month") ?? "", 10); // 1-indexed, matches m.month
      const urlIdx =
        !isNaN(urlYear) && !isNaN(urlMonth)
          ? result.findIndex((m) => m.year === urlYear && m.month === urlMonth)
          : -1;
      const startIdx = urlIdx >= 0 ? urlIdx : 0;
      setSelectedMonthIdx(startIdx);
      const m = result[startIdx];
      setLoading("photos");
      // Sync URL to the resolved start month (respects ?year=&month= if valid, else sets index 0)
      if (m.year && m.month) {
        const syncParams = new URLSearchParams({
          year: String(m.year),
          month: String(m.month),
        });
        window.history.replaceState(null, "", `?${syncParams}`);
      }
      getPhotosForMonth(m.year, m.month, tagBindingsRef.current).then(
        (photos) => {
          setPhotos(photos);
          const firstUnreviewed = photos.findIndex(
            (p) => p.status === "unreviewed",
          );
          setCurrent(firstUnreviewed >= 0 ? firstUnreviewed : 0);
          setLoading(false);
        },
      );
    });
  }, []);

  const photo = photos[current];
  const hasUnsavedWork = photos.some(
    (p) =>
      p.status !== p.initialStatus ||
      JSON.stringify([...p.tags].sort()) !==
        JSON.stringify([...p.initialTags].sort()),
  );
  const currentMonth = months[selectedMonthIdx];

  // Stop playback when navigating away
  useEffect(() => {
    setIsPlaying(false);
  }, [current]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!e.target) return;
      if (
        dropdownRef.current &&
        !dropdownRef.current?.contains(e.target as HTMLElement)
      )
        setShowMonthDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doSwitch = useCallback((monthObj: Month, monthIdx: number) => {
    const reqId = ++loadRef.current;
    setLoading("photos");
    setPhotos([]);
    setSelectedMonthIdx(monthIdx);
    setCurrent(0);
    setUndoStack({ history: [], future: [] });
    setFilter("all");
    setZoom(false);
    setIsPlaying(false);
    setSaved(false);
    setSaving(false);
    setPendingSwitch(null);
    setShowMonthDropdown(false);
    // Update URL query params so refresh restores this month
    if (monthObj.year && monthObj.month) {
      const params = new URLSearchParams({
        year: String(monthObj.year),
        month: String(monthObj.month),
      });
      window.history.replaceState(null, "", `?${params}`);
    }
    getPhotosForMonth(
      monthObj.year,
      monthObj.month,
      tagBindingsRef.current,
    ).then((result) => {
      if (loadRef.current === reqId) {
        setPhotos(result);
        const firstUnreviewed = result.findIndex(
          (p) => p.status === "unreviewed",
        );
        setCurrent(firstUnreviewed >= 0 ? firstUnreviewed : 0);
        setLoading(false);
      }
    });
  }, []);

  const requestSwitch = useCallback(
    (monthObj: Month, monthIdx: number) => {
      if (monthIdx === selectedMonthIdx) {
        setShowMonthDropdown(false);
        return;
      }
      if (hasUnsavedWork && !saved) {
        setPendingSwitch({ monthObj, monthIdx });
      } else {
        doSwitch(monthObj, monthIdx);
      }
    },
    [hasUnsavedWork, saved, selectedMonthIdx, doSwitch],
  );

  // Build tag color lookup from bindings
  const tagColorMap: Record<string, string> = {};
  for (const b of tagBindings) {
    tagColorMap[b.name] = b.color;
  }

  const filteredIndices = photos
    .map((p, i) => ({ ...p, originalIndex: i }))
    .filter((p) => {
      if (filter === "all") return true;
      if (filter === "unreviewed" || filter === "pick" || filter === "reject")
        return p.status === filter;
      // Tag filter
      return p.tags.includes(filter);
    })
    .map((p) => p.originalIndex);

  const currentFilterPos = filteredIndices.indexOf(current);

  const go = useCallback(
    (dir: number) => {
      const pos = currentFilterPos + dir;
      if (pos >= 0 && pos < filteredIndices.length)
        setCurrent(filteredIndices[pos]);
    },
    [currentFilterPos, filteredIndices],
  );

  const setStatus = useCallback(
    (status: PhotoStatus) => {
      const from = photos[current].status;
      if (from !== status) {
        setUndoStack((s) => ({
          history: [
            ...s.history,
            { type: "status", index: current, from, to: status },
          ],
          future: [],
        }));
        setPhotos((ps) =>
          ps.map((p, i) => (i === current ? { ...p, status } : p)),
        );
        setSaved(false);
        setSaving(false);
      }
      setTimeout(() => {
        const next = photos.findIndex(
          (p, i) => i > current && p.status === "unreviewed",
        );
        if (next !== -1) setCurrent(next);
        else go(1);
      }, 120);
    },
    [current, photos, go],
  );

  const toggleTag = useCallback(
    (index: number, tagName: string) => {
      const p = photos[index];
      if (!p) return;
      const has = p.tags.includes(tagName);
      const action = has ? "remove" : "add";
      setUndoStack((s) => ({
        history: [...s.history, { type: "tag", index, tag: tagName, action }],
        future: [],
      }));
      setPhotos((ps) =>
        ps.map((ph, i) => {
          if (i !== index) return ph;
          return {
            ...ph,
            tags: has
              ? ph.tags.filter((t) => t !== tagName)
              : [...ph.tags, tagName],
          };
        }),
      );
      setSaved(false);
      setSaving(false);
    },
    [photos],
  );

  const undo = useCallback(() => {
    setUndoStack((s) => {
      if (!s.history.length) return s;
      const entry = s.history[s.history.length - 1];
      if (entry.type === "status") {
        setPhotos((ps) =>
          ps.map((p, i) =>
            i === entry.index ? { ...p, status: entry.from } : p,
          ),
        );
      } else {
        // tag entry — reverse the action
        setPhotos((ps) =>
          ps.map((p, i) => {
            if (i !== entry.index) return p;
            return {
              ...p,
              tags:
                entry.action === "add"
                  ? p.tags.filter((t) => t !== entry.tag)
                  : [...p.tags, entry.tag],
            };
          }),
        );
      }
      setCurrent(entry.index);
      return { history: s.history.slice(0, -1), future: [...s.future, entry] };
    });
  }, []);

  const redo = useCallback(() => {
    setUndoStack((s) => {
      if (!s.future.length) return s;
      const entry = s.future[s.future.length - 1];
      if (entry.type === "status") {
        setPhotos((ps) =>
          ps.map((p, i) =>
            i === entry.index ? { ...p, status: entry.to } : p,
          ),
        );
      } else {
        // tag entry — re-apply the action
        setPhotos((ps) =>
          ps.map((p, i) => {
            if (i !== entry.index) return p;
            return {
              ...p,
              tags:
                entry.action === "add"
                  ? [...p.tags, entry.tag]
                  : p.tags.filter((t) => t !== entry.tag),
            };
          }),
        );
      }
      setCurrent(entry.index);
      return { history: [...s.history, entry], future: s.future.slice(0, -1) };
    });
  }, []);

  const togglePlay = useCallback(() => {
    if (!photo.isVideo) return;
    setIsPlaying((v) => !v);
  }, [photo]);

  const handleAutoSaveChange = useCallback((v: boolean) => {
    setAutoSave(v);
    try {
      localStorage.setItem("cull:autoSave", String(v));
    } catch {
      // storage unavailable
    }
  }, []);

  const handleTagBindingsChange = useCallback((bindings: TagBinding[]) => {
    setTagBindings(bindings);
    saveTagBindings(bindings);
  }, []);

  // Build keybinding lookup for keyboard handler
  const tagKeyMap = useRef<Record<string, string>>({});
  tagKeyMap.current = Object.fromEntries(
    tagBindings.map((b) => [b.key, b.name]),
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!photo) return;
      if (!e.target) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        showSubmitModal ||
        pendingSwitch ||
        showSettings
      )
        return;
      // Don't intercept space/arrows when video controls are focused
      if (target.tagName === "VIDEO") return;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          go(1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          go(-1);
          break;
        case ",":
          setStatus("reject");
          break;
        case ".":
          setStatus("pick");
          break;
        case "u":
        case "U":
          setStatus("unreviewed");
          break;
        case "z":
          if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
            e.preventDefault();
            redo();
          } else if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            undo();
          }
          break;
        case "Z":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            redo();
          }
          break;
        case "s":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            setShowSubmitModal(true);
          }
          break;
        case " ":
          if (photo.isVideo) {
            e.preventDefault();
            togglePlay();
          } else {
            e.preventDefault();
            setZoom((z) => !z);
          }
          break;
        case "v":
        case "V":
        case "Enter":
          if (photo.isVideo) {
            e.preventDefault();
            togglePlay();
          }
          break;
        case "Escape":
          if (isPlaying) {
            setIsPlaying(false);
          } else {
            setShowMonthDropdown(false);
          }
          break;
        default: {
          // Check tag keybindings
          if (!e.metaKey && !e.ctrlKey && !e.altKey) {
            const tagName = tagKeyMap.current[e.key];
            if (tagName) {
              e.preventDefault();
              toggleTag(current, tagName);
            }
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    go,
    setStatus,
    undo,
    redo,
    showSubmitModal,
    showSettings,
    pendingSwitch,
    photo,
    isPlaying,
    togglePlay,
    toggleTag,
    current,
  ]);

  useEffect(() => {
    if (!filmstripRef.current) return;
    const thumb = filmstripRef.current.querySelector(
      `[data-index="${current}"]`,
    );
    if (thumb) thumb.scrollIntoView({ inline: "center", behavior: "smooth" });
  }, [current]);

  const handleAutoSave = useCallback(async (photos: Photo[]) => {
    setSaving(true);
    try {
      await persistPhotos(photos, tagBindingsRef.current);
      setSaved(true);
    } catch {
      // silently fail for autosave — user can always manually save
    } finally {
      setSaving(false);
    }
  }, []);

  useAutoSave(photos, autoSave, handleAutoSave);

  // While loading, render just the overlay — no photo access needed
  if (loading)
    return (
      <div
        style={{
          fontFamily: "'DM Mono', 'Courier New', monospace",
          background: "#0e0e0e",
          color: "#e8e8e8",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        <svg
          viewBox="0 0 40 40"
          style={{
            width: 40,
            height: 40,
            animation: "spin 1s linear infinite",
          }}
        >
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke="#222"
            strokeWidth="3"
          />
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke="#4ade80"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="60 40"
          />
        </svg>
        <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.2em" }}>
          {loading === "months"
            ? "LOADING LIBRARY"
            : `LOADING ${currentMonth?.label.toUpperCase() ?? ""}`}
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );

  const picks = photos.filter((p) => p.status === "pick").length;
  const rejects = photos.filter((p) => p.status === "reject").length;
  const unreviewed = photos.filter((p) => p.status === "unreviewed").length;
  const progress =
    photos.length > 0
      ? ((photos.length - unreviewed) / photos.length) * 100
      : 0;

  const tabBtn = (active: boolean, color?: string) => ({
    background: active ? (color ? `${color}18` : "#222") : "transparent",
    border: `1px solid ${active ? (color ?? "#444") : "#222"}`,
    color: active ? (color ?? "#e8e8e8") : "#555",
    padding: "3px 10px",
    borderRadius: 4,
    fontSize: 10,
    letterSpacing: "0.1em",
    cursor: "pointer",
    textTransform: "uppercase" as const,
    fontFamily: "inherit",
  });

  // Count photos with each tag for filter display
  const tagCounts: Record<string, number> = {};
  for (const b of tagBindings) {
    tagCounts[b.name] = photos.filter((p) => p.tags.includes(b.name)).length;
  }

  return (
    <div
      style={{
        fontFamily: "'DM Mono', 'Courier New', monospace",
        background: "#0e0e0e",
        color: "#e8e8e8",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        userSelect: "none",
        position: "relative",
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 16px",
          borderBottom: "1px solid #222",
          gap: 12,
          flexShrink: 0,
        }}
      >
        {/* Month selector */}
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowMonthDropdown((v) => !v)}
            style={{
              background: showMonthDropdown ? "#1a1a1a" : "transparent",
              border: "1px solid #333",
              color: "#e8e8e8",
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 11,
              letterSpacing: "0.1em",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 9, color: "#555" }}>▤</span>
            {currentMonth.label}
            <span style={{ fontSize: 9, color: "#555" }}>
              {showMonthDropdown ? "▲" : "▼"}
            </span>
            {hasUnsavedWork && !saved && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#fbbf24",
                  display: "inline-block",
                  marginLeft: 2,
                }}
                title="Unsaved changes"
              />
            )}
          </button>
          {showMonthDropdown && (
            <MonthGridPicker
              months={months}
              selectedMonthIdx={selectedMonthIdx}
              onSelect={requestSwitch}
            />
          )}
        </div>

        {/* Progress bar */}
        <div
          style={{
            flex: 1,
            height: 2,
            background: "#222",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: saved
                ? "#4ade80"
                : "linear-gradient(90deg, #4ade80, #22d3ee)",
              transition: "width 0.4s ease",
              borderRadius: 2,
            }}
          />
        </div>

        <span style={{ fontSize: 11, color: "#555" }}>
          {current + 1} / {photos.length}
        </span>

        <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
          <span style={{ color: "#4ade80" }}>✓ {picks}</span>
          <span style={{ color: "#f87171" }}>✗ {rejects}</span>
          <span style={{ color: "#555" }}>· {unreviewed}</span>
        </div>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {["all", "unreviewed", "pick", "reject"].map((f) => (
            <button
              key={f}
              style={tabBtn(filter === f)}
              onClick={() => {
                setFilter(f);
                if (f !== "all") {
                  const idx = photos.findIndex((p) => p.status === f);
                  if (idx !== -1) setCurrent(idx);
                }
              }}
            >
              {f}
            </button>
          ))}
          {tagBindings.map((b) =>
            tagCounts[b.name] > 0 ? (
              <button
                key={`tag:${b.name}`}
                style={tabBtn(filter === b.name, b.color)}
                onClick={() => {
                  setFilter(b.name);
                  const idx = photos.findIndex((p) => p.tags.includes(b.name));
                  if (idx !== -1) setCurrent(idx);
                }}
              >
                {b.name} ({tagCounts[b.name]})
              </button>
            ) : null,
          )}
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={undo}
            disabled={!undoStack.history.length}
            style={{
              background: "transparent",
              border: "1px solid #333",
              color: undoStack.history.length ? "#888" : "#333",
              padding: "3px 10px",
              borderRadius: 4,
              fontSize: 10,
              cursor: undoStack.history.length ? "pointer" : "default",
              letterSpacing: "0.1em",
              fontFamily: "inherit",
            }}
          >
            ⌘Z
          </button>
          <button
            onClick={redo}
            disabled={!undoStack.future.length}
            style={{
              background: "transparent",
              border: "1px solid #333",
              color: undoStack.future.length ? "#888" : "#333",
              padding: "3px 10px",
              borderRadius: 4,
              fontSize: 10,
              cursor: undoStack.future.length ? "pointer" : "default",
              letterSpacing: "0.1em",
              fontFamily: "inherit",
            }}
          >
            ⌘⇧Z
          </button>
        </div>

        {/* Settings gear */}
        <button
          onClick={() => setShowSettings(true)}
          style={{
            background: "transparent",
            border: "1px solid #333",
            color: "#555",
            padding: "4px 10px",
            borderRadius: 4,
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.2s",
          }}
          title="Settings"
        >
          ⚙
        </button>

        <button
          onClick={() => !saving && setShowSubmitModal(true)}
          style={{
            background: saved
              ? "rgba(74,222,128,0.06)"
              : "rgba(74,222,128,0.12)",
            border: `1px solid ${saved ? "#2d5c3a" : "#4ade80"}`,
            color: saved ? "#3a7a4a" : "#4ade80",
            padding: "4px 16px",
            borderRadius: 4,
            fontSize: 10,
            letterSpacing: "0.15em",
            cursor: saving ? "default" : "pointer",
            fontFamily: "inherit",
            fontWeight: 600,
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {saving ? (
            <>
              <svg
                viewBox="0 0 16 16"
                style={{
                  width: 10,
                  height: 10,
                  animation: "spin 1s linear infinite",
                }}
              >
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill="none"
                  stroke="#4ade8044"
                  strokeWidth="2"
                />
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="20 20"
                />
              </svg>
              SAVING
            </>
          ) : saved ? (
            "✓ SAVED"
          ) : (
            "SAVE"
          )}
        </button>
      </div>

      {/* ── Main viewer ── */}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: photo.isVideo ? "default" : zoom ? "zoom-out" : "zoom-in",
        }}
        onClick={() => {
          if (!photo.isVideo) setZoom((z) => !z);
        }}
      >
        {/* Status badge */}
        {photo.status !== "unreviewed" && (
          <div
            style={{
              position: "absolute",
              top: 20,
              left: 20,
              zIndex: 10,
              background:
                photo.status === "pick"
                  ? "rgba(74,222,128,0.15)"
                  : "rgba(248,113,113,0.15)",
              border: `1px solid ${photo.status === "pick" ? "#4ade80" : "#f87171"}`,
              color: photo.status === "pick" ? "#4ade80" : "#f87171",
              padding: "4px 14px",
              borderRadius: 3,
              fontSize: 11,
              letterSpacing: "0.2em",
              fontWeight: 600,
            }}
          >
            {statusLabel[photo.status]}
          </div>
        )}

        {/* Tag badges below status */}
        {photo.tags.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: photo.status !== "unreviewed" ? 52 : 20,
              left: 20,
              zIndex: 10,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            {photo.tags.map((t) => {
              const color = tagColorMap[t] ?? "#888";
              return (
                <div
                  key={t}
                  style={{
                    background: `${color}22`,
                    border: `1px solid ${color}66`,
                    color,
                    padding: "3px 10px",
                    borderRadius: 3,
                    fontSize: 10,
                    letterSpacing: "0.15em",
                    fontWeight: 600,
                  }}
                >
                  {t.toUpperCase()}
                </div>
              );
            })}
          </div>
        )}

        {/* VIDEO badge top-right */}
        {photo.isVideo && (
          <div
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              zIndex: 10,
              background: "rgba(0,0,0,0.5)",
              border: "1px solid #444",
              color: "#aaa",
              padding: "3px 10px",
              borderRadius: 3,
              fontSize: 10,
              letterSpacing: "0.15em",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <PlayIcon size={9} color="#aaa" /> VIDEO
          </div>
        )}

        {/* Image */}
        {!photo.isVideo && (
          <img
            key={photo.id}
            src={photo.src}
            alt=""
            style={{
              maxWidth: zoom ? "none" : "100%",
              maxHeight: zoom ? "none" : "100%",
              height: zoom ? "auto" : "100%",
              objectFit: "contain",
              display: "block",
              filter:
                photo.status === "reject"
                  ? "brightness(0.6) saturate(0.4)"
                  : "none",
            }}
          />
        )}

        {/* Video: thumbnail + play overlay when not playing */}
        {photo.isVideo && !isPlaying && (
          <div
            style={{
              position: "relative",
              height: "100%",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={photo.src}
              alt=""
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                display: "block",
                filter:
                  photo.status === "reject"
                    ? "brightness(0.6) saturate(0.4)"
                    : "brightness(0.75)",
              }}
            />
            {/* Play button overlay */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              style={{
                position: "absolute",
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.6)",
                border: "2px solid rgba(255,255,255,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "background 0.15s, transform 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(0,0,0,0.85)";
                e.currentTarget.style.transform = "scale(1.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(0,0,0,0.6)";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <PlayIcon size={22} color="white" />
            </button>
            <div
              style={{
                position: "absolute",
                bottom: 12,
                right: 16,
                fontSize: 10,
                color: "#555",
                letterSpacing: "0.1em",
              }}
            >
              V or ENTER to play
            </div>
          </div>
        )}

        {/* Video: actual player when playing */}
        {photo.isVideo && isPlaying && (
          <div
            style={{
              position: "relative",
              height: "100%",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {photo.videoSrc ? (
              <video
                ref={videoRef}
                src={photo.videoSrc}
                autoPlay
                loop
                controls
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  display: "block",
                  outline: "none",
                }}
              />
            ) : (
              // Prototype placeholder — no real video src available
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <img
                  src={photo.src}
                  alt=""
                  style={{
                    maxWidth: "100%",
                    maxHeight: "60%",
                    objectFit: "contain",
                    opacity: 0.4,
                  }}
                />
                <div
                  style={{
                    fontSize: 11,
                    color: "#555",
                    letterSpacing: "0.12em",
                    textAlign: "center",
                    lineHeight: 1.8,
                  }}
                >
                  VIDEO PLAYBACK
                  <br />
                  <span style={{ fontSize: 10, color: "#333" }}>
                    No video src in prototype — wire up videoSrc to enable.
                  </span>
                  <br />
                  <button
                    onClick={() => setIsPlaying(false)}
                    style={{
                      marginTop: 12,
                      background: "transparent",
                      border: "1px solid #333",
                      color: "#666",
                      padding: "4px 16px",
                      borderRadius: 4,
                      fontSize: 10,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      letterSpacing: "0.1em",
                    }}
                  >
                    CLOSE
                  </button>
                </div>
              </div>
            )}
            {/* Stop button */}
            {photo.videoSrc && (
              <button
                onClick={() => setIsPlaying(false)}
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  background: "rgba(0,0,0,0.5)",
                  border: "1px solid #333",
                  color: "#888",
                  padding: "3px 10px",
                  borderRadius: 4,
                  fontSize: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.1em",
                }}
              >
                ✕ STOP
              </button>
            )}
          </div>
        )}

        {/* Nav arrows */}
        {!isPlaying && currentFilterPos > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            style={{
              position: "absolute",
              left: 16,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(0,0,0,0.5)",
              border: "1px solid #333",
              color: "#aaa",
              width: 40,
              height: 60,
              borderRadius: 6,
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ‹
          </button>
        )}
        {!isPlaying && currentFilterPos < filteredIndices.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            style={{
              position: "absolute",
              right: 16,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(0,0,0,0.5)",
              border: "1px solid #333",
              color: "#aaa",
              width: 40,
              height: 60,
              borderRadius: 6,
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ›
          </button>
        )}

        {!photo.isVideo && (
          <div
            style={{
              position: "absolute",
              bottom: 12,
              right: 16,
              fontSize: 10,
              color: "#333",
              letterSpacing: "0.1em",
            }}
          >
            SPACE to zoom
          </div>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 16,
          padding: "12px 0",
          borderTop: "1px solid #1a1a1a",
          borderBottom: "1px solid #1a1a1a",
          flexShrink: 0,
        }}
      >
        {[
          {
            status: "reject" as PhotoStatus,
            label: "✗ REJECT",
            key: ",",
            color: "#f87171",
            bg: "rgba(248,113,113,0.15)",
          },
          {
            status: "pick" as PhotoStatus,
            label: "✓ KEEP",
            key: ".",
            color: "#4ade80",
            bg: "rgba(74,222,128,0.15)",
          },
        ].map(({ status, label, key, color, bg }) => (
          <button
            key={status}
            onClick={() => setStatus(status)}
            style={{
              background: photo.status === status ? bg : "transparent",
              border: `1px solid ${photo.status === status ? color : "#333"}`,
              color: photo.status === status ? color : "#666",
              padding: "8px 32px",
              borderRadius: 4,
              fontSize: 12,
              letterSpacing: "0.15em",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            {label} <span style={{ fontSize: 10, opacity: 0.6 }}>({key})</span>
          </button>
        ))}

        {/* Tag toggle buttons */}
        {tagBindings.length > 0 && (
          <>
            <div
              style={{
                width: 1,
                height: 24,
                background: "#222",
                flexShrink: 0,
              }}
            />
            {tagBindings.map((b) => {
              const active = photo.tags.includes(b.name);
              return (
                <button
                  key={b.name}
                  onClick={() => toggleTag(current, b.name)}
                  style={{
                    background: active ? `${b.color}22` : "transparent",
                    border: `1px solid ${active ? b.color : "#333"}`,
                    color: active ? b.color : "#555",
                    padding: "8px 18px",
                    borderRadius: 4,
                    fontSize: 11,
                    letterSpacing: "0.12em",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  {b.name.toUpperCase()}{" "}
                  <span style={{ fontSize: 10, opacity: 0.6 }}>({b.key})</span>
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* ── Filmstrip ── */}
      <div
        ref={filmstripRef}
        style={{
          display: "flex",
          gap: 4,
          padding: "8px 12px",
          overflowX: "auto",
          flexShrink: 0,
          scrollbarWidth: "none",
        }}
      >
        {photos.map((p, i) => (
          <div
            key={p.id}
            data-index={i}
            onClick={() => setCurrent(i)}
            style={{
              position: "relative",
              flexShrink: 0,
              width: 72,
              height: 48,
              borderRadius: 3,
              overflow: "hidden",
              cursor: "pointer",
              outline:
                i === current ? "2px solid #e8e8e8" : "2px solid transparent",
              outlineOffset: 1,
              transition: "outline-color 0.1s",
              opacity: i === current ? 1 : 0.6,
            }}
          >
            <img
              src={p.thumb}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                filter:
                  p.status === "reject"
                    ? "brightness(0.5) saturate(0.3)"
                    : "none",
              }}
            />

            {/* Video play icon overlay on filmstrip */}
            {p.isVideo && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.25)",
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.55)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <PlayIcon size={8} color="white" opacity={0.9} />
                </div>
              </div>
            )}

            {/* Tag dots — left edge, stacked vertically */}
            {p.tags.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 3,
                  left: 3,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {p.tags.map((t) => (
                  <div
                    key={t}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: tagColorMap[t] ?? "#888",
                      boxShadow: `0 0 3px ${tagColorMap[t] ?? "#888"}`,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Status dot */}
            {p.status !== "unreviewed" && (
              <div
                style={{
                  position: "absolute",
                  bottom: 3,
                  right: 3,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: statusColor[p.status],
                  boxShadow: `0 0 4px ${statusColor[p.status]}`,
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* ── Keyboard hints ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 24,
          padding: "6px 0 8px",
          fontSize: 10,
          color: "#3a3a3a",
          letterSpacing: "0.12em",
          flexShrink: 0,
        }}
      >
        <span>← → NAVIGATE</span>
        <span>, REJECT</span>
        <span>. KEEP</span>
        <span>U CLEAR</span>
        <span>⌘Z UNDO</span>
        <span>⌘S SAVE</span>
        {photo.isVideo ? (
          <span style={{ color: "#444" }}>V / ENTER PLAY</span>
        ) : (
          <span>SPACE ZOOM</span>
        )}
        {tagBindings.map((b) => (
          <span key={b.name} style={{ color: `${b.color}88` }}>
            {b.key.toUpperCase()} {b.name.toUpperCase()}
          </span>
        ))}
      </div>

      {/* ── Modals ── */}
      {showSubmitModal && (
        <SubmitModal
          photos={photos}
          monthLabel={currentMonth.label}
          tagBindings={tagBindings}
          isSaving={saving}
          onConfirm={async () => {
            setSaving(true);
            try {
              await persistPhotos(photos, tagBindings);
              setSaved(true);
              setShowSubmitModal(false);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={() => setShowSubmitModal(false)}
        />
      )}
      {showSettings && (
        <SettingsModal
          tagBindings={tagBindings}
          autoSave={autoSave}
          onTagBindingsChange={handleTagBindingsChange}
          onAutoSaveChange={handleAutoSaveChange}
          onClose={() => setShowSettings(false)}
        />
      )}
      {pendingSwitch && (
        <UnsavedModal
          pendingLabel={pendingSwitch.monthObj.label}
          onConfirm={() =>
            doSwitch(pendingSwitch.monthObj, pendingSwitch.monthIdx)
          }
          onCancel={() => setPendingSwitch(null)}
        />
      )}
    </div>
  );
}
