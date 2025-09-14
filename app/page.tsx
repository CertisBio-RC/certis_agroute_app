// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import CertisMap from "@/components/CertisMap";
import { withBasePath } from "@/utils/paths";
import * as Route from "@/utils/routing";

type Position = [number, number];
interface FeatureProperties {
  Retailer?: string;
  City?: string;
  State?: string;
  Type?: string;
  ["Location Type"]?: string;
  LocationType?: string;
  KINGPIN?: boolean;
  [key: string]: any;
}
interface Feature {
  type: "Feature";
  id?: string | number;
  properties: FeatureProperties;
  geometry: { type: "Point"; coordinates: Position };
}
interface FeatureCollection {
  type: "FeatureCollection";
  features: Feature[];
}
export type Stop = { name: string; coord: Position };

const dedupe = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));
const getTypeProp = (p: FeatureProperties) =>
  p.Type ?? p.LocationType ?? p["Location Type"] ?? "";

function splitKingpins(fc: FeatureCollection): {
  main: FeatureCollection;
  kingpins: FeatureCollection;
} {
  const main: Feature[] = [];
  const kp: Feature[] = [];
  for (const f of fc.features) (f.properties?.KINGPIN ? kp : main).push(f);
  return {
    main: { type: "FeatureCollection", features: main },
    kingpins: { type: "FeatureCollection", features: kp },
  };
}

async function tryFetchJson<T = any>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: "force-cache" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
async function fetchFirstAvailable<T = any>(candidates: string[]): Promise<T | null> {
  for (const p of candidates) {
    const j = await tryFetchJson<T>(p);
    if (j) return j;
  }
  return null;
}

