"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Map from "@/components/Map";

type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, any>;
type Feature = GeoJSON.Feature<GeoJSON.Geometry, any>;

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN || "";

type Stop = { coord: [number, number]; title?: string };

// --- helpers ---------------------------------------------------------------

function getProp(f: any, names: string[], fallback = ""): string {
  for (const n of names) if (f?.properties?.[n] != null) return String(f.properties[n]);
  return fallback;
}
const K = {
  retailer: ["__retailerName", "Retailer", "retailer", "RETAILER"],
  name:     ["Name", "name", "NAME"],
  cat:      ["Category", "category", "CATEGORY"],
  state:    ["State", "state", "STATE"],
};

const toLngLat = (f: Feature | null): [number, number] | null => {
  const c: any = (f?.geometry as any)?.coordinates;
  return Array.isArray(c) && c.length === 2 && isFinite(c[0]) && isFinite(c[1]) ? [c[0], c[1]] : null;
};

const bboxOf = (fc: FC | null): [number, number, number, number] | null => {
  if (!fc) return null;
  let minX= Infinity, minY= Infinity, maxX= -Infinity, maxY= -Infinity, any=false;
  for (const f of fc.features) {
    const c = toLngLat(f);
    if (!c) continue;
    any=true;
    minX=Math.min(minX,c[0]); minY=Math.min(minY,c[1]);
    maxX=Math.max(maxX,c[0]); maxY=Math.max(maxY,c[1]);
  }
  return any ? [minX,minY,maxX,maxY] : null;
};

// chunk helpers
function chunkByCount<T>(arr: T[], max: number): T[][] {
  const out: T[][] = [];
  for (let i=0; i<arr.length; i+=max) out.push(arr.slice(i,i+max));
  return out;
}
function chunkByDuration(sec: number[], maxSec = 36000): number[][] {
  const groups: number[][] = [];
  let cur: number[] = []; let sum = 0;
  for (let i=0;i<sec.length;i++){
    if (sum + sec[i] > maxSec && cur.length) { groups.push(cur); cur=[]; sum=0; }
    cur.push(i); sum += sec[i];
  }
  if (cur.length) groups.push(cur);
  return groups;
}

// optimization -> build combined google / best-effort apple/waze
function buildGoogleLink(origin: [number,number], ordered: [number,number][], roundtrip: boolean) {
  // Google allows origin+dest + up to ~23 waypoints (24 legs)
  const pts = [...ordered];
  const dest = roundtrip ? origin : pts.pop() || origin;
  const wps  = pts;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api","1");
  url.searchParams.set("origin", `${origin[1]},${origin[0]}`);
  url.searchParams.set("destination", `${dest[1]},${dest[0]}`);
  if (wps.length) url.searchParams.set("waypoints", wps.map(p=>`${p[1]},${p[0]}`).join("|"));
  url.searchParams.set("travelmode","driving");
  return url.toString();
}
function buildAppleLink(origin: [number,number], ordered: [number,number][], roundtrip: boolean) {
  const pts = [...ordered];
  const dest = roundtrip ? origin : pts.pop() || origin;
  const base = new URL("https://maps.apple.com/");
  base.searchParams.set("saddr", `${origin[1]},${origin[0]}`);
  base.searchParams.set("daddr", [dest, ...pts.map(p=>({lat:p[1],lng:p[0]}))]
    .map((p,i)=> (i===0?`${(p as any).lat},${(p as any).lng}`:`to:${(p as any).lat},${(p as any).lng}`)).join(" "));
  base.searchParams.set("dirflg","d");
  return base.toString();
}
function buildWazeLink(dest: [number,number]) {
  const u = new URL("https://waze.com/ul");
  u.searchParams.set("ll", `${dest[1]},${dest[0]}`);
  u.searchParams.set("navigate","yes");
  return u.toString();
}

// ---------------------------------------------------------------------------

