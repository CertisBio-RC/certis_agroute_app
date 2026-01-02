"use client";

import React, { useEffect, useMemo, useState } from "react";
import { STORAGE_KEY } from "../../components/TripPrint";

type PrintStop = {
  idx: number;
  id: string;
  label: string;
  retailer: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  kind: string;
  email: string;
  phoneOffice: string;
  phoneCell: string;
};

type PrintLeg = {
  fromLabel: string;
  toLabel: string;
  distanceMeters: number;
  durationSeconds: number;
};

type PrintTotals = { distanceMeters: number; durationSeconds: number } | null;

type PrintRetailSummaryRow = {
  retailer: string;
  tripCount: number; // locations in current trip
  totalCount: number; // total locations in dataset (for that retailer)
  agronomyLocations: number;
  states: string[];
  categoryBreakdown: Record<string, number>;
  suppliers: string[];
};

type PrintPayload = {
  v: number;
  generatedAt: string;
  home: { label: string; zip: string; coords: [number, number] | null };
  stops: PrintStop[];
  legs: PrintLeg[];
  totals: PrintTotals;
  retailSummaries?: PrintRetailSummaryRow[];
};

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
function safeArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function safeObj(v: any) {
  return v && typeof v === "object" ? v : {};
}

function normalizePayload(raw: any): PrintPayload | null {
  const obj = safeObj(raw);
  if (safeNum(obj.v, -1) !== 1) return null;

  const homeObj = safeObj(obj.home);
  const coordsRaw = homeObj.coords;
  const coords =
    Array.isArray(coordsRaw) && coordsRaw.length === 2
      ? ([safeNum(coordsRaw[0]), safeNum(coordsRaw[1])] as [number, number])
      : null;

  const stops = safeArray(obj.stops).map((s: any, i: number) => {
    const so = safeObj(s);
    return {
      idx: safeNum(so.idx, i + 1),
      id: safeStr(so.id),
      label: safeStr(so.label),
      retailer: safeStr(so.retailer),
      name: safeStr(so.name),
      address: safeStr(so.address),
      city: safeStr(so.city),
      state: safeStr(so.state),
      zip: safeStr(so.zip),
      kind: safeStr(so.kind),
      email: safeStr(so.email),
      phoneOffice: safeStr(so.phoneOffice),
      phoneCell: safeStr(so.phoneCell),
    } satisfies PrintStop;
  });

  const legs = safeArray(obj.legs).map((l: any) => {
    const lo = safeObj(l);
    return {
      fromLabel: safeStr(lo.fromLabel),
      toLabel: safeStr(lo.toLabel),
      distanceMeters: safeNum(lo.distanceMeters, 0),
      durationSeconds: safeNum(lo.durationSeconds, 0),
    } satisfies PrintLeg;
  });

  const totalsRaw = obj.totals;
  const totals: PrintTotals =
    totalsRaw && typeof totalsRaw === "object"
      ? {
          distanceMeters: safeNum(totalsRaw.distanceMeters, 0),
          durationSeconds: safeNum(totalsRaw.durationSeconds, 0),
        }
      : null;

  const retailSummariesRaw = safeArray(obj.retailSummaries);
  const retailSummaries = retailSummariesRaw.length
    ? retailSummariesRaw.map((r: any) => {
        const ro = safeObj(r);
        const catObj = safeObj(ro.categoryBreakdown);
        const categoryBreakdown: Record<string, number> = {};
        for (const [k, v] of Object.entries(catObj)) {
          const key = safeStr(k);
          if (!key) continue;
          categoryBreakdown[key] = safeNum(v, 0);
        }

        return {
          retailer: safeStr(ro.retailer),
          tripCount: safeNum(ro.tripCount, 0),
          totalCount: safeNum(ro.totalCount, 0),
          agronomyLocations: safeNum(ro.agronomyLocations, 0),
          states: safeArray(ro.states).map((x) => safeStr(x)).filter(Boolean),
          categoryBreakdown,
          suppliers: safeArray(ro.suppliers).map((x) => safeStr(x)).filter(Boolean),
        } satisfies PrintRetailSummaryRow;
      })
    : undefined;

  return {
    v: 1,
    generatedAt: safeStr(obj.generatedAt),
    home: {
      label: safeStr(homeObj.label),
      zip: safeStr(homeObj.zip),
      coords,
    },
    stops,
    legs,
    totals,
    retailSummaries,
  };
}

