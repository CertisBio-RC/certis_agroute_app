"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { STORAGE_KEY, storageKeyForPid } from "../../components/TripPrint";

type RouteLegRow = {
  fromLabel: string;
  toLabel: string;
  distanceMeters: number;
  durationSeconds: number;
};

type TripTotals = { distanceMeters: number; durationSeconds: number } | null;

type PrintPayloadV2 = {
  v?: number;
  pid?: string;
  generatedAt?: string;
  basePath?: string;
  home?: {
    label?: string;
    zip?: string;
    coords?: [number, number] | null;
  };
  stops?: Array<{
    idx?: number;
    id?: string;
    label?: string;
    retailer?: string;
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    kind?: string;
    email?: string;
    phoneOffice?: string;
    phoneCell?: string;
  }>;
  legs?: RouteLegRow[];
  totals?: TripTotals;
  channelSummary?: Array<{
    retailer?: string;
    tripStops?: number;
    totalLocations?: number;
    agronomyLocations?: number;
    suppliers?: string[];
    categoryBreakdown?: string[];
    states?: string[];
  }>;
};

function metersToMiles(m: number) {
  return m / 1609.344;
}
function formatMiles(meters: number) {
  const mi = metersToMiles(Number(meters || 0));
  if (!isFinite(mi)) return "—";
  if (mi < 0.1) return "<0.1 mi";
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${mi.toFixed(0)} mi`;
}
function formatMinutes(seconds: number) {
  const min = Number(seconds || 0) / 60;
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

function tryParsePayload(raw: string | null): PrintPayloadV2 | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return obj as PrintPayloadV2;
  } catch {
    return null;
  }
}

function readFromStorage(key: string): PrintPayloadV2 | null {
  try {
    const s1 = tryParsePayload(sessionStorage.getItem(key));
    if (s1) return s1;
  } catch {
    // ignore
  }
  try {
    const s2 = tryParsePayload(localStorage.getItem(key));
    if (s2) return s2;
  } catch {
    // ignore
  }
  return null;
}

export default function PrintTripPage() {
  const searchParams = useSearchParams();
  const pid = useMemo(() => safeStr(searchParams.get("pid") || ""), [searchParams]);

  const primaryKey = useMemo(() => storageKeyForPid(pid), [pid]);

  const [payload, setPayload] = useState<PrintPayloadV2 | null>(null);
  const [loadKeyUsed, setLoadKeyUsed] = useState<string>("");

  useEffect(() => {
    // 1) PID key (preferred)
    const p1 = readFromStorage(primaryKey);
    if (p1) {
      setPayload(p1);
      setLoadKeyUsed(primaryKey);
      return;
    }

    // 2) Legacy shared key (back compat)
    const p2 = readFromStorage(STORAGE_KEY);
    if (p2) {
      setPayload(p2);
      setLoadKeyUsed(STORAGE_KEY);
      return;
    }

    setPayload(null);
    setLoadKeyUsed("");
  }, [primaryKey]);

  const totals = payload?.totals ?? null;
  const stops = Array.isArray(payload?.stops) ? payload!.stops! : [];
  const legs = Array.isArray(payload?.legs) ? payload!.legs! : [];
  const channelSummary = Array.isArray(payload?.channelSummary) ? payload!.channelSummary! : [];

  const title = "CERTIS AgRoute Database — Trip Print";

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Print CSS */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-page { padding: 0 !important; margin: 0 !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="print-page mx-auto max-w-4xl px-4 py-6">
        {/* Header */}
        <div className="no-print flex items-center justify-between gap-3 border-b pb-3">
          <div>
            <div className="text-xl font-extrabold">{title}</div>
            <div className="text-sm text-black/60">
              Generated: <span className="font-semibold">{safeStr(payload?.generatedAt) || "—"}</span>
              {pid ? (
                <>
                  {" "}
                  • PID: <span className="font-semibold">{pid}</span>
                </>
              ) : null}
            </div>
            <div className="text-xs text-black/50">
              Loaded from: <span className="font-mono">{loadKeyUsed || "—"}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg bg-black px-4 py-2 text-sm font-extrabold text-white hover:bg-black/90"
            >
              Print / Save PDF
            </button>
          </div>
        </div>

        {/* If no payload */}
        {!payload ? (
          <div className="mt-6 rounded-xl border p-4">
            <div className="text-lg font-extrabold">No trip payload found</div>
            <div className="mt-2 text-sm text-black/70">
              This print page reads from session/local storage. Open it by clicking{" "}
              <span className="font-semibold">Print Trip (PDF)</span> in the main app (it writes the payload first).
            </div>
            <div className="mt-3 text-xs text-black/50">
              Tried keys: <span className="font-mono">{primaryKey}</span> and <span className="font-mono">{STORAGE_KEY}</span>
            </div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="mt-5 rounded-xl border p-4">
              <div className="text-lg font-extrabold">Trip Summary</div>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-black/5 p-3">
                  <div className="text-xs font-bold text-black/60">Home</div>
                  <div className="text-sm font-extrabold">{safeStr(payload?.home?.label) || "—"}</div>
                  <div className="text-xs text-black/70">
                    ZIP: <span className="font-semibold">{safeStr(payload?.home?.zip) || "—"}</span>
                  </div>
                </div>

                <div className="rounded-lg bg-black/5 p-3">
                  <div className="text-xs font-bold text-black/60">Route Total</div>
                  {totals ? (
                    <div className="text-sm font-extrabold">
                      {formatMiles(totals.distanceMeters)} • {formatMinutes(totals.durationSeconds)}
                    </div>
                  ) : (
                    <div className="text-sm font-extrabold">—</div>
                  )}
                  <div className="text-xs text-black/70">
                    Stops: <span className="font-semibold">{stops.length}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stops */}
            <div className="mt-5 rounded-xl border p-4">
              <div className="text-lg font-extrabold">Stops</div>
              {stops.length === 0 ? (
                <div className="mt-2 text-sm text-black/70">No stops in payload.</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {stops.map((s, i) => {
                    const line1 = safeStr(s.label) || safeStr(s.name) || safeStr(s.retailer) || `Stop ${i + 1}`;
                    const line2Parts = [safeStr(s.address), safeStr(s.city), safeStr(s.state), safeStr(s.zip)].filter(Boolean);
                    const line2 = line2Parts.join(", ");
                    return (
                      <div key={`${safeStr(s.id) || i}`} className="rounded-lg bg-black/5 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-extrabold">
                              {s.idx ?? i + 1}. {line1}
                            </div>
                            <div className="text-xs text-black/70">{line2 || "—"}</div>
                            <div className="mt-1 text-xs text-black/60">
                              Kind: <span className="font-semibold">{safeStr(s.kind) || "—"}</span>
                              {safeStr(s.retailer) ? (
                                <>
                                  {" "}
                                  • Retailer: <span className="font-semibold">{safeStr(s.retailer)}</span>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <div className="text-right text-xs text-black/60">
                            {safeStr(s.email) ? <div>{safeStr(s.email)}</div> : null}
                            {safeStr(s.phoneOffice) ? <div>Office: {safeStr(s.phoneOffice)}</div> : null}
                            {safeStr(s.phoneCell) ? <div>Cell: {safeStr(s.phoneCell)}</div> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Legs */}
            <div className="mt-5 rounded-xl border p-4">
              <div className="text-lg font-extrabold">Route Legs</div>
              {legs.length === 0 ? (
                <div className="mt-2 text-sm text-black/70">No route legs in payload.</div>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 text-left font-extrabold">From</th>
                        <th className="py-2 text-left font-extrabold">To</th>
                        <th className="py-2 text-left font-extrabold">Distance</th>
                        <th className="py-2 text-left font-extrabold">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {legs.map((l, idx) => (
                        <tr key={idx} className="border-b last:border-b-0">
                          <td className="py-2 pr-3">{safeStr(l.fromLabel) || "—"}</td>
                          <td className="py-2 pr-3">{safeStr(l.toLabel) || "—"}</td>
                          <td className="py-2 pr-3">{formatMiles(Number(l.distanceMeters || 0))}</td>
                          <td className="py-2">{formatMinutes(Number(l.durationSeconds || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Channel Summary */}
            <div className="mt-5 rounded-xl border p-4">
              <div className="text-lg font-extrabold">Retailer Summary</div>
              {channelSummary.length === 0 ? (
                <div className="mt-2 text-sm text-black/70">No channel summary rows in payload.</div>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 text-left font-extrabold">Retailer</th>
                        <th className="py-2 text-left font-extrabold">Trip Stops</th>
                        <th className="py-2 text-left font-extrabold">Total Locations</th>
                        <th className="py-2 text-left font-extrabold">Agronomy</th>
                        <th className="py-2 text-left font-extrabold">States</th>
                        <th className="py-2 text-left font-extrabold">Suppliers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelSummary.map((r, idx) => (
                        <tr key={idx} className="border-b last:border-b-0">
                          <td className="py-2 pr-3">{safeStr(r.retailer) || "—"}</td>
                          <td className="py-2 pr-3">{Number(r.tripStops || 0)}</td>
                          <td className="py-2 pr-3">{Number(r.totalLocations || 0)}</td>
                          <td className="py-2 pr-3">{Number(r.agronomyLocations || 0)}</td>
                          <td className="py-2 pr-3">{Array.isArray(r.states) ? r.states.filter(Boolean).join(", ") : "—"}</td>
                          <td className="py-2">{Array.isArray(r.suppliers) ? r.suppliers.filter(Boolean).join(", ") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-6 text-xs text-black/50">
              Tip: Use your browser print dialog → “Save as PDF” for a clean export.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
