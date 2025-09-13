"use client";

import { useEffect, useMemo, useState } from "react";
import CertisMap from "@/components/CertisMap";
import type { CertisMapProps } from "@/components/CertisMap";

type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, any>;
type Feature = GeoJSON.Feature<GeoJSON.Geometry, any>;

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
  process.env.MAPBOX_PUBLIC_TOKEN ||
  "";

const K = {
  retailer: ["__retailerName", "Retailer", "retailer", "RETAILER"],
  name:     ["Name", "name", "NAME"],
  cat:      ["Category", "category", "CATEGORY"],
  state:    ["State", "state", "STATE"],
  addr:     ["Address", "address", "ADDRESS"],
  city:     ["City", "city", "CITY"],
  zip:      ["Zip", "zip", "ZIP"],
};

function getProp(f: any, names: string[], fallback = ""): string {
  for (const n of names) if (f?.properties?.[n] != null) return String(f.properties[n]);
  return fallback;
}
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

type Stop = { coord: [number, number]; title?: string };

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

function buildGoogleLink(origin: [number,number], ordered: [number,number][], roundtrip: boolean) {
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
  base.searchParams.set(
    "daddr",
    [dest, ...pts.map(p=>({lat:p[1],lng:p[0]}))]
      .map((p,i)=> (i===0?`${(p as any).lat},${(p as any).lng}`:`to:${(p as any).lat},${(p as any).lng}`))
      .join(" ")
  );
  base.searchParams.set("dirflg","d");
  return base.toString();
}
function buildWazeLink(dest: [number,number]) {
  const u = new URL("https://waze.com/ul");
  u.searchParams.set("ll", `${dest[1]},${dest[0]}`); u.searchParams.set("navigate","yes");
  return u.toString();
}

