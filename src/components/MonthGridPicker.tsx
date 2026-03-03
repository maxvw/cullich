import type { Direction, Month, IndexedMonth } from "../types";
import { useState, useEffect, type PropsWithChildren } from "react";

const ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function MonthGridPicker({
  months,
  selectedMonthIdx,
  onSelect,
}: PropsWithChildren<{
  months: Month[];
  selectedMonthIdx: number;
  onSelect: (month: Month, index: number) => void;
}>) {
  const byYear: { [index: number]: IndexedMonth[] } = {};
  months.forEach((m, idx) => {
    if (!byYear[m.year]) byYear[m.year] = [];
    byYear[m.year].push({ ...m, idx });
  });
  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => a - b);
  const selectedMonth = months[selectedMonthIdx];
  const [activeYear, setActiveYear] = useState(
    () => selectedMonth?.year ?? years[years.length - 1],
  );
  const [animDir, setAnimDir] = useState<Direction>(null);
  const [visible, setVisible] = useState(true);

  // When the selected month changes externally (e.g. URL restore), sync the active year
  useEffect(() => {
    if (selectedMonth?.year && selectedMonth.year !== activeYear) {
      setActiveYear(selectedMonth.year);
    }
  }, [selectedMonth?.year]);

  const switchYear = (year: number) => {
    if (year === activeYear) return;
    const dir = year > activeYear ? "right" : "left";
    setAnimDir(dir);
    setVisible(false);
    setTimeout(() => {
      setActiveYear(year);
      setAnimDir(dir === "right" ? "left" : "right");
      setVisible(true);
    }, 150);
  };

  const grid = Array.from(
    { length: 12 },
    (_, mi) =>
      (byYear[activeYear] || []).find((m) => m.month === mi + 1) || null, // m.month is 1-indexed
  );
  const monthsInYear = (byYear[activeYear] || []).length;
  const yearIdx = years.indexOf(activeYear);

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        background: "#141414",
        border: "1px solid #2a2a2a",
        borderRadius: 8,
        zIndex: 50,
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        width: 224,
        overflow: "hidden",
        fontFamily: "'DM Mono', 'Courier New', monospace",
      }}
    >
      {/* Year nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid #1e1e1e",
          padding: "0 4px",
        }}
      >
        <button
          onClick={() => yearIdx > 0 && switchYear(years[yearIdx - 1])}
          disabled={yearIdx === 0}
          style={{
            background: "none",
            border: "none",
            color: yearIdx === 0 ? "#2a2a2a" : "#666",
            cursor: yearIdx === 0 ? "default" : "pointer",
            fontSize: 14,
            padding: "8px 6px",
            fontFamily: "inherit",
          }}
        >
          ‹
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <span
            style={{ fontSize: 13, color: "#e8e8e8", letterSpacing: "0.08em" }}
          >
            {activeYear}
          </span>
          <span style={{ fontSize: 9, color: "#444", marginLeft: 6 }}>
            {monthsInYear}mo
          </span>
        </div>
        <button
          onClick={() =>
            yearIdx < years.length - 1 && switchYear(years[yearIdx + 1])
          }
          disabled={yearIdx === years.length - 1}
          style={{
            background: "none",
            border: "none",
            color: yearIdx === years.length - 1 ? "#2a2a2a" : "#666",
            cursor: yearIdx === years.length - 1 ? "default" : "pointer",
            fontSize: 14,
            padding: "8px 6px",
            fontFamily: "inherit",
          }}
        >
          ›
        </button>
      </div>

      {/* Year dots */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 5,
          padding: "7px 8px 5px",
          borderBottom: "1px solid #1a1a1a",
          flexWrap: "wrap",
        }}
      >
        {years.map((y) => (
          <div
            key={y}
            onClick={() => switchYear(y)}
            title={String(y)}
            style={{
              width: y === activeYear ? 18 : 6,
              height: 6,
              borderRadius: 3,
              background: y === activeYear ? "#4ade80" : "#2a2a2a",
              cursor: "pointer",
              transition: "width 0.2s ease, background 0.2s ease",
              flexShrink: 0,
            }}
          />
        ))}
      </div>

      {/* Month grid */}
      <div
        style={{
          padding: "10px 10px 12px",
          opacity: visible ? 1 : 0,
          transform: visible
            ? "translateX(0)"
            : animDir === "right"
              ? "translateX(12px)"
              : "translateX(-12px)",
          transition: "opacity 0.15s ease, transform 0.15s ease",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 4,
          }}
        >
          {grid.map((m, mi) => {
            const isSelected = m && m.idx === selectedMonthIdx;
            const hasPhotos = m !== null;
            return (
              <div
                key={mi}
                onClick={() => hasPhotos && onSelect(m, m.idx)}
                title={hasPhotos ? `${m.count} photos` : undefined}
                style={{
                  padding: "7px 2px 5px",
                  borderRadius: 4,
                  textAlign: "center",
                  fontSize: 11,
                  cursor: hasPhotos ? "pointer" : "default",
                  background: isSelected
                    ? "rgba(74,222,128,0.15)"
                    : hasPhotos
                      ? "rgba(255,255,255,0.03)"
                      : "transparent",
                  border: isSelected
                    ? "1px solid rgba(74,222,128,0.4)"
                    : hasPhotos
                      ? "1px solid #1e1e1e"
                      : "1px solid transparent",
                  color: isSelected
                    ? "#4ade80"
                    : hasPhotos
                      ? "#aaa"
                      : "#282828",
                  transition: "background 0.1s, color 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (hasPhotos && !isSelected) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                    e.currentTarget.style.color = "#e8e8e8";
                  }
                }}
                onMouseLeave={(e) => {
                  if (hasPhotos && !isSelected) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                    e.currentTarget.style.color = "#aaa";
                  }
                }}
              >
                <div>{ABBR[mi]}</div>
                <div
                  style={{
                    fontSize: 8,
                    color: isSelected ? "rgba(74,222,128,0.6)" : "#383838",
                    marginTop: 2,
                  }}
                >
                  {hasPhotos ? m.count : "·"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
