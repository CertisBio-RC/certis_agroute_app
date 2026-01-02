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

function kindLabel(kind: string) {
  const k = safe(kind).toLowerCase();
  if (!k) return "unknown";
  return k;
}

type RetailSummaryRow = {
  retailer: string;
  stopsCount: number;
  states: string[];
  kinds: Record<string, number>;
  contacts: string[];
  cities: string[];
};

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
    <div className="min-h-screen bg-white text-black">
      {/* Print-safe: no gradients, no shadows, no heavy backgrounds */}
      <style>{`
        :root {
          color-scheme: light;
        }
        @page {
          margin: 0.6in;
        }
        @media print {
          .no-print { display: none !important; }
          html, body { background: #fff !important; }
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            box-shadow: none !important;
            text-shadow: none !important;
            background-image: none !important;
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

  // Build Retail Summaries from stops we already have (no extra props needed).
  const retailSummaries: RetailSummaryRow[] = useMemo(() => {
    const map = new Map<string, RetailSummaryRow>();

    for (const s of payload.stops) {
      const retailer = safe(s.retailer) || "(No retailer)";
      const row =
        map.get(retailer) ||
        ({
          retailer,
          stopsCount: 0,
          states: [],
          kinds: {},
          contacts: [],
          cities: [],
        } as RetailSummaryRow);

      row.stopsCount += 1;

      const st = safe(s.state);
      if (st && !row.states.includes(st)) row.states.push(st);

      const city = safe(s.city);
      if (city && !row.cities.includes(city)) row.cities.push(city);

      const k = kindLabel(s.kind);
      row.kinds[k] = (row.kinds[k] || 0) + 1;

      const contact = safe(s.name);
      if (contact && !row.contacts.includes(contact)) row.contacts.push(contact);

      map.set(retailer, row);
    }

    const rows = Array.from(map.values());
    rows.sort((a, b) => b.stopsCount - a.stopsCount || a.retailer.localeCompare(b.retailer));
    // sort small arrays for neatness
    for (const r of rows) {
      r.states.sort((a, b) => a.localeCompare(b));
      r.cities.sort((a, b) => a.localeCompare(b));
      r.contacts.sort((a, b) => a.localeCompare(b));
    }
    return rows;
  }, [payload.stops]);

  const stopRetailSummary = (stopRetailer: string) => {
    const r = safe(stopRetailer) || "(No retailer)";
    const found = retailSummaries.find((x) => x.retailer === r);
    if (!found) return null;

    const kinds = Object.entries(found.kinds)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, n]) => `${k}: ${n}`)
      .join(", ");

    return {
      stopsCount: found.stopsCount,
      states: found.states.join(", "),
      kinds,
    };
  };

  const title = "Trip Itinerary";
  const generated = safe(payload.generatedAt);

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
            <span className="font-semibold">Total:</span> {formatMiles(payload.totals.distanceMeters)} •{" "}
            {formatMinutes(payload.totals.durationSeconds)}
          </div>
        ) : (
          <div className="text-sm text-gray-500 mb-3">Totals unavailable (route legs not computed).</div>
        )}

        {payload.legs.length ? (
          <div className="space-y-2">
            {payload.legs.map((l, i) => (
              <div key={i} className="rounded-xl border border-gray-200 p-3">
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

      {/* Stops SECOND, with embedded Retail Summary context */}
      <div className="mt-7">
        <h2 className="text-xl font-extrabold mb-2">Stops</h2>
        <div className="space-y-3">
          {payload.stops.map((s) => {
            const rs = stopRetailSummary(s.retailer);
            return (
              <div key={s.idx} className="rounded-2xl border border-gray-200 p-4">
                <div className="text-lg font-extrabold">
                  {s.idx}. {s.label || "Stop"}
                </div>

                <div className="text-sm text-gray-600 mt-1">
                  {[s.city, s.state].filter(Boolean).join(", ")} {s.zip ? s.zip : ""}
                  {s.kind ? ` • ${s.kind}` : ""}
                </div>

                {/* Embedded mini Retail Summary for this retailer */}
                {rs && (
                  <div className="mt-2 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                    <div className="font-semibold">Retail Summary (this trip)</div>
                    <div className="mt-1">
                      <span className="font-semibold">{safe(s.retailer) || "(No retailer)"}</span>: {rs.stopsCount} stop
                      {rs.stopsCount === 1 ? "" : "s"}
                      {rs.kinds ? ` • ${rs.kinds}` : ""}
                      {rs.states ? ` • States: ${rs.states}` : ""}
                    </div>
                  </div>
                )}

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
            );
          })}
        </div>
      </div>

      {/* Full Retail Summary block THIRD (if you want it after stops) */}
      <div className="mt-7">
        <h2 className="text-xl font-extrabold mb-2">Retail Summaries</h2>

        {retailSummaries.length ? (
          <div className="space-y-2">
            {retailSummaries.map((r) => {
              const kinds = Object.entries(r.kinds)
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .map(([k, n]) => `${k}: ${n}`)
                .join(", ");

              return (
                <div key={r.retailer} className="rounded-xl border border-gray-200 p-3">
                  <div className="text-sm font-extrabold">{r.retailer}</div>
                  <div className="text-sm text-gray-700 mt-1">
                    Stops: <span className="font-semibold">{r.stopsCount}</span>
                    {kinds ? ` • ${kinds}` : ""}
                    {r.states.length ? ` • States: ${r.states.join(", ")}` : ""}
                  </div>
                  {(r.contacts.length || r.cities.length) && (
                    <div className="text-sm text-gray-700 mt-1">
                      {r.contacts.length ? (
                        <div>
                          <span className="font-semibold">Contacts:</span> {r.contacts.join("; ")}
                        </div>
                      ) : null}
                      {r.cities.length ? (
                        <div>
                          <span className="font-semibold">Cities:</span> {r.cities.join(", ")}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-gray-500">No retailer summary available.</div>
        )}
      </div>

      <div className="mt-8 text-xs text-gray-500">CERTIS AgRoute Database — Print view (map excluded by design).</div>
    </PageShell>
  );
}
