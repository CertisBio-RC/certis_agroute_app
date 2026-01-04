"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  APP_STATE_KEY,
  LEGACY_APP_STATE_KEYS,
  LEGACY_STORAGE_KEYS,
  STORAGE_KEY,
  storageKeyForPid,
  storageKeyForPidWithBase,
} from "../../components/TripPrint";

type PrintPayload = {
  v: number;
  pid?: string;
  generatedAt?: string;
  basePath?: string;
  home?: {
    label?: string;
    zip?: string;
    coords?: [number, number] | null;
  };
  stops?: any[];
  legs?: any[];
  totals?: any;
  channelSummary?: any[];
};

function safeParsePayload(raw: string | null): PrintPayload | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return obj as PrintPayload;
  } catch {
    return null;
  }
}

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

function readAnyKey(keys: string[]): PrintPayload | null {
  for (const k of keys) {
    const fromSession = safeParsePayload(sessionStorage.getItem(k));
    if (fromSession) return fromSession;

    const fromLocal = safeParsePayload(localStorage.getItem(k));
    if (fromLocal) return fromLocal;
  }
  return null;
}

function buildCandidatePayloadKeys(pid: string) {
  const keys: string[] = [];

  // ✅ canonical PID key + canonical base key
  keys.push(storageKeyForPid(pid));
  keys.push(STORAGE_KEY);

  // ✅ legacy base keys + legacy pid keys
  for (const legacyBase of LEGACY_STORAGE_KEYS) {
    keys.push(storageKeyForPidWithBase(legacyBase, pid));
    keys.push(legacyBase);
  }

  // de-dupe
  return Array.from(new Set(keys.filter(Boolean)));
}

function readPayloadForPid(pid: string): PrintPayload | null {
  const candidateKeys = buildCandidatePayloadKeys(pid);
  const found = readAnyKey(candidateKeys);
  if (found) return found;

  // If pid was missing/empty and we didn't find anything, as a last resort:
  // try only base keys (canonical + legacy) again (covers weird pid sanitize edge cases)
  const baseKeys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
  return readAnyKey(Array.from(new Set(baseKeys)));
}

function readAppStateAny(): string {
  // canonical then legacy
  const keys = [APP_STATE_KEY, ...LEGACY_APP_STATE_KEYS];
  for (const k of keys) {
    const s = sessionStorage.getItem(k) || localStorage.getItem(k);
    if (s) return s;
  }
  return "";
}

