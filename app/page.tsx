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

/* ---------------- helpers ---------------- */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function getProp(p: FeatureProperties, candidates: string[]): string {
  if (!p) return "";
  for (const k of Object.keys(p)) {
    for (const c of candidates) if (k.toLowerCase() === c.toLowerCase()) return String(p[k] ?? "");
  }
  const m: Record<string, any> = {};
  for (const [k, v] of Object.entries(p)) m[norm(k)] = v;
  for (const c of candidates) { const nk = norm(c); if (m[nk] != null) return String(m[nk] ?? ""); }
  return "";
}
const retailerKeys = ["Retailer","Dealer","Retailer Name","Retail"];
const cityKeys     = ["City","Town"];
const stateKeys    = ["State","ST","Province"];
const typeKeysBase = ["Type","Location Type","LocationType","location_type","LocType","Loc_Type","Facility Type","Category","Location Category","Site Type"];
const addressKeys  = ["Address","Address1","Address 1","Street","Street1","Addr1"];
const zipKeys      = ["ZIP","Zip","Postal","PostalCode","Postcode"];
const phoneKeys    = ["Phone","Telephone","Tel","Phone #"];

const getRetailer = (p: FeatureProperties) => getProp(p, retailerKeys);
const getCity     = (p: FeatureProperties) => getProp(p, cityKeys);
const getState    = (p: FeatureProperties) => getProp(p, stateKeys);

function inferTypeKey(features: Feature[]): string | null {
  if (!features.length) return null;
  const exclude = new Set([...retailerKeys, ...cityKeys, ...stateKeys, "KINGPIN","Kingpin","IsKingpin","Key Account"]);
  const counts: Record<string, Set<string>> = {};
  for (const f of features) {
    const p = f.properties || {};
    for (const [k, v] of Object.entries(p)) {
      if (exclude.has(k)) continue;
      const val = String(v ?? "").trim();
      if (!counts[k]) counts[k] = new Set();
      if (val) counts[k].add(val);
    }
  }
  let best: { key: string; size: number } | null = null;
  for (const [k, set] of Object.entries(counts)) {
    const size = set.size;
    if (size > 0 && size <= 50) { if (!best || size < best.size) best = { key: k, size }; }
  }
  return best?.key ?? null;
}
function getTypeWithFallback(p: FeatureProperties, fallbackKey: string | null): string {
  const v = getProp(p, typeKeysBase);
  if (v) return v;
  if (fallbackKey) {
    const exact = Object.keys(p).find((k) => k.toLowerCase() === fallbackKey.toLowerCase());
    if (exact) return String(p[exact] ?? "");
    const nk = norm(fallbackKey);
    const map: Record<string, any> = {};
    for (const [k, val] of Object.entries(p)) map[norm(k)] = val;
    if (map[nk] != null) return String(map[nk] ?? "");
  }
  return "";
}

/** Robust KINGPIN detector:
 *  - boolean-ish flags (true/yes/1/Y)
 *  - or any field whose VALUE is exactly "kingpin" / "key account"
 */
const isKingpin = (p: FeatureProperties) => {
  const flagRaw = getProp(p, ["KINGPIN","Kingpin","IsKingpin","Key Account","IsKey","KeyAccount"]);
  const s = String(flagRaw || "").trim().toLowerCase();
  if (s === "true" || s === "yes" || s === "y" || s === "1") return true;
  for (const v of Object.values(p)) {
    const vs = String(v ?? "").trim().toLowerCase();
    if (vs === "kingpin" || vs === "key account" || vs === "keyaccount") return true;
  }
  return false;
};

const dedupe = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));
const toFC = (features: Feature[]): FeatureCollection =>
  ({ type: "FeatureCollection", features } as const);
function splitKingpins(fc: FeatureCollection): { main: FeatureCollection; kingpins: FeatureCollection } {
  const main: Feature[] = [], kp: Feature[] = [];
  for (const f of fc.features) (isKingpin(f.properties || {}) ? kp : main).push(f);
  return { main: toFC(main), kingpins: toFC(kp) };
}

/* ---------------- data fetch ---------------- */
async function tryFetchJson<T>(path: string): Promise<T | null> {
  try { const res = await fetch(path, { cache: "force-cache" }); if (!res.ok) return null; return (await res.json()) as T; }
  catch { return null; }
}
async function fetchFirst<T>(candidates: string[]): Promise<T | null> {
  for (const p of candidates) { const j = await tryFetchJson<T>(p); if (j) return j; }
  return null;
}

