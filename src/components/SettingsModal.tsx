import { type PropsWithChildren, useEffect, useRef, useState } from "react";
import type { TagBinding } from "../types";

const RESERVED_KEYS = new Set([
  ",",
  ".",
  "u",
  "U",
  "z",
  "Z",
  "s",
  "S",
  "v",
  "V",
  " ",
  "Enter",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Tab",
]);

const TAG_COLORS = [
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
  "#84cc16", // lime
  "#e11d48", // rose
  "#06b6d4", // cyan
];

export function SettingsModal({
  tagBindings,
  autoSave,
  onTagBindingsChange,
  onAutoSaveChange,
  onClose,
}: PropsWithChildren<{
  tagBindings: TagBinding[];
  autoSave: boolean;
  onTagBindingsChange: (bindings: TagBinding[]) => void;
  onAutoSaveChange: (v: boolean) => void;
  onClose: () => void;
}>) {
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(
    () =>
      TAG_COLORS.find((c) => !tagBindings.some((b) => b.color === c)) ??
      TAG_COLORS[0],
  );
  const [error, setError] = useState("");
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const usedKeys = new Set(tagBindings.map((b) => b.key));

  const validateKey = (key: string): string | null => {
    if (!key) return "Key is required";
    if (key.length !== 1) return "Must be a single character";
    if (RESERVED_KEYS.has(key)) return `"${key}" is reserved`;
    if (
      RESERVED_KEYS.has(key.toLowerCase()) ||
      RESERVED_KEYS.has(key.toUpperCase())
    )
      return `"${key}" conflicts with a reserved key`;
    if (usedKeys.has(key)) return `"${key}" is already bound`;
    return null;
  };

  const addBinding = () => {
    const trimName = newName.trim();
    if (!trimName) {
      setError("Tag name is required");
      return;
    }
    if (
      tagBindings.some((b) => b.name.toLowerCase() === trimName.toLowerCase())
    ) {
      setError("Tag name already exists");
      return;
    }
    const keyErr = validateKey(newKey);
    if (keyErr) {
      setError(keyErr);
      return;
    }
    onTagBindingsChange([
      ...tagBindings,
      { key: newKey, name: trimName, color: newColor },
    ]);
    setNewKey("");
    setNewName("");
    setNewColor(
      TAG_COLORS.find(
        (c) => !tagBindings.some((b) => b.color === c) && c !== newColor,
      ) ?? TAG_COLORS[0],
    );
    setError("");
    keyInputRef.current?.focus();
  };

  const removeBinding = (idx: number) => {
    onTagBindingsChange(tagBindings.filter((_, i) => i !== idx));
  };

  const s = {
    label: {
      fontSize: 9,
      letterSpacing: "0.2em",
      color: "#555",
      textTransform: "uppercase" as const,
      marginBottom: 8,
    },
    input: {
      background: "#1a1a1a",
      border: "1px solid #333",
      color: "#e8e8e8",
      padding: "6px 10px",
      borderRadius: 4,
      fontSize: 12,
      fontFamily: "inherit",
      outline: "none",
    },
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#141414",
          border: "1px solid #2a2a2a",
          borderRadius: 8,
          padding: "28px 36px",
          minWidth: 420,
          maxWidth: 520,
          fontFamily: "'DM Mono', 'Courier New', monospace",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.2em",
              color: "#555",
            }}
          >
            SETTINGS
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#555",
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "2px 6px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Auto-save toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 0",
            borderBottom: "1px solid #1e1e1e",
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "#ccc" }}>Auto-save</div>
            <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>
              Save selections automatically after 2s of inactivity
            </div>
          </div>
          <button
            onClick={() => onAutoSaveChange(!autoSave)}
            style={{
              width: 40,
              height: 22,
              borderRadius: 11,
              border: "none",
              background: autoSave ? "#4ade80" : "#333",
              cursor: "pointer",
              position: "relative",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "#fff",
                position: "absolute",
                top: 3,
                left: autoSave ? 21 : 3,
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>

        {/* Tag bindings */}
        <div style={s.label}>TAG KEYBINDINGS</div>

        {tagBindings.length === 0 && (
          <div
            style={{
              fontSize: 11,
              color: "#333",
              padding: "12px 0",
              textAlign: "center",
              letterSpacing: "0.08em",
            }}
          >
            No tags configured. Add one below.
          </div>
        )}

        {tagBindings.map((b, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 0",
              borderBottom: "1px solid #1a1a1a",
            }}
          >
            <div
              style={{
                width: 28,
                height: 24,
                borderRadius: 4,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid #333",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                color: "#aaa",
                fontFamily: "inherit",
              }}
            >
              {b.key}
            </div>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: b.color,
                flexShrink: 0,
              }}
            />
            <div
              style={{
                flex: 1,
                fontSize: 12,
                color: "#ccc",
              }}
            >
              {b.name}
            </div>
            <button
              onClick={() => removeBinding(i)}
              style={{
                background: "transparent",
                border: "1px solid #2a2a2a",
                color: "#555",
                padding: "2px 8px",
                borderRadius: 3,
                fontSize: 10,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ✕
            </button>
          </div>
        ))}

        {/* Add new binding */}
        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
          }}
        >
          <div style={{ width: 44 }}>
            <div style={{ ...s.label, marginBottom: 4 }}>KEY</div>
            <input
              ref={keyInputRef}
              value={newKey}
              maxLength={1}
              onChange={(e) => {
                setNewKey(e.target.value);
                setError("");
              }}
              style={{
                ...s.input,
                width: "100%",
                textAlign: "center",
                boxSizing: "border-box",
              }}
              placeholder="1"
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...s.label, marginBottom: 4 }}>NAME</div>
            <input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addBinding();
                }
              }}
              style={{ ...s.input, width: "100%", boxSizing: "border-box" }}
              placeholder="Dog"
            />
          </div>
          <div>
            <div style={{ ...s.label, marginBottom: 4 }}>COLOR</div>
            <div style={{ display: "flex", gap: 3 }}>
              {TAG_COLORS.slice(0, 5).map((c) => (
                <div
                  key={c}
                  onClick={() => setNewColor(c)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 3,
                    background: c,
                    cursor: "pointer",
                    opacity: newColor === c ? 1 : 0.3,
                    border:
                      newColor === c
                        ? "2px solid #fff"
                        : "2px solid transparent",
                    transition: "opacity 0.1s",
                    boxSizing: "border-box",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
              {TAG_COLORS.slice(5).map((c) => (
                <div
                  key={c}
                  onClick={() => setNewColor(c)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 3,
                    background: c,
                    cursor: "pointer",
                    opacity: newColor === c ? 1 : 0.3,
                    border:
                      newColor === c
                        ? "2px solid #fff"
                        : "2px solid transparent",
                    transition: "opacity 0.1s",
                    boxSizing: "border-box",
                  }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={addBinding}
            style={{
              background: "rgba(74,222,128,0.12)",
              border: "1px solid #4ade80",
              color: "#4ade80",
              padding: "6px 14px",
              borderRadius: 4,
              fontSize: 10,
              letterSpacing: "0.1em",
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: 600,
              alignSelf: "flex-end",
            }}
          >
            ADD
          </button>
        </div>

        {error && (
          <div
            style={{
              fontSize: 10,
              color: "#f87171",
              marginTop: 8,
              letterSpacing: "0.05em",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: 20,
            fontSize: 10,
            color: "#2a2a2a",
            letterSpacing: "0.08em",
            lineHeight: 1.6,
          }}
        >
          Press the bound key while culling to toggle a tag on the current
          photo. Tags are saved alongside picks/rejects.
        </div>
      </div>
    </div>
  );
}
