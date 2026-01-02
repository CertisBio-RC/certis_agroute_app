"use client";

import React, { useEffect, useMemo, useState } from "react";
import { STORAGE_KEY, storageKeyForPid } from "../../components/TripPrint";

type PrintPayload = {
  v: number;
  generatedAt: string;
  home: { label: string; zip: string; coords: [number, number] | null };
  stops: Array<{
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
  }>;
  legs: Array<{
    fromLabel: string;
    toLabel: string;
    distanceMeters: number;
    durationSeconds: number;
  }>;
  totals: { distanceMeters: number; durationSeconds: number } | null;
  retailSummaries?: Array<{
    retailer: string;
    tripStops: number;
    totalLocations: number;
    agronomyLocations: number;
    states: string[];
    suppliers: string[];
    categoryBreakdown: string[];
  }>;
};

const LAST_PID_KEY = "cad_trip_print_last_pid_v1";

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

function safe(s: any) {
  return String(s ?? "").trim();
}

function getPidFromUrl() {
  try {
    const u = new URL(window.location.href);
    return (u.searchParams.get("pid") || "").trim();
  } catch {
    return "";
  }
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
      const pidFromUrl = getPidFromUrl();
      const pidFromLast = safe(localStorage.getItem(LAST_PID_KEY));
      const pid = pidFromUrl || pidFromLast;

      // 1) Preferred: localStorage payload by pid
      if (pid) {
        const key = storageKeyForPid(pid);
        const raw = localStorage.getItem(key);
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj && (obj.v === 2 || obj.v === 1)) {
            setPayload(obj as PrintPayload);

            window.setTimeout(() => {
              try {
                window.print();
              } catch {
                // ignore
              }
            }, 250);
            return;
          }
        }
      }

      // 2) Fallback: legacy sessionStorage
      const rawLegacy = sessionStorage.getItem(STORAGE_KEY);
      if (rawLegacy) {
        const obj = JSON.parse(rawLegacy);
        if (obj && (obj.v === 1 || obj.v === 2)) {
          setPayload(obj as PrintPayload);

          window.setTimeout(() => {
            try {
              window.print();
            } catch {
              // ignore
            }
          }, 250);
          return;
        }
      }

      setErr("No trip payload found. Go back and click Print Trip (PDF) from a built trip.");
    } catch (e: any) {
      setErr(`Failed to load trip payload: ${String(e?.message || e)}`);
    }
  }, []);

  const backToApp = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.assign(`${basePath}/`);
  };

  const printNow = () => window.print();

  const PageShell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-white text-black">
      <style>{`
        /* Screen UI */
        body { background: #ffffff; color: #000000; }

        /* INK-SAFE PRINT: force white paper + black text, kill dark gradients/shadows */
        @media print {
          .no-print { display: none !important; }

          html, body { background: #ffffff !important; color: #000000 !important; }
          * {
            background: transparent !important;
            color: #000000 !important;
            box-shadow: none !important;
            text-shadow: none !important;
            filter: none !important;
          }

          /* Keep borders visible but light */
          .print-card { border: 1px solid #d1d5db !important; }

          /* Improve page breaks */
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }

          /* Don’t force printing backgrounds */
          body { -webkit-print-color-adjust: economy; print-color-adjust: economy; }
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
          <div className="ml-auto text-sm text-gray-600">
            CERTIS AgRoute Database — Trip Print
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">{children}</div>
    </div>
  );

  if (err) {
    return (
      <PageShell>
        <h1 className="text-2xl font-extrabold mb-2">Trip Print</h1>
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 print-card">{err}</div>
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
  const generated = safe(payload.generatedAt);
  const retailSummaries = payload.retailSummaries || [];

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
          <div className="font-semibold">{safe(payload.home.label) || "Home"}</div>
          <div className="text-gray-600">{payload.home.zip ? `ZIP ${payload.home.zip}` : ""}</div>
        </div>
      </div>

      {/* Distances FIRST */}
      <div className="mt-6">
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
              <div key={i} className="rounded-xl border border-gray-200 p-3 print-card avoid-break">
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

      {/* Stops */}
      <div className="mt-7">
        <h2 className="text-xl font-extrabold mb-2">Stops</h2>
        <div className="space-y-3">
          {payload.stops.map((s) => (
            <div key={s.idx} className="rounded-2xl border border-gray-200 p-4 print-card avoid-break">
              <div className="text-lg font-extrabold">
                {s.idx}. {s.label || "Stop"}
              </div>
              <div className="text-sm text-gray-700 mt-1">
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

      {/* Retail Summary (Trip Summary) */}
      <div className="mt-7">
        <h2 className="text-xl font-extrabold mb-2">Retail Summary</h2>

        {retailSummaries.length ? (
          <div className="space-y-3">
            {retailSummaries.map((r) => (
              <div key={r.retailer} className="rounded-2xl border border-gray-200 p-4 print-card avoid-break">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-lg font-extrabold">{safe(r.retailer) || "Retailer"}</div>
                  <div className="text-sm text-gray-700 whitespace-nowrap">
                    <span className="font-semibold">Trip:</span> {Number(r.tripStops || 0)}{" "}
                    <span className="text-gray-400">•</span>{" "}
                    <span className="font-semibold">Total:</span> {Number(r.totalLocations || 0)}
                  </div>
                </div>

                <div className="text-sm text-gray-800 mt-2 space-y-1">
                  <div>
                    <span className="font-semibold">Agronomy locations:</span> {Number(r.agronomyLocations || 0)}
                  </div>
                  <div>
                    <span className="font-semibold">States:</span> {Array.isArray(r.states) && r.states.length ? r.states.join(", ") : "—"}
                  </div>
                  <div>
                    <span className="font-semibold">Category breakdown:</span>{" "}
                    {Array.isArray(r.categoryBreakdown) && r.categoryBreakdown.length ? r.categoryBreakdown.join(", ") : "—"}
                  </div>
                  <div>
                    <span className="font-semibold">Suppliers:</span> {Array.isArray(r.suppliers) && r.suppliers.length ? r.suppliers.join(", ") : "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-600">
            Retail Summary unavailable (no retailer summary payload).
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 text-xs text-gray-500">
        CERTIS AgRoute Database — Print view (map excluded by design).
      </div>
    </PageShell>
  );
}
