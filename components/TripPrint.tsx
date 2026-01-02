"use client";

import React, { useMemo, useState } from "react";

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
  [key: string]: any;
};

type RetailSummaryLike = {
  retailer: string;
  tripStops: number;
  totalLocations: number;
  agronomyLocations: number;
  suppliers: string[];
  categoryBreakdown: string[];
  states: string[];
};

export const STORAGE_KEY = "cad_trip_print_payload_v1";
const LAST_PID_KEY = "cad_trip_print_last_pid_v1";

export function storageKeyForPid(pid: string) {
  return `${STORAGE_KEY}:${pid}`;
}

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

function makePid() {
  const r = Math.random().toString(16).slice(2);
  return `${Date.now()}_${r}`;
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
  retailSummaries: RetailSummaryLike[];
}) {
  const canPrint = props.tripStops.length >= 1;
  const [hint, setHint] = useState<string>("");

  const cardClass =
    "rounded-xl border ring-1 backdrop-blur-sm p-3 " +
    "bg-[linear-gradient(180deg,rgba(59,130,246,0.14),rgba(8,20,45,0.12))] " +
    "border-[color:rgba(165,243,252,0.16)] ring-[color:rgba(147,197,253,0.10)] " +
    "shadow-[0_14px_30px_rgba(0,0,0,0.45)]";

  const payloadBase = useMemo(() => {
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

    const retailSummaries = (props.retailSummaries || []).map((r) => ({
      retailer: safeStr(r.retailer),
      tripStops: Number(r.tripStops || 0),
      totalLocations: Number(r.totalLocations || 0),
      agronomyLocations: Number(r.agronomyLocations || 0),
      states: Array.isArray(r.states) ? r.states.map(safeStr).filter(Boolean) : [],
      suppliers: Array.isArray(r.suppliers) ? r.suppliers.map(safeStr).filter(Boolean) : [],
      categoryBreakdown: Array.isArray(r.categoryBreakdown) ? r.categoryBreakdown.map(safeStr).filter(Boolean) : [],
    }));

    return {
      v: 2, // bumped because we added retailSummaries + pid storage
      generatedAt: props.generatedAt,
      home: {
        label: safeStr(props.homeLabel),
        zip: safeStr(props.homeZip),
        coords: props.homeCoords ? [Number(props.homeCoords[0]), Number(props.homeCoords[1])] : null,
      },
      stops,
      legs,
      totals,
      retailSummaries,
    };
  }, [
    props.generatedAt,
    props.homeLabel,
    props.homeZip,
    props.homeCoords,
    props.tripStops,
    props.routeLegs,
    props.routeTotals,
    props.retailSummaries,
  ]);

  const doPrint = () => {
    if (!canPrint) return;

    setHint("");

    const pid = makePid();
    const key = storageKeyForPid(pid);

    try {
      localStorage.setItem(key, JSON.stringify(payloadBase));
      localStorage.setItem(LAST_PID_KEY, pid);
    } catch (e) {
      // If localStorage fails, we fall back to same-tab sessionStorage.
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...payloadBase, v: 1 }));
      } catch {
        // ignore
      }
    }

    const href = `${props.basePath}/print?pid=${encodeURIComponent(pid)}`;

    // ✅ Prefer opening a new tab to preserve the main app state.
    // This works because we use localStorage (shared), not sessionStorage.
    const w = window.open(href, "_blank", "noopener,noreferrer");
    if (!w) {
      // Popup blocked: fall back to same tab
      setHint("Popup blocked — opening print view in this tab. (Tip: allow popups for this site.)");
      window.location.assign(href);
    }
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
        Opens an <span className="font-semibold text-white/90">ink-safe</span> print view in a new tab (main app stays intact). Choose{" "}
        <span className="font-semibold text-white/90">Save as PDF</span>.
      </div>

      {hint && <div className="mt-2 text-[11px] text-yellow-200">{hint}</div>}

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
