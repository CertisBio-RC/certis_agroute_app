"use client";

import React, { useMemo } from "react";

type RouteLegRow = {
  fromLabel: string;
  toLabel: string;
  distanceMeters: number;
  durationSeconds: number;
};

type TripTotals = { distanceMeters: number; durationSeconds: number } | null;

type TripStopLike = {
  id?: string;
  label?: string;
  retailer?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  kind?: string; // "retailer" | "hq" | "kingpin" etc
  email?: string;
  phoneOffice?: string;
  phoneCell?: string;
  // allow any extra fields without TS drama
  [key: string]: any;
};

const STORAGE_KEY = "cad_trip_print_payload_v1";

function metersToMiles(m: number) {
  return m / 1609.344;
}
function formatMiles(meters: number) {
  const mi = metersToMiles(meters);
  if (!isFinite(mi)) return "—";
  if (mi < 0.1) return "<0.1 mi";
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${mi.toFixed(0)} mi`;
}
function formatMinutes(seconds: number) {
  const min = seconds / 60;
  if (!isFinite(min)) return "—";
  if (min < 1) return "<1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const r = Math.round(min - h * 60);
  return `${h}h ${r}m`;
}

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function stopSubtitle(st: TripStopLike) {
  const city = safeStr(st.city);
  const state = safeStr(st.state);
  const zip = safeStr(st.zip);
  const kind = safeStr(st.kind);
  const parts: string[] = [];
  const loc = [city, state].filter(Boolean).join(", ");
  if (loc) parts.push(loc);
  if (zip) parts.push(zip);
  if (kind) parts.push(kind);
  return parts.join(" • ");
}

export default function TripPrint(props: {
  basePath: string;
  homeLabel: string;
  homeZip: string;
  homeCoords: [number, number] | null;
  tripStops: TripStopLike[];
  routeLegs: RouteLegRow[];
  routeTotals: TripTotals;
  generatedAt: string;
}) {
  const canPrint = props.tripStops.length >= 1;

  const cardClass =
    "rounded-xl border ring-1 backdrop-blur-sm p-3 " +
    "bg-[linear-gradient(180deg,rgba(59,130,246,0.14),rgba(8,20,45,0.12))] " +
    "border-[color:rgba(165,243,252,0.16)] ring-[color:rgba(147,197,253,0.10)] " +
    "shadow-[0_14px_30px_rgba(0,0,0,0.45)]";

  const payload = useMemo(() => {
    const stops = props.tripStops.map((s, idx) => ({
      idx: idx + 1,
      id: safeStr(s.id),
      label: safeStr(s.label),
      retailer: safeStr(s.retailer),
      name: safeStr(s.name),
      address: safeStr(s.address),
      city: safeStr(s.city),
      state: safeStr(s.state),
      zip: safeStr(s.zip),
      kind: safeStr(s.kind),
      email: safeStr(s.email),
      phoneOffice: safeStr(s.phoneOffice),
      phoneCell: safeStr(s.phoneCell),
    }));

    const legs = (props.routeLegs || []).map((l) => ({
      fromLabel: safeStr(l.fromLabel),
      toLabel: safeStr(l.toLabel),
      distanceMeters: Number(l.distanceMeters || 0),
      durationSeconds: Number(l.durationSeconds || 0),
    }));

    const totals = props.routeTotals
      ? {
          distanceMeters: Number(props.routeTotals.distanceMeters || 0),
          durationSeconds: Number(props.routeTotals.durationSeconds || 0),
        }
      : null;

    return {
      v: 1,
      generatedAt: props.generatedAt,
      home: {
        label: safeStr(props.homeLabel),
        zip: safeStr(props.homeZip),
        coords: props.homeCoords ? [Number(props.homeCoords[0]), Number(props.homeCoords[1])] : null,
      },
      stops,
      legs,
      totals,
    };
  }, [
    props.generatedAt,
    props.homeLabel,
    props.homeZip,
    props.homeCoords,
    props.tripStops,
    props.routeLegs,
    props.routeTotals,
  ]);

  const doPrint = () => {
    if (!canPrint) return;

    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // If sessionStorage fails (rare), we still attempt to navigate.
    }

    // ✅ NOT A POPUP: same-tab navigation to /print
    // Use basePath to be safe on GitHub Pages.
    const href = `${props.basePath}/print`;
    window.location.assign(href);
  };

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold leading-tight text-yellow-300">Print Trip (PDF)</div>
        <div className="text-[11px] text-white/60 whitespace-nowrap">{canPrint ? "Ready" : "Add ≥ 1 stop"}</div>
      </div>

      <button
        type="button"
        onClick={doPrint}
        disabled={!canPrint}
        className={[
          "mt-2 w-full rounded-xl px-4 py-2 text-sm font-extrabold",
          canPrint
            ? "bg-[#fde047] text-black hover:bg-[#fde047]/90"
            : "bg-white/10 text-white/40 cursor-not-allowed",
        ].join(" ")}
      >
        Print / Save as PDF
      </button>

      <div className="mt-2 text-[12px] text-white/70 leading-snug">
        Opens a clean print view in this tab (not blocked by Chrome). Choose <span className="font-semibold text-white/90">Save as PDF</span>.
      </div>

      {props.routeTotals && (
        <div className="mt-2 text-[11px] text-white/60">
          Route total (if legs available):{" "}
          <span className="text-white/80 font-semibold">
            {formatMiles(props.routeTotals.distanceMeters)} • {formatMinutes(props.routeTotals.durationSeconds)}
          </span>
        </div>
      )}
    </div>
  );
}

export { STORAGE_KEY };
