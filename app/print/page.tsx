"use client";

import React, { useEffect, useMemo, useState } from "react";
import { STORAGE_KEY } from "../../components/TripPrint";

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

  // ✅ optional, may be absent in older payloads
  retailerSummaries?: any[];
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

function safe(s: any) {
  return String(s ?? "").trim();
}

function normKey(s: any) {
  return safe(s).toLowerCase();
}

/**
 * Best-effort attempt to match a retailer summary row to a stop.
 * We do NOT assume fields; we check common patterns:
 * - row.retailer, row.Retailer, row.network, row.Network, etc
 * - row.label/name if it looks like the retailer
 */
function findRetailerSummaryForStop(
  retailerSummaries: any[],
  stopRetailer: string,
  stopLabel: string
) {
  const target = normKey(stopRetailer || stopLabel);
  if (!target) return null;

  for (const row of retailerSummaries) {
    if (!row || typeof row !== "object") continue;
    const candidates = [
      row.retailer,
      row.Retailer,
      row.network,
      row.Network,
      row.name,
      row.Name,
      row.label,
      row.Label,
    ]
      .map((v) => normKey(v))
      .filter(Boolean);

    if (candidates.some((c) => c === target)) return row;

    // Loose contains match (safe, but only if obvious)
    if (candidates.some((c) => c && target && (c.includes(target) || target.includes(c)))) {
      return row;
    }
  }
  return null;
}