export default function Page() {
  // Data
  const [mainFc, setMainFc] = useState<FeatureCollection | null>(null);
  const [kingpinFc, setKingpinFc] = useState<FeatureCollection | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  // Filters
  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);

  const [selStates, setSelStates] = useState<Set<string>>(new Set());
  const [selRetailers, setSelRetailers] = useState<Set<string>>(new Set());
  const [selTypes, setSelTypes] = useState<Set<string>>(new Set());

  // Home (ZIP)
  const [zipInput, setZipInput] = useState("");
  const [home, setHome] = useState<Position | null>(null);
  const [homeErr, setHomeErr] = useState<string | null>(null);
  const [zipIndex, setZipIndex] = useState<Record<string, Position> | null>(null);

  // Trip
  const [stops, setStops] = useState<Stop[]>([]);
  const [optimized, setOptimized] = useState<Stop[]>([]);

  // Load dataset
  useEffect(() => {
    (async () => {
      try {
        const fc =
          (await fetchFirstAvailable<FeatureCollection>([
            withBasePath("retailers.geojson"),
            withBasePath("data/retailers.geojson"),
          ])) ?? ({ type: "FeatureCollection", features: [] } as FeatureCollection);

        if (!fc.features?.length) setDataError("No features found in retailers.geojson");

        const { main, kingpins } = splitKingpins(fc);
        setMainFc(main);
        setKingpinFc(kingpins);
      } catch (e: any) {
        setDataError(e?.message || "Failed to load dataset");
      }
    })();
  }, []);

  // Build filter domains
  useEffect(() => {
    if (!mainFc) return;
    const s = dedupe(mainFc.features.map((f) => f.properties?.State || ""));
    const r = dedupe(mainFc.features.map((f) => f.properties?.Retailer || ""));
    const t = dedupe(mainFc.features.map((f) => getTypeProp(f.properties || {})));
    setStates(s);
    setRetailers(r);
    setTypes(t);
    setSelStates(new Set(s));
    setSelRetailers(new Set(r));
    setSelTypes(new Set(t));
  }, [mainFc]);

  // Filtered FC
  const filteredFc: FeatureCollection | null = useMemo(() => {
    if (!mainFc) return null;
    const out: Feature[] = [];
    for (const f of mainFc.features) {
      const p = f.properties || {};
      if (!selStates.has(p.State || "")) continue;
      if (!selRetailers.has(p.Retailer || "")) continue;
      if (!selTypes.has(getTypeProp(p))) continue;
      out.push(f);
    }
    return { type: "FeatureCollection", features: out };
  }, [mainFc, selStates, selRetailers, selTypes]);

  // ZIP index (optional local)
  useEffect(() => {
    (async () => {
      const idx = await fetchFirstAvailable<Record<string, Position>>([
        withBasePath("zips.min.json"),
        withBasePath("data/zips.min.json"),
      ]);
      if (idx) setZipIndex(idx);
    })();
  }, []);

  // ZIP geocode
  const geocodeZip = useCallback(
    async (zip: string): Promise<Position | null> => {
      const z = zip.trim();
      if (!z) return null;
      if (zipIndex && zipIndex[z]) return zipIndex[z];
      const token =
        (typeof window !== "undefined" ? (window as any).MAPBOX_TOKEN : undefined) ||
        process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN;
      if (token) {
        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            z
          )}.json?types=postcode&limit=1&access_token=${token}`;
          const res = await fetch(url);
          const j = await res.json();
          const c = j?.features?.[0]?.center;
          if (Array.isArray(c) && c.length === 2) return [c[0], c[1]] as Position;
        } catch {}
      }
      return null;
    },
    [zipIndex]
  );

  const setHomeFromZip = useCallback(async () => {
    setHomeErr(null);
    const pos = await geocodeZip(zipInput);
    if (pos) setHome(pos);
    else setHomeErr("ZIP not found (try a 5-digit US ZIP)");
  }, [zipInput, geocodeZip]);

  // Trip actions
  const addStop = useCallback((feat: Feature) => {
    const p = feat.properties || {};
    const name = [p.Retailer, p.City, p.State].filter(Boolean).join(" · ");
    const coord = feat.geometry.coordinates as Position;
    setStops((prev) => [...prev, { name, coord }]);
  }, []);

  const clearStops = useCallback(() => {
    setStops([]);
    setOptimized([]);
  }, []);

  const optimize = useCallback(() => {
    const origin = home ?? (stops[0]?.coord ?? null);
    if (!origin || stops.length < 1) {
      setOptimized(stops);
      return;
    }
    const ordered = Route.nearestNeighbor(stops, origin);
    const improved = Route.twoOpt(ordered, origin);
    setOptimized(improved);
  }, [stops, home]);

  // Share links
  const googleHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin = home
      ? `${home[1]},${home[0]}`
      : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildGoogleMapsLink(origin, optimized.map((s) => s.coord));
  }, [optimized, home]);

  const appleHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin = home
      ? `${home[1]},${home[0]}`
      : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildAppleMapsLink(origin, optimized.map((s) => s.coord));
  }, [optimized, home]);

  const wazeHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin = home
      ? `${home[1]},${home[0]}`
      : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildWazeLink(origin, optimized.map((s) => s.coord));
  }, [optimized, home]);

  // UI helpers
  const toggleSel = (set: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    set((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };
  const setAll = (set: React.Dispatch<React.SetStateAction<Set<string>>>, values: string[]) =>
    set(new Set(values));
  const setNone = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => set(new Set());

  return (
    <div className="flex h-[100dvh] w-full">
      {/* Sidebar */}
      <aside className="w-[320px] shrink-0 p-4 overflow-y-auto">
        <h1 className="mb-3">Certis AgRoute Planner</h1>

        {dataError ? (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
            {dataError}
          </div>
        ) : null}

        <section className="mb-5">
          <h2 className="mb-2">Home (ZIP)</h2>
          <div className="flex gap-2">
            <input
              value={zipInput}
              onChange={(e) => setZipInput(e.target.value)}
              placeholder="e.g. 50309"
              inputMode="numeric"
              className="w-full rounded-xl bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              onClick={setHomeFromZip}
              className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-black hover:bg-amber-400"
            >
              Set
            </button>
          </div>
          {homeErr ? <div className="mt-2 text-xs text-red-400">{homeErr}</div> : null}
          {home ? (
            <div className="mt-2 text-xs text-neutral-400">
              Home set at {home[1].toFixed(4)}, {home[0].toFixed(4)}
            </div>
          ) : null}
        </section>

        <section className="mb-5">
          <h2 className="mb-2">States ({selStates.size} / {states.length})</h2>
          <div className="mb-2 flex gap-2 text-xs">
            <button onClick={() => setAll(setSelStates, states)} className="chip">All</button>
            <button onClick={() => setNone(setSelStates)} className="chip">None</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {states.map((s) => (
              <button
                key={s}
                onClick={() => toggleSel(setSelStates, s)}
                className={`chip ${selStates.has(s) ? "active" : ""}`}
              >
                {s || "—"}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-5">
          <h2 className="mb-2">Retailers ({selRetailers.size} / {retailers.length})</h2>
          <div className="mb-2 flex gap-2 text-xs">
            <button onClick={() => setAll(setSelRetailers, retailers)} className="chip">All</button>
            <button onClick={() => setNone(setSelRetailers)} className="chip">None</button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
            {retailers.map((r) => (
              <button
                key={r}
                onClick={() => toggleSel(setSelRetailers, r)}
                className={`chip ${selRetailers.has(r) ? "active" : ""}`}
              >
                {r || "—"}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-6">
          <h2 className="mb-2">Location Types ({selTypes.size} / {types.length})</h2>
          <div className="mb-2 flex gap-2 text-xs">
            <button onClick={() => setAll(setSelTypes, types)} className="chip">All</button>
            <button onClick={() => setNone(setSelTypes)} className="chip">None</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <button
                key={t}
                onClick={() => toggleSel(setSelTypes, t)}
                className={`chip ${selTypes.has(t) ? "active" : ""}`}
              >
                {t || "—"}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-2">
          <h2 className="mb-2">Trip Builder</h2>
          <div className="mb-2 flex flex-wrap gap-2">
            {stops.map((s, i) => (
              <span key={`${s.name}-${i}`} className="chip">{i + 1}. {s.name}</span>
            ))}
            {stops.length === 0 ? (
              <span className="text-xs text-neutral-400">Click map points to add stops…</span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              onClick={optimize}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-black hover:bg-emerald-400"
            >
              Optimize
            </button>
            <button
              onClick={clearStops}
              className="rounded-lg bg-neutral-800 px-3 py-2 text-sm font-medium hover:bg-neutral-700"
            >
              Clear
            </button>
          </div>
          {optimized.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <a target="_blank" rel="noreferrer" href={googleHref} className="underline hover:no-underline">Open in Google Maps</a>
              <a target="_blank" rel="noreferrer" href={appleHref} className="underline hover:no-underline">Open in Apple Maps</a>
              <a target="_blank" rel="noreferrer" href={wazeHref} className="underline hover:no-underline">Open in Waze</a>
            </div>
          ) : null}
        </section>

        <footer className="mt-6 text-[11px] text-neutral-500">
          KINGPINs are always visible (separate source) and unaffected by filters.
        </footer>
      </aside>

      {/* Map area */}
      <main className="min-w-0 flex-1 p-4">
        <div className="card h-full overflow-hidden">
          {filteredFc && kingpinFc ? (
            <CertisMap data={filteredFc as any} kingpins={kingpinFc as any} home={home as any} onPointClick={addStop as any} />
          ) : (
            <div className="flex h-full items-center justify-center text-neutral-400">Loading map…</div>
          )}
        </div>
      </main>
    </div>
  );
}
