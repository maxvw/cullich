import type { PropsWithChildren } from "react";
import type { Photo } from "../types";

export function UnsavedModal({
  pendingLabel,
  onConfirm,
  onCancel,
}: PropsWithChildren<{
  pendingLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}>) {
  return (
    <div
      onClick={onCancel}
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
          minWidth: 340,
          fontFamily: "'DM Mono', 'Courier New', monospace",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.2em",
            color: "#fbbf24",
            marginBottom: 10,
          }}
        >
          ⚠ UNSAVED SELECTIONS
        </div>
        <div style={{ fontSize: 14, color: "#e8e8e8", marginBottom: 8 }}>
          You have unsaved picks for this month.
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#555",
            marginBottom: 24,
            lineHeight: 1.6,
          }}
        >
          Switching to <span style={{ color: "#aaa" }}>{pendingLabel}</span>{" "}
          will discard your current selections. They are not persisted.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              background: "transparent",
              border: "1px solid #2a2a2a",
              color: "#666",
              padding: "10px 0",
              borderRadius: 4,
              fontSize: 11,
              letterSpacing: "0.12em",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            STAY
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 2,
              background: "rgba(248,113,113,0.1)",
              border: "1px solid #f87171",
              color: "#f87171",
              padding: "10px 0",
              borderRadius: 4,
              fontSize: 11,
              letterSpacing: "0.12em",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            DISCARD & SWITCH
          </button>
        </div>
      </div>
    </div>
  );
}
