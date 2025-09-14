// app/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import CertisMap from "@/components/CertisMap";
import { withBasePath } from "@/utils/paths";
import * as Route from "@/utils/routing";

type Position = [number, number];
interface FeatureProperties { [key: string]: any }
interface Feature { type: "Feature"; properties: FeatureProperties; geometry: { type: "Point"; coordinates: Position } }
interface FeatureCollection { type: "FeatureCollection"; features: Feature[] }
export type Stop = { name: string; coord: Position };

/* ---- Property helpers (robust names) ---- */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function getProp(p: FeatureProperties, candidates: string[]): string {
  if (!p) return "";
  for (const key of Object.keys(p)) {
    for (const c of candidates) if (key.toLowerCase() === c.toLowerCase()) return String(p[key] ?? "");
  }
  const m: Record<string, any> = {};
  for (const [k, v] of Object.entries(p)) m[norm(k)] = v;
  for (const c of candidates) { const nk = norm(c); if (m[nk] != null) return String(m[nk] ?? ""); }
  return "";
}
const getRetailer = (p: FeatureProperties) => getProp(p, ["Retailer","Dealer","Retailer Name"]);
const getCity     = (p: FeatureProperties) => getProp(p, ["City","Town"]);
const getState    = (p: FeatureProperties) => getProp(p, ["State","ST","Province"]);
const getType     = (p: FeatureProperties) => getProp(p, ["Type","Location Type","LocationType","location_type","LocType","Loc_Type"]);
const isKingpin   = (p: FeatureProperties): boolean => {
  const raw = getProp(p, ["KINGPIN","Kingpin","IsKingpin","Key Account"]);
  if (typeof raw === "boolean") return raw;
  const s = String(raw || "").trim().toLowerCase();
  return s === "true" || s === "yes" || s === "y" || s === "1";
};

const dedupe = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));
function splitKingpins(fc: FeatureCollection): { main: FeatureCollection; kingpins: FeatureCollection } {
  const main: Feature[] = [], kp: Feature[] = [];
  for (const f of fc.features) (isKingpin(f.properties || {}) ? kp : main).push(f);
  return { main: { type: "FeatureCollection", features: main }, kingpins: { type: "FeatureCollection", features: kp } };
}

/* ---- Data fetch ---- */
async function tryFetchJson<T>(path: string): Promise<T | null> {
  try { const res = await fetch(path, { cache: "force-cache" }); if (!res.ok) return null; return (await res.json()) as T; }
  catch { return null; }
}
async function fetchFirst<T>(candidates: string[]): Promise<T | null> {
  for (const p of candidates) { const j = await tryFetchJson<T>(p); if (j) return j; }
  return null;
}

