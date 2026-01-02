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

type RetailSummaryLike = {
  retailer?: string;
  tripCount?: number;
  totalCount?: number;
  agronomyLocations?: number;
  states?: string[];
  categoryBreakdown?: Record<string, number>;
  suppliers?: string[];
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
function safeNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function safeArr(v: any) {
  return Array.isArray(v) ? v : [];
}
function safeObj(v: any) {
  return v && typeof v === "object" ? v : {};
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
  retailSummaries?: RetailSummaryLike[]; // ✅ optional (won't break page.tsx)
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
      distanceMeters: safeNum(l.distanceMeters, 0),
      durationSeconds: safeNum(l.durationSeconds, 0),
    }));

    const totals = props.routeTotals
      ? {
          distanceMeters: safeNum(props.routeTotals.distanceMeters, 0),
          durationSeconds: safeNum(props.routeTotals.durationSeconds, 0),
        }
      : null;

    const retailSummaries = (props.retailSummaries || []).map((r) => {
      const ro = safeObj(r);
      const catRaw = safeObj(ro.categoryBreakdown);
      const categoryBreakdown: Record<string, number> = {};
      for (const [k, v] of Object.entries(catRaw)) {
        const kk = safeStr(k);
        if (!kk) continue;
        categoryBreakdown[kk] = safeNum(v, 0);
      }

      return {
        retailer: safeStr(ro.retailer),
        tripCount: safeNum(ro.tripCount, 0),
        totalCount: safeNum(ro.totalCount, 0),
        agronomyLocations: safeNum(ro.agronomyLocations, 0),
        states: safeArr(ro.states).map((x: any) => safeStr(x)).filter(Boolean),
        categoryBreakdown,
        suppliers: safeArr(ro.suppliers).map((x: any) => safeStr(x)).filter(Boolean),
      };
    });

    return {
      v: 1,
      generatedAt: safeStr(props.generatedAt),
      home: {
        label: safeStr(props.homeLabel),
        zip: safeStr(props.homeZip),
        coords: props.homeCoords ? [safeNum(props.homeCoords[0]), safeNum(props.homeCoords[1])] : null,
      },
      stops,
      legs,
      totals,
      retailSummaries: retailSummaries.length ? retailSummaries : undefined,
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

  const openInNewTab = (href: string) => {
    // Best effort: open a new tab without triggering popup blockers.
    // 1) Try window.open (allowed inside user click in most cases).
    // 2) Fallback to an <a target="_blank"> click.
    // 3) Final fallback: same-tab navigation.
    try {
      const w = window.open(href, "_blank", "noopener,noreferrer");
      if (w) return true;
    } catch {
      // ignore
    }

    try {
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch {
      // ignore
    }

    return false;
  };

  const doPrint = () => {
    if (!canPrint) return;

    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // If sessionStorage fails (rare), we still attempt to navigate.
    }

    const href = `${props.basePath}/print`;

    // ✅ Keep the app intact: open print in a new tab so you don't lose the built trip.
    const ok = openInNewTab(href);

    // If the browser blocked everything, fall back to same-tab.
    if (!ok) window.location.assign(href);
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
        Opens a clean <span className="font-semibold text-white/90">print tab</span> so your built trip stays intact. Choose{" "}
        <span className="font-semibold text-white/90">Save as PDF</span>.
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
export type { RetailSummaryLike };