function renderSummaryKeyValues(row: any) {
  if (!row || typeof row !== "object") return null;

  // Hide overly noisy/internal fields if present
  const hidden = new Set([
    "id",
    "Id",
    "ID",
    "geometry",
    "Geometry",
    "features",
    "Features",
    "coords",
    "Coords",
    "lat",
    "Lat",
    "lng",
    "Lng",
    "longitude",
    "Longitude",
    "latitude",
    "Latitude",
  ]);

  const entries = Object.entries(row)
    .filter(([k, v]) => !hidden.has(k) && v !== null && v !== undefined && safe(v) !== "")
    .slice(0, 24); // prevent runaway

  if (!entries.length) return null;

  return (
    <div className="mt-2 text-[13px] text-white/85">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-white/60 font-semibold">{safe(k)}:</span>
            <span className="text-white/90">{safe(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
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
      const obj = JSON.parse(raw);
      if (!obj || obj.v !== 1) {
        setErr("Trip payload is missing or incompatible. Go back and click Print Trip (PDF) again.");
        return;
      }
      setPayload(obj as PrintPayload);

      // Give the DOM a beat to paint, then print.
      window.setTimeout(() => {
        try {
          window.print();
        } catch {
          // ignore
        }
      }, 250);
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
    <div className="min-h-screen bg-[#0b1220] text-white">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="no-print border-b border-white/10 bg-[#071021]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <button
            onClick={backToApp}
            className="px-3 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-semibold"
          >
            ← Back
          </button>
          <button
            onClick={printNow}
            className="px-3 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-semibold"
          >
            Print / Save as PDF
          </button>
          <div className="ml-auto text-sm text-white/70">
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
        <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          {err}
        </div>
      </PageShell>
    );
  }

  if (!payload) {
    return (
      <PageShell>
        <h1 className="text-2xl font-extrabold mb-2">Trip Print</h1>
        <div className="text-sm text-white/60">Loading…</div>
      </PageShell>
    );
  }

  const title = "Trip Itinerary";
  const generated = safe(payload.generatedAt);
  const retailerSummaries = Array.isArray(payload.retailerSummaries) ? payload.retailerSummaries : [];

  return (
    <PageShell>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold leading-tight">{title}</h1>
          <div className="text-sm text-white/60 mt-1">
            Generated: <span className="font-semibold text-white/80">{generated}</span>
          </div>
        </div>
        <div className="text-sm text-white/70 text-right">
          <div className="font-semibold text-white/85">{safe(payload.home.label) || "Home"}</div>
          <div className="text-white/55">{payload.home.zip ? `ZIP ${payload.home.zip}` : ""}</div>
        </div>
      </div>

      {/* ✅ Distances FIRST */}
      <div className="mt-6">
        <h2 className="text-xl font-extrabold mb-2">Distances & Times</h2>

        {payload.totals ? (
          <div className="text-sm text-white/75 mb-3">
            <span className="font-semibold text-white/85">Total:</span>{" "}
            {formatMiles(payload.totals.distanceMeters)} •{" "}
            {formatMinutes(payload.totals.durationSeconds)}
          </div>
        ) : (
          <div className="text-sm text-white/55 mb-3">Totals unavailable (route legs not computed).</div>
        )}

        {payload.legs.length ? (
          <div className="space-y-2">
            {payload.legs.map((l, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/15 bg-white/5 p-3"
              >
                <div className="text-sm font-semibold text-white/90">
                  {l.fromLabel} → {l.toLabel}
                </div>
                <div className="text-sm text-white/70 mt-1">
                  {formatMiles(l.distanceMeters)} • {formatMinutes(l.durationSeconds)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-white/55">No route legs available.</div>
        )}
      </div>

      {/* ✅ Stops SECOND (with best-effort embedded summary) */}
      <div className="mt-7">
        <h2 className="text-xl font-extrabold mb-2">Stops</h2>
        <div className="space-y-3">
          {payload.stops.map((s) => {
            const subtitleParts = [
              [s.city, s.state].filter(Boolean).join(", "),
              safe(s.zip),
              safe(s.kind),
            ].filter(Boolean);

            const summaryRow = retailerSummaries.length
              ? findRetailerSummaryForStop(retailerSummaries, s.retailer, s.label)
              : null;

            return (
              <div
                key={s.idx}
                className="rounded-2xl border border-white/15 bg-white/5 p-4"
              >
                <div className="text-lg font-extrabold text-white/95">
                  {s.idx}. {s.label || "Stop"}
                </div>

                {subtitleParts.length ? (
                  <div className="text-sm text-white/60 mt-1">
                    {subtitleParts.join(" • ")}
                  </div>
                ) : null}

                {(s.retailer || s.name) && (
                  <div className="text-sm mt-2 text-white/80">
                    {s.retailer && (
                      <div>
                        <span className="font-semibold text-white/70">Retailer:</span>{" "}
                        <span className="text-white/90">{s.retailer}</span>
                      </div>
                    )}
                    {s.name && (
                      <div>
                        <span className="font-semibold text-white/70">Contact:</span>{" "}
                        <span className="text-white/90">{s.name}</span>
                      </div>
                    )}
                  </div>
                )}

                {s.address && (
                  <div className="text-sm mt-2 text-white/80">
                    <span className="font-semibold text-white/70">Address:</span>{" "}
                    <span className="text-white/90">{s.address}</span>
                  </div>
                )}

                {(s.phoneOffice || s.phoneCell || s.email) && (
                  <div className="text-sm mt-2 text-white/80">
                    {s.phoneOffice && (
                      <div>
                        <span className="font-semibold text-white/70">Office:</span>{" "}
                        <span className="text-white/90">{s.phoneOffice}</span>
                      </div>
                    )}
                    {s.phoneCell && (
                      <div>
                        <span className="font-semibold text-white/70">Cell:</span>{" "}
                        <span className="text-white/90">{s.phoneCell}</span>
                      </div>
                    )}
                    {s.email && (
                      <div>
                        <span className="font-semibold text-white/70">Email:</span>{" "}
                        <span className="text-white/90">{s.email}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* ✅ Embedded retailer summary (best-effort) */}
                {summaryRow ? (
                  <div className="mt-3 rounded-xl border border-white/15 bg-black/20 p-3">
                    <div className="text-sm font-extrabold text-yellow-300">
                      Retailer Summary (best match)
                    </div>
                    {renderSummaryKeyValues(summaryRow)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* ✅ Retail Summaries THIRD (fallback/complete listing) */}
      {retailerSummaries.length ? (
        <div className="mt-8">
          <h2 className="text-xl font-extrabold mb-2">Retail Summaries</h2>
          <div className="space-y-3">
            {retailerSummaries.map((row: any, i: number) => (
              <div
                key={i}
                className="rounded-2xl border border-white/15 bg-white/5 p-4"
              >
                <div className="text-sm font-extrabold text-white/90">
                  {safe(row?.retailer || row?.Retailer || row?.network || row?.Network || row?.name || row?.Name || `Retailer ${i + 1}`)}
                </div>
                {renderSummaryKeyValues(row)}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-10 text-xs text-white/45">
        CERTIS AgRoute Database — Print view (map excluded by design).
      </div>
    </PageShell>
  );
}
