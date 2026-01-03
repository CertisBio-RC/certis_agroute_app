"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { APP_STATE_KEY, STORAGE_KEY, storageKeyForPid } from "../../components/TripPrint";

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

function readPayloadForKey(key: string): PrintPayload | null {
  // Prefer sessionStorage (new tab write), fall back to localStorage
  const fromSession = safeParsePayload(sessionStorage.getItem(key));
  if (fromSession) return fromSession;

  const fromLocal = safeParsePayload(localStorage.getItem(key));
  if (fromLocal) return fromLocal;

  // Back-compat fallback: legacy base key
  const legacySession = safeParsePayload(sessionStorage.getItem(STORAGE_KEY));
  if (legacySession) return legacySession;

  const legacyLocal = safeParsePayload(localStorage.getItem(STORAGE_KEY));
  if (legacyLocal) return legacyLocal;

  return null;
}

function PrintClient() {
  const searchParams = useSearchParams();

  const pid = useMemo(() => {
    const p = (searchParams?.get("pid") || "").trim();
    return p;
  }, [searchParams]);

  const payloadKey = useMemo(() => storageKeyForPid(pid), [pid]);

  const [payload, setPayload] = useState<PrintPayload | null>(null);
  const [appStateJson, setAppStateJson] = useState<string>("");

  useEffect(() => {
    // Load payload for printing
    try {
      const p = readPayloadForKey(payloadKey);
      setPayload(p);
    } catch {
      setPayload(null);
    }

    // Snapshot app state (optional / for debugging / future restore patterns)
    try {
      const s = sessionStorage.getItem(APP_STATE_KEY) || localStorage.getItem(APP_STATE_KEY) || "";
      setAppStateJson(s || "");
    } catch {
      setAppStateJson("");
    }
  }, [payloadKey]);

  const title = payload?.pid ? `Trip Print — ${payload.pid}` : "Trip Print";
  const generatedAt = payload?.generatedAt ? String(payload.generatedAt) : "";

  const hasStops = Array.isArray(payload?.stops) && (payload?.stops?.length || 0) > 0;

  const channelRows = useMemo(() => {
    const rows = Array.isArray(payload?.channelSummary) ? payload?.channelSummary : [];
    return rows || [];
  }, [payload?.channelSummary]);

  function joinList(v: any): string {
    if (!v) return "";
    if (Array.isArray(v)) return v.filter(Boolean).map(String).join(", ");
    return String(v);
  }

  function n(v: any): number {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }

  // Ink-safe layout (white background, black text)
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
            {generatedAt ? <div className="mt-1 text-sm text-black/70">Generated: {generatedAt}</div> : null}
            {pid ? <div className="mt-1 text-xs text-black/60">pid: {pid}</div> : null}
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
                <pre className="whitespace-pre-wrap break-words rounded-lg bg-black/5 p-3 text-xs">
                  {JSON.stringify(payload?.totals ?? null, null, 2)}
                </pre>
              </div>
            </section>

            {/* CHANNEL SUMMARY */}
            <section className="rounded-xl border border-black/15 p-4">
              <div className="text-lg font-extrabold">Channel Summary — Trip</div>

              {channelRows.length === 0 ? (
                <div className="mt-2 text-sm text-black/70">No channel summary rows were included in the payload.</div>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-black/20">
                        <th className="py-2 pr-3 text-left font-extrabold">Retailer</th>
                        <th className="py-2 pr-3 text-right font-extrabold">Trip Stops</th>
                        <th className="py-2 pr-3 text-right font-extrabold">Total Locations</th>
                        <th className="py-2 pr-3 text-right font-extrabold">Agronomy</th>
                        <th className="py-2 pr-3 text-left font-extrabold">Suppliers</th>
                        <th className="py-2 pr-3 text-left font-extrabold">Categories</th>
                        <th className="py-2 pr-0 text-left font-extrabold">States</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelRows.map((r: any, idx: number) => {
                        const retailer = String(r?.retailer ?? "");
                        const key = retailer ? retailer : `row-${idx}`;
                        const suppliers = joinList(r?.suppliers);
                        const categories = joinList(r?.categoryBreakdown);
                        const states = joinList(r?.states);

                        return (
                          <tr key={key} className="border-b border-black/10 last:border-b-0">
                            <td className="py-2 pr-3 align-top font-semibold">{retailer || "—"}</td>
                            <td className="py-2 pr-3 text-right align-top">{n(r?.tripStops)}</td>
                            <td className="py-2 pr-3 text-right align-top">{n(r?.totalLocations)}</td>
                            <td className="py-2 pr-3 text-right align-top">{n(r?.agronomyLocations)}</td>
                            <td className="py-2 pr-3 align-top">{suppliers || "—"}</td>
                            <td className="py-2 pr-3 align-top">{categories || "—"}</td>
                            <td className="py-2 pr-0 align-top">{states || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="mt-2 text-[11px] text-black/60">
                    Note: Suppliers/Categories/States are listed as provided by the payload.
                  </div>
                </div>
              )}
            </section>

            {/* OPTIONAL DEBUG (hidden on print) */}
            <section className="rounded-xl border border-black/15 p-4 print:hidden">
              <div className="text-sm font-extrabold">Debug</div>
              <div className="mt-2 text-xs text-black/70">
                <div>
                  <span className="font-bold">payloadKey:</span> {payloadKey}
                </div>
                <div className="mt-2">
                  <span className="font-bold">APP_STATE_KEY present:</span> {appStateJson ? "yes" : "no"}
                </div>
              </div>
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