export default function Page() {
  // data
  const [data, setData] = useState<FC>({ type:"FeatureCollection", features:[] });
  const [filtered, setFiltered] = useState<FC>({ type:"FeatureCollection", features:[] });

  // filters
  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);

  const [selStates, setSelStates] = useState<Set<string>>(new Set());
  const [selRetailers, setSelRetailers] = useState<Set<string>>(new Set());
  const [selCats, setSelCats] = useState<Set<string>>(new Set());

  // map options
  const [basemap, setBasemap] = useState<CertisMapProps["basemap"]>("hybrid");
  const [markerStyle, setMarkerStyle] = useState<CertisMapProps["markerStyle"]>("dots");

  // trip planning
  const [home, setHome] = useState<[number,number] | null>(null);
  const [homeInput, setHomeInput] = useState("");
  const [stops, setStops] = useState<Stop[]>([]);
  const [roundtrip, setRoundtrip] = useState(true);

  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
  const [optOrder, setOptOrder] = useState<[number,number][]>([]);
  const [optDurations, setOptDurations] = useState<number[]>([]);

  // load data
  useEffect(() => {
    (async () => {
      const url = `${BASE_PATH}/data/retailers.geojson`;
      const r = await fetch(url, { cache:"no-store" });
      const fc: FC = await r.json();
      for (const f of fc.features) {
        if (!f.properties.__retailerName) f.properties.__retailerName = getProp(f, K.retailer);
      }
      setData(fc);

      const st = new Set<string>(), re = new Set<string>(), ca = new Set<string>();
      for (const f of fc.features) {
        const s = getProp(f, K.state).trim();     if (s) st.add(s);
        const rr= getProp(f, K.retailer).trim();  if (rr) re.add(rr);
        const c = getProp(f, K.cat).trim();       if (c) ca.add(c);
      }
      setStates([...st].sort());
      setRetailers([...re].sort());
      setCats([...ca].sort());
    })();
  }, []);

  // apply filters
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
    setFiltered({ type:"FeatureCollection", features: data.features.filter(match) });
  }, [data, selStates, selRetailers, selCats]);

  const fcBbox = useMemo(() => bboxOf(filtered), [filtered]);

  // actions
  const resetAll = () => {
    setSelStates(new Set()); setSelRetailers(new Set()); setSelCats(new Set());
    setHome(null); setHomeInput(""); setStops([]); setRouteGeoJSON(null); setOptOrder([]); setOptDurations([]);
  };
  const toggle = (s: Set<string>, v: string) => {
    const n = new Set(s);
    if (n.has(v)) n.delete(v); else n.add(v);
    return n;
  };

  const onPointClick = (lnglat: [number,number], title: string) =>
    setStops((prev) => [...prev, { coord: lnglat, title }]);

  const geocodeHome = async () => {
    const q = homeInput.trim();
    if (!q || !MAPBOX_TOKEN) return;
    try {
      const u = new URL("https://api.mapbox.com/geocoding/v5/mapbox.places/"+encodeURIComponent(q)+".json");
      u.searchParams.set("access_token", MAPBOX_TOKEN); u.searchParams.set("limit","1");
      const r = await fetch(u.toString()); const j = await r.json();
      const c = j?.features?.[0]?.center;
      if (Array.isArray(c) && c.length===2) setHome([c[0], c[1]]);
    } catch {}
  };

  const optimize = async () => {
    if (!MAPBOX_TOKEN || !home || stops.length===0) return;
    const coords = [home, ...stops.map(s=>s.coord), ...(roundtrip ? [home] : [])];
    const u = new URL("https://api.mapbox.com/optimized-trips/v1/mapbox/driving/"+coords.map(c=>c.join(",")).join(";"));
    u.searchParams.set("source","first");
    u.searchParams.set("destination", roundtrip ? "last" : "last");
    u.searchParams.set("roundtrip", roundtrip ? "true" : "false");
    u.searchParams.set("geometries","geojson");
    u.searchParams.set("overview","full");
    u.searchParams.set("access_token", MAPBOX_TOKEN);

    const r = await fetch(u.toString()); const j = await r.json();
    const trip = j?.trips?.[0]; if (!trip) return;

    setRouteGeoJSON(trip.geometry);

    const wpIdx = j.waypoints?.map((w:any)=>w.waypoint_index);
    const ordered: [number,number][] = [];
    for (const idx of wpIdx) {
      const c = coords[idx]; if (c) ordered.push([c[0], c[1]]);
    }
    if (roundtrip && ordered.length && ordered[0][0]===ordered[ordered.length-1][0] && ordered[0][1]===ordered[ordered.length-1][1]) {
      ordered.pop();
    }
    const legsDur: number[] = (trip.legs || []).map((l:any)=> Number(l.duration||0));
    setOptDurations(legsDur);
    setOptOrder(ordered.slice(1)); // remove initial home
  };

  const googleLinksCombined = useMemo(() => {
    if (!home || optOrder.length===0) return [];
    const MAX_WPS = 23;
    const chunks = chunkByCount(optOrder, MAX_WPS);
    return chunks.map((chunk, i) => ({ i, url: buildGoogleLink(home, chunk, roundtrip) }));
  }, [home, optOrder, roundtrip]);

  const googleLinksDurationChunks = useMemo(() => {
    if (!home || optOrder.length===0 || optDurations.length===0) return [];
    const groups = chunkByDuration(optDurations, 36000);
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
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <img src={`${BASE_PATH}/certis-logo.png`} alt="Certis" className="h-9 w-auto" />
            <span className="text-xs text-zinc-400">
              Filter retailers and plan optimized trips. Double-click map to set <b>Home</b>. Click a point to <b>add stop</b>.
            </span>
          </div>
          <button
            onClick={() => resetAll()}
            className="ml-3 inline-flex items-center rounded-lg bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 text-sm font-semibold shadow"
            title="Clear filters, home, stops and route"
          >
            Reset Map
          </button>
        </div>

        {/* STATES */}
        <div className="p-4">
          <div className="rounded-xl bg-zinc-800/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">States</h3>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-400">{`${selStates.size} of ${states.length}`}</span>
                <button className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600"
                  onClick={() => setSelStates(new Set(states))}>All</button>
                <button className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600"
                  onClick={() => setSelStates(new Set())}>None</button>
              </div>
            </div>
            <div className="h-44 overflow-auto space-y-2 pr-1">
              {states.map(s => (
                <label key={s} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${selStates.has(s) ? "border-emerald-500/60 bg-emerald-500/10" : "border-zinc-700/60 bg-zinc-900/40"}`}>
                  <input type="checkbox" checked={selStates.has(s)} onChange={() => setSelStates(prev => toggle(prev, s))} />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* RETAILERS */}
        <div className="px-4">
          <div className="rounded-xl bg-zinc-800/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Retailers</h3>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-400">{`${selRetailers.size} of ${retailers.length}`}</span>
                <button className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600"
                  onClick={() => setSelRetailers(new Set(retailers))}>All</button>
                <button className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600"
                  onClick={() => setSelRetailers(new Set())}>None</button>
              </div>
            </div>
            <div className="h-52 overflow-auto space-y-2 pr-1">
              {retailers.map(r => (
                <label key={r} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${selRetailers.has(r) ? "border-emerald-500/60 bg-emerald-500/10" : "border-zinc-700/60 bg-zinc-900/40"}`}>
                  <input type="checkbox" checked={selRetailers.has(r)} onChange={() => setSelRetailers(prev => toggle(prev, r))} />
                  <span className="truncate">{r}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* CATEGORIES */}
        <div className="p-4 pt-4">
          <div className="rounded-xl bg-zinc-800/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Categories</h3>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-400">{`${selCats.size} of ${cats.length}`}</span>
                <button className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600"
                  onClick={() => setSelCats(new Set(cats))}>All</button>
                <button className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600"
                  onClick={() => setSelCats(new Set())}>None</button>
              </div>
            </div>
            <div className="space-y-2">
              {cats.map(c => (
                <label key={c} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${selCats.has(c) ? "border-emerald-500/60 bg-emerald-500/10" : "border-zinc-700/60 bg-zinc-900/40"}`}>
                  <input type="checkbox" checked={selCats.has(c)} onChange={() => setSelCats(prev => toggle(prev, c))} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* MAP OPTIONS */}
        <div className="px-4 pt-2">
          <div className="rounded-xl bg-zinc-800/60 p-4 space-y-3">
            <h3 className="font-semibold">Map Options</h3>
            <label className="block text-sm text-zinc-300">Basemap</label>
            <select className="w-full rounded bg-zinc-900 border border-zinc-700 px-3 py-2"
              value={basemap} onChange={(e)=>setBasemap(e.target.value as CertisMapProps["basemap"])}>
              <option value="hybrid">Hybrid</option>
              <option value="streets">Streets</option>
            </select>

            <label className="block pt-2 text-sm text-zinc-300">Markers</label>
            <select className="w-full rounded bg-zinc-900 border border-zinc-700 px-3 py-2"
              value={markerStyle} onChange={(e)=>setMarkerStyle(e.target.value as CertisMapProps["markerStyle"])}>
              <option value="dots">Colored dots</option>
              <option value="logos">Retailer logos</option>
            </select>
          </div>
        </div>

        {/* TRIP PLANNER */}
        <div className="p-4">
          <div className="rounded-xl bg-zinc-800/60 p-4 space-y-3">
            <h3 className="font-semibold">Trip Planner</h3>

            <div className="flex gap-2">
              <input
                className="flex-1 rounded bg-zinc-900 border border-zinc-700 px-3 py-2"
                placeholder="ZIP or address (e.g., 50638)"
                value={homeInput}
                onChange={(e)=>setHomeInput(e.target.value)}
              />
              <button onClick={geocodeHome} className="px-3 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold">Set</button>
            </div>

            <div className="text-xs text-zinc-400">
              {home ? `Home: ${home[1].toFixed(5)}, ${home[0].toFixed(5)}` : "Double-click the map to set Home"}
            </div>

            <div className="mt-2 space-y-2">
              <div className="text-sm font-semibold mb-1">Stops (click map points to add)</div>
              {stops.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded border border-zinc-700 bg-zinc-900 px-3 py-2">
                  <span className="truncate">{i+1}. {s.title || `${s.coord[1].toFixed(4)}, ${s.coord[0].toFixed(4)}`}</span>
                  <button className="ml-3 text-sm px-2 py-1 rounded bg-rose-600 hover:bg-rose-500"
                    onClick={()=>setStops(prev => prev.filter((_,idx)=>idx!==i))}>Remove</button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input id="rt" type="checkbox" checked={roundtrip} onChange={(e)=>setRoundtrip(e.target.checked)} />
              <label htmlFor="rt">Roundtrip</label>
            </div>

            <div className="flex gap-2 pt-2">
              <button className="flex-1 rounded bg-sky-600 hover:bg-sky-500 font-semibold px-3 py-2"
                onClick={optimize}>Optimize Trip</button>
              <button className="px-3 rounded bg-zinc-700 hover:bg-zinc-600"
                onClick={()=>{ setStops([]); setRouteGeoJSON(null); setOptOrder([]); setOptDurations([]); }}>Clear Trip</button>
            </div>

            {(home && optOrder.length>0) && (
              <div className="pt-3 space-y-1 text-sm">
                <div className="font-semibold">Open in maps (combined into chunks)</div>
                {googleLinksCombined.map(g => (
                  <div key={g.i} className="flex gap-3">
                    <a className="underline" href={g.url} target="_blank">Google #{g.i+1}</a>
                    <a className="underline" href={buildAppleLink(home!, optOrder.slice(g.i*23,(g.i+1)*23), roundtrip)} target="_blank">Apple</a>
                    <a className="underline" href={buildWazeLink(optOrder[Math.min(optOrder.length-1, (g.i+1)*23-1)]!)} target="_blank">Waze</a>
                  </div>
                ))}
                {googleLinksCombined.length===0 && googleLinksDurationChunks.length>0 && (
                  <>
                    <div className="pt-2 text-zinc-400">~10-hour chunks</div>
                    {googleLinksDurationChunks.map(g => (
                      <div key={`dur-${g.i}`} className="flex gap-3">
                        <a className="underline" href={g.url} target="_blank">Google #{g.i+1}</a>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MAP */}
      <div className="flex-1">
        <CertisMap
          basePath={BASE_PATH}
          token={MAPBOX_TOKEN}
          basemap={basemap}
          markerStyle={markerStyle}
          data={filtered}
          bbox={fcBbox}
          home={home}
          stops={stops}
          routeGeoJSON={routeGeoJSON}
          onMapDblClick={(lnglat)=>setHome(lnglat)}
          onPointClick={onPointClick}
        />
      </div>
    </div>
  );
}