export default function Page() {
  // data
  const [mainFc, setMainFc] = useState<FeatureCollection | null>(null);
  const [kingpinFc, setKingpinFc] = useState<FeatureCollection | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  // filters
  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [selStates, setSelStates] = useState<Set<string>>(new Set());
  const [selRetailers, setSelRetailers] = useState<Set<string>>(new Set());
  const [selTypes, setSelTypes] = useState<Set<string>>(new Set());

  // home (ZIP)
  const [zipInput, setZipInput] = useState("");
  const [home, setHome] = useState<Position | null>(null);
  const [homeErr, setHomeErr] = useState<string | null>(null);
  const [zipIndex, setZipIndex] = useState<Record<string, Position> | null>(null);

  // trip
  const [stops, setStops] = useState<Stop[]>([]);
  const [optimized, setOptimized] = useState<Stop[]>([]);

  // load dataset
  useEffect(() => {
    (async () => {
      const fc =
        (await fetchFirst<FeatureCollection>([
          withBasePath("retailers.geojson"),
          withBasePath("data/retailers.geojson"),
        ])) ?? { type: "FeatureCollection", features: [] };

      if (!fc.features?.length) setDataError("No features found in retailers.geojson");

      const { main, kingpins } = splitKingpins(fc);
      setMainFc(main);
      setKingpinFc(kingpins);
    })();
  }, []);

  // hydrate filter domains
  useEffect(() => {
    if (!mainFc) return;
    const s = dedupe(mainFc.features.map((f) => getState(f.properties || {})));
    const r = dedupe(mainFc.features.map((f) => getRetailer(f.properties || {})));
    const t = dedupe(mainFc.features.map((f) => getType(f.properties || {})));
    setStates(s); setRetailers(r); setTypes(t);
    setSelStates(new Set(s)); setSelRetailers(new Set(r)); setSelTypes(new Set(t)); // All by default
  }, [mainFc]);

  // filtered features
  const filteredFc: FeatureCollection | null = useMemo(() => {
    if (!mainFc) return null;
    const out: Feature[] = [];
    for (const f of mainFc.features) {
      const p = f.properties || {};
      if (!selStates.has(getState(p))) continue;
      if (!selRetailers.has(getRetailer(p))) continue;
      if (!selTypes.has(getType(p))) continue;
      out.push(f);
    }
    return { type: "FeatureCollection", features: out };
  }, [mainFc, selStates, selRetailers, selTypes]);

  // local ZIP index (optional)
  useEffect(() => {
    (async () => {
      const idx = await fetchFirst<Record<string, Position>>([
        withBasePath("zips.min.json"),
        withBasePath("data/zips.min.json"),
      ]);
      if (idx) setZipIndex(idx);
    })();
  }, []);

  // geocode ZIP
  const geocodeZip = useCallback(async (zip: string): Promise<Position | null> => {
    const z = zip.trim(); if (!z) return null;
    if (zipIndex && zipIndex[z]) return zipIndex[z];
    const token = (typeof window !== "undefined" ? (window as any).MAPBOX_TOKEN : undefined) || process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN;
    if (token) {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(z)}.json?types=postcode&limit=1&access_token=${token}`;
        const res = await fetch(url); const j = await res.json(); const c = j?.features?.[0]?.center;
        if (Array.isArray(c) && c.length === 2) return [c[0], c[1]] as Position;
      } catch {}
    }
    return null;
  }, [zipIndex]);

  const setHomeFromZip = useCallback(async () => {
    setHomeErr(null);
    const pos = await geocodeZip(zipInput);
    if (pos) setHome(pos); else setHomeErr("ZIP not found (try a 5-digit US ZIP)");
  }, [zipInput, geocodeZip]);

  // trip actions
  const addStop = useCallback((feat: Feature) => {
    const p = feat.properties || {};
    const name = [getRetailer(p), getCity(p), getState(p)].filter(Boolean).join(" · ");
    const coord = feat.geometry.coordinates as Position;
    setStops((prev) => [...prev, { name, coord }]);
  }, []);

  const clearStops = useCallback(() => { setStops([]); setOptimized([]); }, []);

  const optimize = useCallback(() => {
    const origin = home ?? (stops[0]?.coord ?? null);
    if (!origin || stops.length < 1) { setOptimized(stops); return; }
    const ordered = Route.nearestNeighbor(stops, origin);
    const improved = Route.twoOpt(ordered, origin);
    setOptimized(improved);
  }, [stops, home]);

  // share links
  const googleHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin = home ? `${home[1]},${home[0]}` : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildGoogleMapsLink(origin, optimized.map((s) => s.coord));
  }, [optimized, home]);
  const appleHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin = home ? `${home[1]},${home[0]}` : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildAppleMapsLink(origin, optimized.map((s) => s.coord));
  }, [optimized, home]);
  const wazeHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin = home ? `${home[1]},${home[0]}` : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildWazeLink(origin, optimized.map((s) => s.coord));
  }, [optimized, home]);

  // tiny helpers
  const toggleSel = (set: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) =>
    set((prev) => { const next = new Set(prev); next.has(v) ? next.delete(v) : next.add(v); return next; });
  const setAll  = (set: React.Dispatch<React.SetStateAction<Set<string>>>, values: string[]) => set(new Set(values));
  const setNone = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => set(new Set());

  return (
    <div className="pane-grid">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <h1 className="h1 mb-3">Certis AgRoute Planner</h1>

        {dataError ? (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">{dataError}</div>
        ) : null}

        <section className="mb-5">
          <h2 className="h2 mb-2">Home (ZIP)</h2>
          <div className="flex gap-2">
            <input className="input" value={zipInput} onChange={(e) => setZipInput(e.target.value)} placeholder="e.g. 50309" inputMode="numeric" />
            <button className="btn btn-primary" onClick={setHomeFromZip}>Set</button>
          </div>
          {homeErr ? <div className="mt-2 text-xs text-red-400">{homeErr}</div> : null}
          {home ? <div className="mt-2 text-xs text-zinc-400">Home set at {home[1].toFixed(4)}, {home[0].toFixed(4)}</div> : null}
        </section>

        <section className="mb-5">
          <h2 className="h2 mb-2">States ({selStates.size} / {states.length})</h2>
          <div className="mb-2 flex gap-2 text-xs">
            <button className="btn" onClick={() => setAll(setSelStates, states)}>All</button>
            <button className="btn" onClick={() => setNone(setSelStates)}>None</button>
          </div>
          <div className="chips">
            {states.map((s) => (
              <button key={s || "_"} className={`chip ${selStates.has(s) ? "chip-active" : ""}`} onClick={() => toggleSel(setSelStates, s)}>
                {s || "—"}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-5">
          <h2 className="h2 mb-2">Retailers ({selRetailers.size} / {retailers.length})</h2>
          <div className="mb-2 flex gap-2 text-xs">
            <button className="btn" onClick={() => setAll(setSelRetailers, retailers)}>All</button>
            <button className="btn" onClick={() => setNone(setSelRetailers)}>None</button>
          </div>
          <div className="chips max-h-48 overflow-y-auto pr-1">
            {retailers.map((r) => (
              <button key={r || "_"} className={`chip ${selRetailers.has(r) ? "chip-active" : ""}`} onClick={() => toggleSel(setSelRetailers, r)}>
                {r || "—"}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-6">
          <h2 className="h2 mb-2">Location Types ({selTypes.size} / {types.length})</h2>
          <div className="mb-2 flex gap-2 text-xs">
            <button className="btn" onClick={() => setAll(setSelTypes, types)}>All</button>
            <button className="btn" onClick={() => setNone(setSelTypes)}>None</button>
          </div>
          <div className="chips">
            {types.map((t) => (
              <button key={t || "_"} className={`chip ${selTypes.has(t) ? "chip-active" : ""}`} onClick={() => toggleSel(setSelTypes, t)}>
                {t || "—"}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="h2 mb-2">Trip Builder</h2>
          <div className="chips mb-2">
            {stops.length === 0 ? <span className="text-xs text-zinc-400">Click map points to add stops…</span> : null}
            {stops.map((s, i) => (<span key={`${s.name}-${i}`} className="chip">{i + 1}. {s.name}</span>))}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={optimize}>Optimize</button>
            <button className="btn" onClick={clearStops}>Clear</button>
          </div>
          {optimized.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <a className="underline hover:no-underline" target="_blank" rel="noreferrer" href={googleHref}>Open in Google Maps</a>
              <a className="underline hover:no-underline" target="_blank" rel="noreferrer" href={appleHref}>Open in Apple Maps</a>
              <a className="underline hover:no-underline" target="_blank" rel="noreferrer" href={wazeHref}>Open in Waze</a>
            </div>
          ) : null}
          <div className="mt-3 text-[11px] text-zinc-500">
            KINGPINs are always visible (separate source) and unaffected by filters.
          </div>
        </section>
      </aside>

      {/* MAP */}
      <main className="map-area">
        <div className="card">
          {filteredFc && kingpinFc ? (
            <CertisMap data={filteredFc as any} kingpins={kingpinFc as any} home={home as any} onPointClick={addStop as any} />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-400">Loading map…</div>
          )}
        </div>
      </main>
    </div>
  );
}
