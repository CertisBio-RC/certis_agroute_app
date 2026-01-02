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
  [key: string]: any;
};

type ChannelSummaryRow = {
  retailer: string;
  tripStops: number;
  totalLocations: number;
  agronomyLocations: number;
  suppliers: string[];
  categoryBreakdown: string[];
  states: string[];
};

const STORAGE_KEY = "cad_trip_print_payload_v2";
const APP_STATE_KEY = "cad_app_state_v1";

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

export default function TripPrint(props: {
  basePath: string;

  homeLabel: string;
  homeZip: string;
  homeCoords: [number, number] | null;

  tripStops: TripStopLike[];
  routeLegs: RouteLegRow[];
  routeTotals: TripTotals;

  channelSummaryRows: ChannelSummaryRow[];

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

    const channelSummary = (props.channelSummaryRows || []).map((r) => ({
      retailer: safeStr(r.retailer),
      tripStops: Number(r.tripStops || 0),
      totalLocations: Number(r.totalLocations || 0),
      agronomyLocations: Number(r.agronomyLocations || 0),
      suppliers: Array.isArray(r.suppliers) ? r.suppliers.map(safeStr).filter(Boolean) : [],
      categoryBreakdown: Array.isArray(r.categoryBreakdown) ? r.categoryBreakdown.map(safeStr).filter(Boolean) : [],
      states: Array.isArray(r.states) ? r.states.map(safeStr).filter(Boolean) : [],
    }));

    return {
      v: 2,
      generatedAt: safeStr(props.generatedAt),
      basePath: safeStr(props.basePath),

      home: {
        label: safeStr(props.homeLabel),
        zip: safeStr(props.homeZip),
        coords: props.homeCoords ? [Number(props.homeCoords[0]), Number(props.homeCoords[1])] : null,
      },

      stops,
      legs,
      totals,

      channelSummary,
    };
  }, [
    props.generatedAt,
    props.basePath,
    props.homeLabel,
    props.homeZip,
    props.homeCoords,
    props.tripStops,
    props.routeLegs,
    props.routeTotals,
    props.channelSummaryRows,
  ]);

  const doPrint = () => {
    if (!canPrint) return;

    // 🔒 Persist app state so even if the user navigates back or refreshes,
    // the trip/home/filters are restored.
    try {
      const existing = sessionStorage.getItem(APP_STATE_KEY);
      if (existing) sessionStorage.setItem(APP_STATE_KEY, existing);
    } catch {
      // ignore
    }

    // ✅ Store payload in BOTH localStorage + sessionStorage:
    // - localStorage lets the /print tab read it reliably
    // - sessionStorage keeps it scoped to session as well
    try {
      const json = JSON.stringify(payload);
      localStorage.setItem(STORAGE_KEY, json);
      sessionStorage.setItem(STORAGE_KEY, json);
    } catch {
      // ignore
    }

    const href = `${props.basePath}/print`;

    // ✅ New tab (keeps main app from losing state / reloading)
    const w = window.open(href, "_blank", "noopener,noreferrer");
    if (!w) {
      // Fallback if popup blocked (rare for user-initiated click)
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
          canPrint ? "bg-[#fde047] text-black hover:bg-[#fde047]/90" : "bg-white/10 text-white/40 cursor-not-allowed",
        ].join(" ")}
      >
        Print / Save as PDF
      </button>

      <div className="mt-2 text-[12px] text-white/70 leading-snug">
        Opens an ink-safe print view in a <span className="font-semibold text-white/90">new tab</span>. Your trip stays loaded here.
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

export { STORAGE_KEY, APP_STATE_KEY };