export default function Page() {
  const [data, setData] = useState<FC>({ type:"FeatureCollection", features:[] });
  const [filtered, setFiltered] = useState<FC>({ type:"FeatureCollection", features:[] });

  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);

  const [selStates, setSelStates] = useState<Set<string>>(new Set());
  const [selRetailers, setSelRetailers] = useState<Set<string>>(new Set());
  const [selCats, setSelCats] = useState<Set<string>>(new Set());

  const [basemap, setBasemap] = useState<"hybrid"|"streets">("hybrid");
  const [markerStyle, setMarkerStyle] = useState<"dots"|"logos">("dots");

  const [home, setHome] = useState<[number,number] | null>(null);
  const [homeInput, setHomeInput] = useState("");
  const [stops, setStops] = useState<Stop[]>([]);
  const [roundtrip, setRoundtrip] = useState(true);

  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
  const [optOrder, setOptOrder] = useState<[number,number][]>([]);
  const [optDurations, setOptDurations] = useState<number[]>([]);

  // load geojson
  useEffect(() => {
    (async () => {
      const url = `${BASE_PATH}/data/retailers.geojson`;
      const r = await fetch(url, { cache: "no-store" });
      const fc: FC = await r.json();
      // normalize retailer name
      for (const f of fc.features) {
        if (!f.properties.__retailerName) f.properties.__retailerName = getProp(f, K.retailer);
      }
      setData(fc);

      // vocab
      const st = new Set<string>(), re = new Set<string>(), ca = new Set<string>();
      for (const f of fc.features) {
        const s = getProp(f, K.state).trim(); if (s) st.add(s);
        const r = getProp(f, K.retailer).trim(); if (r) re.add(r);
        const c = getProp(f, K.cat).trim(); if (c) ca.add(c);
      }
      setStates([...st].sort());
      setRetailers([...re].sort());
      setCats([...ca].sort());
    })();
  }, []);

  // filtering
  useEffect(() => {
    const match = (f: Feature) => {
      const s = getProp(f, K.state);
      const r = getProp(f, K.retailer);
      const c = getProp(f, K.cat);
      const okS = !selStates.size || selStates.has(s);
      const okR = !selRetailers.size || selRetailers.has(r);
      const okC = !selCats.size || selCats.has(c);
      return okS && okR && okC && !!(f.geometry as any)?.coordinates;
    };
    const features = data.features.filter(match);
    setFiltered({ type:"FeatureCollection", features });
  }, [data, selStates, selRetailers, selCats]);

  const fcBbox = useMemo(() => bboxOf(filtered), [filtered]);

  // reset map
  const resetAll = () => {
    setSelStates(new Set());
    setSelRetailers(new Set());
    setSelCats(new Set());
    setHome(null);
    setHomeInput("");
    setStops([]);
    setRouteGeoJSON(null);
    setOptOrder([]);
    setOptDurations([]);
  };

  // click map -> add stop
  const handlePointClick = (lnglat: [number,number], title: string) => {
    setStops((prev) => [...prev, { coord: lnglat, title }]);
  };

  // dblclick -> set home
  const handleDbl = (lnglat: [number,number]) => {
    setHome(lnglat);
  };

  // geocode home input (ZIP or addr) via Mapbox forward geocoding
  const geocodeHome = async () => {
    const q = homeInput.trim();
    if (!q) return;
    try {
      const u = new URL("https://api.mapbox.com/geocoding/v5/mapbox.places/"+encodeURIComponent(q)+".json");
      u.searchParams.set("access_token", MAPBOX_TOKEN);
      u.searchParams.set("limit","1");
      const r = await fetch(u.toString());
      const j = await r.json();
      const c = j?.features?.[0]?.center;
      if (Array.isArray(c) && c.length===2) setHome([c[0], c[1]]);
    } catch {}
  };

  // optimization
  const optimize = async () => {
    if (!MAPBOX_TOKEN) return;
    if (!home || stops.length===0) return;

    const coords = [home, ...stops.map(s=>s.coord), ...(roundtrip ? [home] : [])];
    const u = new URL("https://api.mapbox.com/optimized-trips/v1/mapbox/driving/"+coords.map(c=>c.join(",")).join(";"));
    u.searchParams.set("source","first");
    u.searchParams.set("destination", roundtrip ? "last" : "last");
    u.searchParams.set("roundtrip", roundtrip ? "true" : "false");
    u.searchParams.set("geometries","geojson");
    u.searchParams.set("overview","full");
    u.searchParams.set("access_token", MAPBOX_TOKEN);

    const r = await fetch(u.toString());
    const j = await r.json();

    const trip = j?.trips?.[0];
    if (!trip) return;

    setRouteGeoJSON(trip.geometry);
    // build ordered coords (excluding repeated home if roundtrip)
    const wpIdx = j.waypoints?.map((w:any)=>w.waypoint_index);
    const ordered: [number,number][] = [];
    for (const idx of wpIdx) {
      const c = coords[idx];
      if (c) ordered.push([c[0], c[1]]);
    }
    // remove final home dup in ordered (Mapbox repeats)
    if (roundtrip && ordered.length && ordered[0][0]===ordered[ordered.length-1][0] && ordered[0][1]===ordered[ordered.length-1][1]) {
      ordered.pop();
    }
    // durations per leg if available (approx)
    const legsDur: number[] = (trip.legs || []).map((l:any)=> Number(l.duration||0));
    setOptDurations(legsDur);
    // exclude the very first element (home) for convenience
    const orderedStops = ordered.slice(1);
    setOptOrder(orderedStops);
  };

  const googleLinksCombined = useMemo(() => {
    if (!home || optOrder.length===0) return [];
    // Google limits: origin+dest + up to ~23 waypoints
    const MAX_WPS = 23;
    const chunks = chunkByCount(optOrder, MAX_WPS);
    return chunks.map((chunk, i) => ({ i, url: buildGoogleLink(home, chunk, roundtrip) }));
  }, [home, optOrder, roundtrip]);

  const googleLinksDurationChunks = useMemo(() => {
    if (!home || optOrder.length===0 || optDurations.length===0) return [];
    // split by ~10 hours (36000s) using legs durations
    const groups = chunkByDuration(optDurations, 36000);
    // convert group of leg-indexes into coordinate waypoints
    const out: {i:number, url:string}[] = [];
    let cursor = 0;
    for (let g=0; g<groups.length; g++) {
      const count = groups[g].length;
      const slice = optOrder.slice(cursor, cursor+count);
      out.push({ i:g, url: buildGoogleLink(home!, slice, roundtrip) });
      cursor += count;
    }
    return out;
  }, [home, optOrder, optDurations, roundtrip]);

  return (
    <div className="min-h-screen w-full flex bg-zinc-900 text-zinc-100">
      {/* LEFT COLUMN */}
      <div className="w-[380px] max-w-[380px] flex flex-col border-r border-zinc-800">
        {/* Header w/ logo & Reset Map (right aligned) */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <img src={`${BASE_PATH}/certis-logo.png`} alt="Certis" className="h-9 w-auto" />
            <span className="text-xs text-zinc-400">Filter retailers and plan optimized trips. Double-click map to set <b>Home</b>. Click a point to <b>add stop</b>.</span>
          </div>
          <button
            onClick={resetAll}
            className="ml-3 inline-flex items-center rounded-lg bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 text-sm font-semibold shadow"
            title="Clear filters, home, stops and route"
          >
            Reset Map
          </button>
        </div>

        {/* Controls */}
        <div className="p-4 overflow-y-auto">
          {/* STATES */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">States</h3>
              <div className="flex gap-2">
                <button className="px-2 py-0.5 rounded bg-zinc-800" onClick={()=>setSelStates(new Set(states))}>All</button>
                <button className="px-2 py-0.5 rounded bg-zinc-800" onClick={()=>setSelStates(new Set())}>None</button>
              </div>
            </div>
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {states.map(s => {
                const on = selStates.has(s);
                return (
                  <label key={s} className={`flex items-center justify-between rounded-xl px-3 py-2 border ${on?"border-emerald-500/60 bg-emerald-500/10":"border-zinc-800"}`}>
                    <span>{s}</span>
                    <input type="checkbox" checked={on} onChange={(e)=>{
                      const next = new Set(selStates);
                      e.target.checked ? next.add(s) : next.delete(s);
                      setSelStates(next);
                    }} />
                  </label>
                );
              })}
            </div>
          </div>

          {/* RETAILERS */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Retailers</h3>
              <div className="flex gap-2">
                <button className="px-2 py-0.5 rounded bg-zinc-800" onClick={()=>setSelRetailers(new Set(retailers))}>All</button>
                <button className="px-2 py-0.5 rounded bg-zinc-800" onClick={()=>setSelRetailers(new Set())}>None</button>
              </div>
            </div>
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {retailers.map(r => {
                const on = selRetailers.has(r);
                return (
                  <label key={r} className={`flex items-center justify-between rounded-xl px-3 py-2 border ${on?"border-sky-500/60 bg-sky-500/10":"border-zinc-800"}`}>
                    <span className="truncate">{r}</span>
                    <input type="checkbox" checked={on} onChange={(e)=>{
                      const next = new Set(selRetailers);
                      e.target.checked ? next.add(r) : next.delete(r);
                      setSelRetailers(next);
                    }} />
                  </label>
                );
              })}
            </div>
          </div>

          {/* CATEGORIES */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Categories</h3>
              <div className="flex gap-2">
                <button className="px-2 py-0.5 rounded bg-zinc-800" onClick={()=>setSelCats(new Set(cats))}>All</button>
                <button className="px-2 py-0.5 rounded bg-zinc-800" onClick={()=>setSelCats(new Set())}>None</button>
              </div>
            </div>
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {cats.map(c => {
                const on = selCats.has(c);
                return (
                  <label key={c} className={`flex items-center justify-between rounded-xl px-3 py-2 border ${on?"border-violet-500/60 bg-violet-500/10":"border-zinc-800"}`}>
                    <span>{c}</span>
                    <input type="checkbox" checked={on} onChange={(e)=>{
                      const next = new Set(selCats);
                      e.target.checked ? next.add(c) : next.delete(c);
                      setSelCats(next);
                    }} />
                  </label>
                );
              })}
            </div>
          </div>

          {/* Map options */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 mb-4">
            <h3 className="font-semibold mb-3">Map Options</h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <span>Basemap</span>
                <select className="bg-zinc-800 rounded px-2 py-1" value={basemap} onChange={e=>setBasemap(e.target.value as any)}>
                  <option value="hybrid">Hybrid</option>
                  <option value="streets">Streets</option>
                </select>
              </label>
              <label className="flex items-center justify-between">
                <span>Markers</span>
                <select className="bg-zinc-800 rounded px-2 py-1" value={markerStyle} onChange={e=>setMarkerStyle(e.target.value as any)}>
                  <option value="dots">Colored dots</option>
                  <option value="logos">Retailer logos</option>
                </select>
              </label>
            </div>
          </div>

          {/* Trip planner */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 mb-36">
            <h3 className="font-semibold mb-3">Trip Planner</h3>
            <label className="block text-sm mb-2">Home (ZIP or address, or double-click map)</label>
            <div className="flex gap-2 mb-2">
              <input value={homeInput} onChange={e=>setHomeInput(e.target.value)} placeholder="ZIP or address (e.g., 50638)" className="flex-1 bg-zinc-800 rounded px-3 py-2" />
              <button onClick={geocodeHome} className="rounded bg-emerald-600 hover:bg-emerald-500 px-3 text-white font-semibold">Set</button>
            </div>
            <div className="text-xs text-zinc-400 mb-3">{home ? `Home: ${home[1].toFixed(6)}, ${home[0].toFixed(6)}` : "Home not set"}</div>

            <label className="flex items-center gap-2 mb-3 text-sm">
              <input type="checkbox" checked={roundtrip} onChange={e=>setRoundtrip(e.target.checked)} />
              Roundtrip
            </label>

            <div className="flex gap-2">
              <button onClick={optimize} className="rounded bg-sky-600 hover:bg-sky-500 px-3 py-2 text-white font-semibold">Optimize Trip</button>
              <button onClick={()=>{setStops([]); setRouteGeoJSON(null); setOptOrder([]);}} className="rounded bg-zinc-700 hover:bg-zinc-600 px-3 py-2 font-semibold">Clear Trip</button>
            </div>

            {stops.length>0 && (
              <div className="mt-4">
                <div className="font-semibold mb-2">Stops ({stops.length})</div>
                <ol className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {stops.map((s,i)=>(
                    <li key={i} className="flex items-center justify-between text-sm bg-zinc-800 rounded px-2 py-1">
                      <span className="truncate">{i+1}. {s.title || `${s.coord[1].toFixed(4)}, ${s.coord[0].toFixed(4)}`}</span>
                      <button className="text-rose-400 hover:text-rose-300" onClick={()=>setStops(prev=>prev.filter((_,k)=>k!==i))}>Remove</button>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {optOrder.length>0 && (
              <div className="mt-6">
                <div className="font-semibold mb-2">Navigation links</div>
                {/* Combined Google (by count) */}
                <div className="text-sm mb-1 text-zinc-300">Google (max waypoints per link):</div>
                <ul className="list-disc list-inside space-y-1">
                  {googleLinksCombined.map(g=>(
                    <li key={g.i}><a className="text-sky-400 hover:underline" href={g.url} target="_blank">Google link {g.i+1}</a></li>
                  ))}
                </ul>

                {/* Optional duration-based chunking (~10h) */}
                {googleLinksDurationChunks.length>1 && (
                  <>
                    <div className="text-sm mt-4 mb-1 text-zinc-300">Google (split ~10 hours per link):</div>
                    <ul className="list-disc list-inside space-y-1">
                      {googleLinksDurationChunks.map(g=>(
                        <li key={g.i}><a className="text-sky-400 hover:underline" href={g.url} target="_blank">~10h chunk {g.i+1}</a></li>
                      ))}
                    </ul>
                  </>
                )}

                {/* Best-effort Apple/Waze (single dest / limited to small sequences) */}
                {home && optOrder.length>0 && (
                  <div className="text-sm mt-4 space-y-1">
                    <div>Apple (best-effort): <a className="text-sky-400 hover:underline" href={buildAppleLink(home, optOrder.slice(0,8), roundtrip)} target="_blank">Open</a></div>
                    <div>Waze (to last stop): <a className="text-sky-400 hover:underline" href={buildWazeLink(optOrder[optOrder.length-1])} target="_blank">Open</a></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MAP */}
      <div className="flex-1">
        <Map
          basePath={BASE_PATH}
          token={MAPBOX_TOKEN}
          basemap={basemap}
          markerStyle={markerStyle}
          data={filtered}
          bbox={fcBbox}
          home={home}
          stops={stops}
          routeGeoJSON={routeGeoJSON}
          onMapDblClick={handleDbl}
          onPointClick={handlePointClick}
        />
      </div>
    </div>
  );
}
