import { type PropsWithChildren, useEffect } from "react";
import type { Photo } from "../types";

export function SubmitModal({
  photos,
  monthLabel,
  onConfirm,
  onCancel,
  isSaving,
}: PropsWithChildren<{
  photos: Photo[];
  monthLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isSaving: boolean;
}>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isSaving) return;
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onConfirm, onCancel, isSaving]);
  const picks = photos.filter((p) => p.status === "pick");
  const rejects = photos.filter((p) => p.status === "reject");
  const unreviewed = photos.filter((p) => p.status === "unreviewed");
  return (
    <div
      onClick={() => {
        if (!isSaving) onCancel();
      }}
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
          padding: "32px 40px",
          minWidth: 380,
          maxWidth: 480,
          fontFamily: "'DM Mono', 'Courier New', monospace",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.2em",
            color: "#555",
            marginBottom: 8,
          }}
        >
          SAVE SELECTIONS
        </div>
        <div
          style={{
            fontSize: 18,
            color: "#e8e8e8",
            marginBottom: 24,
            fontWeight: 500,
          }}
        >
          {monthLabel}
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          {[
            {
              label: "KEEP",
              count: picks.length,
              color: "#4ade80",
              bg: "rgba(74,222,128,0.08)",
            },
            {
              label: "REJECT",
              count: rejects.length,
              color: "#f87171",
              bg: "rgba(248,113,113,0.08)",
            },
            {
              label: "UNREVIEWED",
              count: unreviewed.length,
              color: "#555",
              bg: "rgba(255,255,255,0.03)",
            },
          ].map(({ label, count, color, bg }) => (
            <div
              key={label}
              style={{
                flex: 1,
                background: bg,
                border: `1px solid ${color}22`,
                borderRadius: 6,
                padding: "12px 0",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 22, color, fontWeight: 600 }}>
                {count}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "#444",
                  letterSpacing: "0.15em",
                  marginTop: 4,
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
        {unreviewed.length > 0 && (
          <div
            style={{
              background: "rgba(251,191,36,0.07)",
              border: "1px solid rgba(251,191,36,0.2)",
              borderRadius: 5,
              padding: "10px 14px",
              fontSize: 11,
              color: "#fbbf24",
              marginBottom: 20,
              letterSpacing: "0.05em",
              lineHeight: 1.5,
            }}
          >
            ⚠ {unreviewed.length} photo{unreviewed.length !== 1 ? "s" : ""}{" "}
            still unreviewed — {unreviewed.length !== 1 ? "they" : "it"} will be
            left uncategorized.
          </div>
        )}
        <div
          style={{
            fontSize: 10,
            color: "#3a3a3a",
            marginBottom: 20,
            letterSpacing: "0.08em",
            lineHeight: 1.6,
          }}
        >
          Prototype only — in production, selections would be persisted to your
          backend here.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={isSaving}
            style={{
              flex: 1,
              background: "transparent",
              border: "1px solid #2a2a2a",
              color: isSaving ? "#333" : "#666",
              padding: "10px 0",
              borderRadius: 4,
              fontSize: 11,
              letterSpacing: "0.12em",
              cursor: isSaving ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            disabled={isSaving}
            style={{
              flex: 2,
              background: isSaving
                ? "rgba(74,222,128,0.06)"
                : "rgba(74,222,128,0.12)",
              border: "1px solid #4ade80",
              color: "#4ade80",
              padding: "10px 0",
              borderRadius: 4,
              fontSize: 11,
              letterSpacing: "0.12em",
              cursor: isSaving ? "default" : "pointer",
              fontFamily: "inherit",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {isSaving ? (
              <>
                <svg
                  viewBox="0 0 16 16"
                  style={{
                    width: 12,
                    height: 12,
                    animation: "spin 1s linear infinite",
                    flexShrink: 0,
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
                SAVING…
              </>
            ) : (
              `SAVE ${picks.length} PICKS`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