function PrintClient() {
  const searchParams = useSearchParams();

  const pid = useMemo(() => {
    const p = (searchParams?.get("pid") || "").trim();
    return p;
  }, [searchParams]);

  const [payload, setPayload] = useState<PrintPayload | null>(null);
  const [appStateJson, setAppStateJson] = useState<string>("");

  useEffect(() => {
    try {
      const p = readPayloadForPid(pid);
      setPayload(p);
    } catch {
      setPayload(null);
    }

    try {
      const s = readAppStateAny();
      setAppStateJson(s || "");
    } catch {
      setAppStateJson("");
    }
  }, [pid]);

  const title = payload?.pid ? `Trip Print — ${payload.pid}` : "Trip Print";
  const generatedAt = payload?.generatedAt ? String(payload.generatedAt) : "";

  const hasStops = Array.isArray(payload?.stops) && (payload?.stops?.length || 0) > 0;

  const legs = Array.isArray(payload?.legs) ? payload!.legs! : [];
  const totals = payload?.totals ?? null;

  // Ink-safe layout (white background, black text)
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
            {generatedAt ? <div className="mt-1 text-sm text-black/70">Generated: {generatedAt}</div> : null}
            {payload?.pid ? <div className="mt-1 text-xs text-black/60">pid: {payload.pid}</div> : null}
          </div>

          <div className="flex gap-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-black/20 bg-black px-4 py-2 text-sm font-bold text-white hover:bg-black/90"
            >
              Print / Save PDF
            </button>

            <button
              type="button"
              onClick={() => window.close()}
              className="rounded-lg border border-black/20 bg-white px-4 py-2 text-sm font-bold text-black hover:bg-black/5"
              title="Closes this tab (if opened by the app)"
            >
              Close Tab
            </button>
          </div>
        </div>

        <hr className="my-6 border-black/15" />

        {!payload ? (
          <div className="rounded-xl border border-black/15 p-4">
            <div className="text-base font-bold">No print payload found.</div>
            <div className="mt-2 text-sm text-black/70">
              Go back to the main app tab and click <span className="font-semibold">Print / Save as PDF</span> again.
            </div>
          </div>
        ) : !hasStops ? (
          <div className="rounded-xl border border-black/15 p-4">
            <div className="text-base font-bold">Payload found, but no stops were included.</div>
            <div className="mt-2 text-sm text-black/70">
              Add at least one stop in the main app, then click Print again.
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* HOME */}
            <section className="rounded-xl border border-black/15 p-4">
              <div className="text-lg font-extrabold">Home</div>
              <div className="mt-2 text-sm">
                <div>
                  <span className="font-bold">Label:</span> {payload?.home?.label || "—"}
                </div>
                <div>
                  <span className="font-bold">ZIP:</span> {payload?.home?.zip || "—"}
                </div>
              </div>
            </section>

            {/* STOPS */}
            <section className="rounded-xl border border-black/15 p-4">
              <div className="text-lg font-extrabold">Stops</div>
              <div className="mt-3 space-y-3">
                {(payload?.stops || []).map((s: any, idx: number) => {
                  const label = String(s?.label || s?.name || s?.id || `Stop ${idx + 1}`);
                  const retailer = String(s?.retailer || "");
                  const addr = [s?.address, s?.city, s?.state, s?.zip].filter(Boolean).join(", ");

                  return (
                    <div key={`${idx}-${label}`} className="rounded-lg border border-black/10 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold">
                            {idx + 1}. {label}
                          </div>
                          {retailer ? <div className="mt-1 text-xs text-black/70">{retailer}</div> : null}
                          {addr ? <div className="mt-1 text-xs text-black/70">{addr}</div> : null}
                        </div>
                        {s?.kind ? (
                          <div className="shrink-0 rounded-md border border-black/10 px-2 py-1 text-[11px] font-bold">
                            {String(s.kind)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ROUTE TOTALS */}
            <section className="rounded-xl border border-black/15 p-4">
              <div className="text-lg font-extrabold">Route Totals</div>
              <div className="mt-2 text-sm text-black/80">
                {totals ? (
                  <div className="rounded-lg border border-black/10 p-3">
                    <div className="text-sm">
                      <span className="font-bold">Total distance:</span> {formatMiles(totals?.distanceMeters)}
                    </div>
                    <div className="text-sm">
                      <span className="font-bold">Total drive time:</span> {formatMinutes(totals?.durationSeconds)}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-black/70">No totals were included in the payload.</div>
                )}
              </div>
            </section>

            {/* ✅ STOPS & DISTANCES (ABOVE RETAILER SUMMARY) */}
            <section className="rounded-xl border border-black/15 p-4">
              <div className="text-lg font-extrabold">Stops & Distances</div>

              {!legs || legs.length === 0 ? (
                <div className="mt-2 text-sm text-black/70">No route legs were included in the payload.</div>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-black/20 text-left">
                        <th className="py-2 pr-3 font-extrabold">Leg</th>
                        <th className="py-2 pr-3 font-extrabold">From</th>
                        <th className="py-2 pr-3 font-extrabold">To</th>
                        <th className="py-2 pr-3 font-extrabold whitespace-nowrap">Distance</th>
                        <th className="py-2 pr-0 font-extrabold whitespace-nowrap">Drive Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {legs.map((l: any, i: number) => (
                        <tr key={`leg-${i}`} className="border-b border-black/10 align-top">
                          <td className="py-2 pr-3 font-bold">{i + 1}</td>
                          <td className="py-2 pr-3">{String(l?.fromLabel || "—")}</td>
                          <td className="py-2 pr-3">{String(l?.toLabel || "—")}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{formatMiles(l?.distanceMeters)}</td>
                          <td className="py-2 pr-0 whitespace-nowrap">{formatMinutes(l?.durationSeconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* CHANNEL SUMMARY */}
            <section className="rounded-xl border border-black/15 p-4">
              <div className="text-lg font-extrabold">Channel Summary — Trip</div>

              {Array.isArray(payload?.channelSummary) && payload!.channelSummary!.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-black/20 text-left">
                        <th className="py-2 pr-3 font-extrabold">Retailer</th>
                        <th className="py-2 pr-3 font-extrabold whitespace-nowrap">Trip Stops</th>
                        <th className="py-2 pr-3 font-extrabold whitespace-nowrap">Total Locations</th>
                        <th className="py-2 pr-3 font-extrabold whitespace-nowrap">Agronomy</th>
                        <th className="py-2 pr-3 font-extrabold">Suppliers</th>
                        <th className="py-2 pr-3 font-extrabold">Categories</th>
                        <th className="py-2 pr-0 font-extrabold whitespace-nowrap">States</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(payload?.channelSummary || []).map((r: any, idx: number) => {
                        const suppliers = Array.isArray(r?.suppliers) ? r.suppliers.join(", ") : "";
                        const cats = Array.isArray(r?.categoryBreakdown) ? r.categoryBreakdown.join(", ") : "";
                        const states = Array.isArray(r?.states) ? r.states.join(", ") : "";

                        return (
                          <tr key={`cs-${idx}`} className="border-b border-black/10 align-top">
                            <td className="py-2 pr-3 font-bold">{String(r?.retailer || "—")}</td>
                            <td className="py-2 pr-3">{Number(r?.tripStops || 0)}</td>
                            <td className="py-2 pr-3">{Number(r?.totalLocations || 0)}</td>
                            <td className="py-2 pr-3">{Number(r?.agronomyLocations || 0)}</td>
                            <td className="py-2 pr-3">{suppliers || "—"}</td>
                            <td className="py-2 pr-3">{cats || "—"}</td>
                            <td className="py-2 pr-0">{states || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="mt-2 text-xs text-black/60">
                    Note: Supplier/Category/States are listed as provided by the payload.
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-black/70">No channel summary rows were included in the payload.</div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

export default function PrintPage() {
  // ✅ REQUIRED for static export when useSearchParams() is used:
  // Wrap the component that calls useSearchParams() in a Suspense boundary.
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white text-black">
          <div className="mx-auto max-w-5xl px-6 py-10">
            <div className="rounded-xl border border-black/15 p-4">
              <div className="text-base font-bold">Loading print view…</div>
              <div className="mt-2 text-sm text-black/70">Preparing your trip payload.</div>
            </div>
          </div>
        </main>
      }
    >
      <PrintClient />
    </Suspense>
  );
}