export default function PrintPage() {
  const [payload, setPayload] = useState<PrintPayload | null>(null);
  const [err, setErr] = useState<string>("");

  const basePath = useMemo(() => {
    const bp = (process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app").trim();
    return bp || "/certis_agroute_app";
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setErr("No trip payload found. Go back and click Print Trip (PDF) from a built trip.");
        return;
      }
      const parsed = JSON.parse(raw);
      const normalized = normalizePayload(parsed);
      if (!normalized) {
        setErr("Trip payload is missing or incompatible. Go back and click Print Trip (PDF) again.");
        return;
      }
      setPayload(normalized);

      // Auto-open print dialog shortly after render (works in most browsers).
      // If a browser blocks it, the manual Print button still works.
      window.setTimeout(() => {
        try {
          window.print();
        } catch {
          // ignore
        }
      }, 350);
    } catch (e: any) {
      setErr(`Failed to load trip payload: ${String(e?.message || e)}`);
    }
  }, []);

  const backToApp = () => {
    // If we were opened in a new tab, closing is the best UX.
    // If the browser blocks close, fallback to basePath.
    try {
      window.close();
    } catch {
      // ignore
    }
    window.setTimeout(() => {
      if (window.history.length > 1) window.history.back();
      else window.location.assign(`${basePath}/`);
    }, 50);
  };

  const printNow = () => {
    try {
      window.print();
    } catch {
      // ignore
    }
  };

  const PageShell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-white text-black">
      {/* INK-SAFE PRINT OVERRIDES */}
      <style>{`
        @media print {
          .no-print { display: none !important; }

          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* Nuke dark UI artifacts + gradients/shadows */
          * {
            background: transparent !important;
            box-shadow: none !important;
            text-shadow: none !important;
            filter: none !important;
          }

          /* Ensure cards remain readable */
          .print-card {
            border: 1px solid #000000 !important;
            background: #ffffff !important;
            color: #000000 !important;
          }

          /* Common muted classes become black in print */
          .text-gray-500, .text-gray-600, .text-gray-700 {
            color: #000000 !important;
          }

          a {
            color: #000000 !important;
            text-decoration: underline;
          }
        }
      `}</style>

      <div className="no-print border-b border-gray-200 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <button
            onClick={backToApp}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-sm font-semibold"
          >
            ← Back
          </button>
          <button
            onClick={printNow}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-sm font-semibold"
          >
            Print / Save as PDF
          </button>
          <div className="ml-auto text-sm text-gray-600">CERTIS AgRoute Database — Trip Print</div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">{children}</div>
    </div>
  );

  if (err) {
    return (
      <PageShell>
        <h1 className="text-2xl font-extrabold mb-2">Trip Print</h1>
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{err}</div>
      </PageShell>
    );
  }

  if (!payload) {
    return (
      <PageShell>
        <h1 className="text-2xl font-extrabold mb-2">Trip Print</h1>
        <div className="text-sm text-gray-600">Loading…</div>
      </PageShell>
    );
  }

  const title = "Trip Itinerary";
  const generated = safeStr(payload.generatedAt);

  return (
    <PageShell>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold leading-tight">{title}</h1>
          <div className="text-sm text-gray-600 mt-1">
            Generated: <span className="font-semibold">{generated}</span>
          </div>
        </div>
        <div className="text-sm text-gray-700 text-right">
          <div className="font-semibold">{safeStr(payload.home.label) || "Home"}</div>
          <div className="text-gray-600">{payload.home.zip ? `ZIP ${payload.home.zip}` : ""}</div>
        </div>
      </div>

      {/* ✅ DISTANCES FIRST */}
      <div className="mt-5">
        <h2 className="text-xl font-extrabold mb-2">Distances & Times</h2>

        {payload.totals ? (
          <div className="text-sm text-gray-700 mb-3">
            <span className="font-semibold">Total:</span>{" "}
            {formatMiles(payload.totals.distanceMeters)} • {formatMinutes(payload.totals.durationSeconds)}
          </div>
        ) : (
          <div className="text-sm text-gray-500 mb-3">Totals unavailable (route legs not computed).</div>
        )}

        {payload.legs.length ? (
          <div className="space-y-2">
            {payload.legs.map((l, i) => (
              <div key={`${i}-${l.fromLabel}-${l.toLabel}`} className="print-card rounded-xl p-3">
                <div className="text-sm font-semibold">
                  {l.fromLabel} → {l.toLabel}
                </div>
                <div className="text-sm text-gray-700 mt-1">
                  {formatMiles(l.distanceMeters)} • {formatMinutes(l.durationSeconds)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">No route legs available.</div>
        )}
      </div>

      {/* ✅ STOPS SECOND */}
      <div className="mt-6">
        <h2 className="text-xl font-extrabold mb-2">Stops</h2>
        <div className="space-y-3">
          {payload.stops.map((s) => (
            <div key={s.id || String(s.idx)} className="print-card rounded-xl p-4">
              <div className="text-lg font-extrabold">
                {s.idx}. {s.label || "Stop"}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {[s.city, s.state].filter(Boolean).join(", ")} {s.zip ? s.zip : ""}{s.kind ? ` • ${s.kind}` : ""}
              </div>

              {(s.retailer || s.name) && (
                <div className="text-sm mt-2">
                  {s.retailer && (
                    <div>
                      <span className="font-semibold">Retailer:</span> {s.retailer}
                    </div>
                  )}
                  {s.name && (
                    <div>
                      <span className="font-semibold">Contact:</span> {s.name}
                    </div>
                  )}
                </div>
              )}

              {s.address && (
                <div className="text-sm mt-2">
                  <span className="font-semibold">Address:</span> {s.address}
                </div>
              )}

              {(s.phoneOffice || s.phoneCell || s.email) && (
                <div className="text-sm mt-2">
                  {s.phoneOffice && (
                    <div>
                      <span className="font-semibold">Office:</span> {s.phoneOffice}
                    </div>
                  )}
                  {s.phoneCell && (
                    <div>
                      <span className="font-semibold">Cell:</span> {s.phoneCell}
                    </div>
                  )}
                  {s.email && (
                    <div>
                      <span className="font-semibold">Email:</span> {s.email}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ✅ RETAIL SUMMARY (optional) */}
      <div className="mt-6">
        <h2 className="text-xl font-extrabold mb-2">Retail Summary</h2>

        {payload.retailSummaries?.length ? (
          <div className="space-y-3">
            {payload.retailSummaries.map((r) => {
              const states = r.states?.length ? r.states.join(", ") : "—";
              const suppliers = r.suppliers?.length ? r.suppliers.join(", ") : "—";

              const categoryEntries = Object.entries(r.categoryBreakdown || {}).sort((a, b) =>
                a[0].localeCompare(b[0]),
              );
              const categoryLine = categoryEntries.length
                ? categoryEntries.map(([k, v]) => `${k} (${v})`).join(", ")
                : "—";

              return (
                <div key={r.retailer} className="print-card rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-lg font-extrabold">{r.retailer || "Retailer"}</div>
                    <div className="text-sm text-gray-700">
                      <span className="font-semibold">Trip:</span> {r.tripCount} •{" "}
                      <span className="font-semibold">Total:</span> {r.totalCount}
                    </div>
                  </div>

                  <div className="text-sm mt-2">
                    <div>
                      <span className="font-semibold">Agronomy locations:</span> {r.agronomyLocations}
                    </div>
                    <div>
                      <span className="font-semibold">States:</span> {states}
                    </div>
                    <div>
                      <span className="font-semibold">Category breakdown:</span> {categoryLine}
                    </div>
                    <div>
                      <span className="font-semibold">Suppliers:</span> {suppliers}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-gray-600">
            Retail Summary not available for this printout (not included in the print payload yet).
          </div>
        )}
      </div>

      <div className="mt-8 text-xs text-gray-500">CERTIS AgRoute Database — Print view (map excluded by design).</div>
    </PageShell>
  );
}