/* ---------------- tiny UI blocks ---------------- */
function CheckboxGroup(props: {
  items: string[];
  selected: Set<string>;
  title?: string;
  onToggle: (v: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  const { items, selected, title, onToggle, onAll, onNone } = props;
  return (
    <section className="mb-5">
      {title ? <h2 className="h2 mb-2">{title}</h2> : null}
      <div className="mb-2 flex gap-2" style={{ display: "flex", gap: 8 }}>
        <button className="btn" onClick={onAll}>All</button>
        <button className="btn" onClick={onNone}>None</button>
      </div>
      <div className="checkbox-grid">
        {items.map((v) => (
          <div className="check" key={v || "_"}>
            <input
              id={`${title || "group"}-${v || "_"}`}
              type="checkbox"
              checked={selected.has(v)}
              onChange={() => onToggle(v)}
            />
            <label htmlFor={`${title || "group"}-${v || "_"}`}>{v || "—"}</label>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- page ---------------- */
export default function Page() {
  // data
  const [mainFc, setMainFc] = useState<FeatureCollection | null>(null);
  const [kingpinFc, setKingpinFc] = useState<FeatureCollection | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  // filters
  const [inferredTypeKey, setInferredTypeKey] = useState<string | null>(null);
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
  const [roundTrip, setRoundTrip] = useState<boolean>(false);

  // map style
  const [styleId, setStyleId] = useState<"satellite-streets-v12" | "streets-v12">("satellite-streets-v12");

  // load dataset
  useEffect(() => {
    (async () => {
      const fc =
        (await fetchFirst<FeatureCollection>([
          withBasePath("retailers.geojson"),
          withBasePath("data/retailers.geojson"),
        ])) ?? toFC([]);
      if (!fc.features?.length) setDataError("No features found in retailers.geojson");
      const { main, kingpins } = splitKingpins(fc);
      setInferredTypeKey(inferTypeKey(main.features));
      setMainFc(main);
      setKingpinFc(kingpins);
    })();
  }, []);

  // hydrate filter domains
  useEffect(() => {
    if (!mainFc) return;
    const s = dedupe(mainFc.features.map((f) => getState(f.properties || {})));
    const r = dedupe(mainFc.features.map((f) => getRetailer(f.properties || {})));
    let t = dedupe(mainFc.features.map((f) => getTypeWithFallback(f.properties || {}, inferredTypeKey)));
    // safety: a stray "Kingpin" value should never appear as a user filter
    t = t.filter((v) => String(v || "").trim().toLowerCase() !== "kingpin");
    setStates(s); setRetailers(r); setTypes(t);
    setSelStates(new Set(s)); setSelRetailers(new Set(r)); setSelTypes(new Set(t));
  }, [mainFc, inferredTypeKey]);

  // filtered features
  const filteredFc: FeatureCollection | null = useMemo(() => {
    if (!mainFc) return null;
    const out: Feature[] = [];
    for (const f of mainFc.features) {
      const p = f.properties || {};
      if (!selStates.has(getState(p))) continue;
      if (!selRetailers.has(getRetailer(p))) continue;
      if (!selTypes.has(getTypeWithFallback(p, inferredTypeKey))) continue;
      out.push(f);
    }
    return toFC(out);
  }, [mainFc, selStates, selRetailers, selTypes, inferredTypeKey]);

  // local ZIP index
  useEffect(() => {
    (async () => {
      const idx = await fetchFirst<Record<string, Position>>([
        withBasePath("zips.min.json"),
        withBasePath("data/zips.min.json"),
      ]);
      if (idx) setZipIndex(idx);
    })();
  }, []);

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
    const retailer = getRetailer(p);
    const city = getCity(p);
    const state = getState(p);
    const name = [retailer, city, state].filter(Boolean).join(" · ");
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

  // share links (roundTrip aware)
  const googleHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin = home ? `${home[1]},${home[0]}` : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildGoogleMapsLink(origin, optimized.map((s) => s.coord), { roundTrip });
  }, [optimized, home, roundTrip]);
  const appleHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin = home ? `${home[1]},${home[0]}` : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildAppleMapsLink(origin, optimized.map((s) => s.coord), { roundTrip });
  }, [optimized, home, roundTrip]);
  const wazeHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin = home ? `${home[1]},${home[0]}` : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildWazeLink(origin, optimized.map((s) => s.coord), { roundTrip });
  }, [optimized, home, roundTrip]);

  // helpers for set state
  const toggleSel = (set: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) =>
    set((prev) => { const next = new Set(prev); next.has(v) ? next.delete(v) : next.add(v); return next; });
  const setAll  = (set: React.Dispatch<React.SetStateAction<Set<string>>>, values: string[]) => set(new Set(values));
  const setNone = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => set(new Set());

  return (
    <div className="pane-grid">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <h1 className="h1">Certis AgRoute Planner</h1>

        {dataError ? (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">{dataError}</div>
        ) : null}

        <section className="mb-5">
          <h2 className="h2 mb-2">Home (ZIP)</h2>
          <div className="flex gap-2" style={{ display: "flex", gap: 8 }}>
            <input className="input" value={zipInput} onChange={(e) => setZipInput(e.target.value)} placeholder="e.g. 50309" inputMode="numeric" />
            <button className="btn btn-primary" onClick={setHomeFromZip}>Set</button>
          </div>
          {homeErr ? <div className="mt-2 text-xs" style={{ color:"#fca5a5" }}>ZIP not found (try a 5-digit US ZIP)</div> : null}
          {home ? <div className="mt-2 text-xs" style={{ color:"#9ca3af" }}>Home set at {home[1].toFixed(4)}, {home[0].toFixed(4)}</div> : null}
        </section>

        <CheckboxGroup
          title={`States (${selStates.size} / ${states.length})`}
          items={states}
          selected={selStates}
          onToggle={(v) => toggleSel(setSelStates, v)}
          onAll={() => setAll(setSelStates, states)}
          onNone={() => setNone(setSelStates)}
        />

        <CheckboxGroup
          title={`Retailers (${selRetailers.size} / ${retailers.length})`}
          items={retailers}
          selected={selRetailers}
          onToggle={(v) => toggleSel(setSelRetailers, v)}
          onAll={() => setAll(setSelRetailers, retailers)}
          onNone={() => setNone(setSelRetailers)}
        />

        <div className="mb-1" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
          <h2 className="h2">Location Types ({selTypes.size} / {types.length})</h2>
          <span className="debug-pill" title="Type field in use">field: {inferredTypeKey ?? "Type"}</span>
        </div>
        <CheckboxGroup
          items={types}
          selected={selTypes}
          onToggle={(v) => toggleSel(setSelTypes, v)}
          onAll={() => setAll(setSelTypes, types)}
          onNone={() => setNone(setSelTypes)}
        />

        <section className="mb-5">
          <h2 className="h2 mb-2">Map Style</h2>
          <div className="checkbox-grid">
            <div className="check">
              <input id="style-hybrid" type="radio" name="style" checked={styleId==="satellite-streets-v12"} onChange={()=>setStyleId("satellite-streets-v12")} />
              <label htmlFor="style-hybrid">Hybrid</label>
            </div>
            <div className="check">
              <input id="style-street" type="radio" name="style" checked={styleId==="streets-v12"} onChange={()=>setStyleId("streets-v12")} />
              <label htmlFor="style-street">Street</label>
            </div>
          </div>
        </section>

        <section className="mb-5">
          <h2 className="h2 mb-2">Trip Builder</h2>
          <div className="mb-2" style={{ fontSize: 13 }}>
            {stops.length === 0 ? <span style={{ color:"#94a3b8" }}>Click map points to add stops…</span> :
              stops.map((s, i) => <span key={`${s.name}-${i}`}>{i+1}. {s.name}{i<stops.length-1?" · ":""}</span>)
            }
          </div>
          <div className="mb-2 check" style={{ width:"fit-content" }}>
            <input id="roundtrip" type="checkbox" checked={roundTrip} onChange={()=>setRoundTrip(v=>!v)} />
            <label htmlFor="roundtrip">Return to start (round trip)</label>
          </div>
          <div className="flex gap-2" style={{ display:"flex", gap:8 }}>
            <button className="btn btn-primary" onClick={optimize}>Optimize</button>
            <button className="btn" onClick={clearStops}>Clear</button>
          </div>
          {optimized.length > 0 ? (
            <div className="mt-3" style={{ display:"flex", flexDirection:"column", gap:6, fontSize:14 }}>
              <a target="_blank" rel="noreferrer" href={googleHref}>Open in Google Maps</a>
              <a target="_blank" rel="noreferrer" href={appleHref}>Open in Apple Maps</a>
              <a target="_blank" rel="noreferrer" href={wazeHref}>Open in Waze</a>
            </div>
          ) : null}
          <div className="mt-3" style={{ fontSize:11, color:"#9ca3af" }}>
            KINGPINs are always visible (separate source) and unaffected by filters.
          </div>
        </section>
      </aside>

      {/* MAP */}
      <main className="map-area">
        <div className="card">
          {filteredFc && kingpinFc ? (
            <CertisMap
              data={filteredFc as any}
              kingpins={kingpinFc as any}
              home={home as any}
              onPointClick={addStop as any}
              styleId={styleId}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-400" style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:"#9ca3af" }}>
              Loading map…
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
