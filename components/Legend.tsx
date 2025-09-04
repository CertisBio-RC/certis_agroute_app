// /components/Legend.tsx
"use client";

import React, { useMemo, useState } from "react";
import { colorForRetailer, iconUrlCandidates } from "@/utils/retailerStyles";

export interface LegendItemInput {
  retailer: string;
  sampleName?: string;
  sampleCity?: string;
}

interface LegendProps {
  items: LegendItemInput[];
  selectedRetailer?: string;
  onSelect?: (retailer: string | null) => void;
  className?: string;
}

export default function Legend({
  items,
  selectedRetailer,
  onSelect,
  className = "",
}: LegendProps) {
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const arr = s
      ? items.filter((it) => it.retailer.toLowerCase().includes(s))
      : items.slice();
    return arr.sort((a, b) => a.retailer.localeCompare(b.retailer));
  }, [items, q]);

  return (
    <div
      className={[
        "pointer-events-auto select-none",
        "w-80 max-w-[86vw] rounded-2xl border border-gray-200 bg-white/95 shadow backdrop-blur",
        "text-gray-800",
        className,
      ].join(" ")}
      role="region"
      aria-label="Legend"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50"
          aria-expanded={open}
          aria-controls="legend-panel"
        >
          {open ? "Hide" : "Show"} Legend
        </button>

        <input
          type="search"
          placeholder="Search retailers…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="ml-auto w-40 rounded-md border border-gray-300 px-2 py-1 text-xs"
        />
      </div>

      {open && (
        <>
          <div className="px-3 pb-2 text-[11px] text-gray-600">
            Click a retailer to filter.{" "}
            <button
              className="ml-1 underline decoration-1 underline-offset-2 hover:text-gray-800"
              onClick={() => onSelect?.(null)}
            >
              Clear
            </button>
          </div>

          <ul
            id="legend-panel"
            className="grid max-h-[50vh] grid-cols-1 gap-2 overflow-auto px-3 pb-3"
          >
            {filtered.map((it) => (
              <LegendRow
                key={it.retailer}
                item={it}
                active={selectedRetailer === it.retailer}
                onClick={() =>
                  onSelect?.(
                    selectedRetailer === it.retailer ? null : it.retailer
                  )
                }
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function LegendRow({
  item,
  active,
  onClick,
}: {
  item: LegendItemInput;
  active: boolean;
  onClick: () => void;
}) {
  const { retailer, sampleName, sampleCity } = item;
  const color = colorForRetailer(retailer);
  const candidates = iconUrlCandidates(retailer, sampleName, sampleCity);

  return (
    <li>
      <button
        onClick={onClick}
        className={[
          "flex w-full items-center gap-3 rounded-xl border px-2 py-2 text-left text-sm",
          active
            ? "border-blue-500 bg-blue-50"
            : "border-gray-200 hover:bg-gray-50",
        ].join(" ")}
      >
        <IconOrColor candidates={candidates} color={color} label={retailer} />
        <span className="truncate">{retailer}</span>
      </button>
    </li>
  );
}

function IconOrColor({
  candidates,
  color,
  label,
}: {
  candidates: string[];
  color: string;
  label: string;
}) {
  const [idx, setIdx] = useState(0);
  const hasMore = idx < candidates.length;

  if (hasMore) {
    return (
      <img
        src={candidates[idx]}
        alt={`${label} logo`}
        width={28}
        height={28}
        style={{ width: 28, height: 28, borderRadius: 9999, objectFit: "contain" }}
        onError={() => setIdx((i) => i + 1)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-block h-7 w-7 rounded-full border-2 border-white shadow"
      style={{ background: color }}
      title={`${label} (color)`}
    />
  );
}
