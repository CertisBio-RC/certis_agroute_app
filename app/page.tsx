"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import MapView from "../components/Map";
import type { RetailerProps as MapRetailerProps } from "../components/Map";

type Basemap = { id: string; name: string; uri: string; sharpen?: boolean };
const BASEMAPS: Basemap[] = [
  { id: "sat", name: "Satellite", uri: "mapbox://styles/mapbox/satellite-streets-v12", sharpen: true },
  { id: "streets", name: "Streets", uri: "mapbox://styles/mapbox/streets-v12" },
  { id: "light", name: "Light", uri: "mapbox://styles/mapbox/light-v11" },
  { id: "dark", name: "Dark", uri: "mapbox://styles/mapbox/dark-v11" },
];

export default function Page() {
  const [raw, setRaw] = useState<FeatureCollection<Point, MapRetailerProps> | null>(null);
  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState<string>("All");
  const [retailerFilter, setRetailerFilter] = useState<string>("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  const [markerStyle, setMarkerStyle] = useState<"logo" | "color">("logo");
  const [showLabels] = useState(true);
  const [basemap, setBasemap] = useState<Basemap>(BASEMAPS[0]);
  const [flatMap, setFlatMap] = useState(true);
  const [allowRotate, setAllowRotate] = useState(false);
  const [sharpenImagery, setSharpenImagery] = useState(true);

  const [home, setHome] = useState<{ lng: number; lat: number } | null>(null);
  const [enableHomePick, setEnableHomePick] = useState(false);

  const mapboxToken =
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
    (globalThis as any).MAPBOX_TOKEN ||
    "";

  // Load data (relative path for GitHub Pages)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("data/retailers.geojson");
        const json = (await res.json()) as FeatureCollection<Point, MapRetailerProps>;

        if (cancelled) return;

        const cleaned: FeatureCollection<Point, MapRetailerProps> = {
          type: "FeatureCollection",
          features: (json.features || []).map((f, i) => {
            const p = { ...f.properties };
            if (p.id == null) p.id = (i + 1).toString();
            if (p.Logo && p.Logo.startsWith("/")) p.Logo = p.Logo.slice(1);
            return { ...f, properties: p };
          }),
        };

        setRaw(cleaned);

        // populate filters
        const s = new Set<string>();
        const r = new Set<string>();
        const c = new Set<string>();
        for (const f of cleaned.features) {
          if (f.properties.State) s.add(f.properties.State);
          if (f.properties.Retailer) r.add(f.properties.Retailer);
          if (f.properties.Category) c.add(f.properties.Category);
        }
        setStates(["All", ...Array.from(s).sort()]);
        setRetailers(["All", ...Array.from(r).sort()]);
        setCategories(["All", ...Array.from(c).sort()]);
      } catch (e) {
        console.error("Failed loading retailers.geojson", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredGeojson: FeatureCollection<Point, MapRetailerProps> | null = useMemo(() => {
    if (!raw) return null;
    const fs = raw.features.filter((f) => {
      const p = f.properties;
      if (stateFilter !== "All" && p.State !== stateFilter) return false;
      if (retailerFilter !== "All" && p.Retailer !== retailerFilter) return false;
      if (categoryFilter !== "All" && p.Category !== categoryFilter) return false;
      return true;
    });
    return { type: "FeatureCollection", features: fs };
  }, [raw, stateFilter, retailerFilter, categoryFilter]);

  return (
    <main className="min-h-screen bg-neutral-900 text-white">
      <header className="flex items-center gap-4 px-4 py-3 border-b border-white/10">
        <img src="certis-logo.png" alt="Certis logo" className="h-6 w-auto" />
        <a href="./" className="text-sky-300 underline">Home</a>
      </header>

      <section className="px-4 py-3 space-y-3">
        <h1 className="text-2xl font-bold">Certis AgRoute Planner</h1>
        <p className="opacity-80">Retailer map & trip builder</p>

        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2">
            <span className="text-sm opacity-80">Basemap</span>
            <select
              value={basemap.id}
              onChange={(e) => {
                const bm = BASEMAPS.find((b) => b.id === e.target.value)!;
                setBasemap(bm);
                setSharpenImagery(Boolean(bm.sharpen));
              }}
              className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
            >
              {BASEMAPS.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={flatMap} onChange={(e) => setFlatMap(e.target.checked)} />
            <span className="text-sm opacity-80">Flat map</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowRotate}
              onChange={(e) => setAllowRotate(e.target.checked)}
              disabled={flatMap}
            />
            <span className="text-sm opacity-80">Allow rotate</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sharpenImagery}
              onChange={(e) => setSharpenImagery(e.target.checked)}
            />
            <span className="text-sm opacity-80">Sharpen imagery</span>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-sm opacity-80">Markers</span>
            <select
              value={markerStyle}
              onChange={(e) => setMarkerStyle(e.target.value as "logo" | "color")}
              className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
            >
              <option value="logo">Logos</option>
              <option value="color">Colors</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-sm opacity-80">State</span>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
            >
              {states.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-sm opacity-80">Retailer</span>
            <select
              value={retailerFilter}
              onChange={(e) => setRetailerFilter(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
            >
              {retailers.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-sm opacity-80">Category</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
            >
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <button
            className="px-3 py-1 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700"
            onClick={() => {
              setStateFilter("All");
              setRetailerFilter("All");
              setCategoryFilter("All");
            }}
          >
            Clear filters
          </button>

          <span className="mx-2 opacity-60 text-sm">|</span>

          <button
            className={`px-3 py-1 rounded border ${enableHomePick ? "bg-emerald-600 border-emerald-500" : "bg-neutral-800 border-neutral-700 hover:bg-neutral-700"}`}
            onClick={() => setEnableHomePick((v) => !v)}
            title="Pick home on map (click a location)"
          >
            {enableHomePick ? "Picking…" : "Pick Home on map"}
          </button>

          <button
            className="px-3 py-1 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700"
            onClick={() => setHome(null)}
          >
            Clear Home
          </button>
        </div>
      </section>

      <section className="px-4 pb-6">
        <div className="overflow-hidden rounded-xl border border-neutral-800/60">
          <MapView
            data={filteredGeojson || undefined}
            markerStyle={markerStyle}
            showLabels={showLabels}
            labelColor="#fff200"
            mapStyle={basemap.uri}
            projection={flatMap ? "mercator" : "globe"}
            allowRotate={allowRotate && !flatMap}
            rasterSharpen={sharpenImagery && Boolean(basemap.sharpen)}
            mapboxToken={mapboxToken}
            enableHomePick={enableHomePick}
            onPickHome={(lng, lat) => {
              setHome({ lng, lat });
              setEnableHomePick(false);
            }}
            home={home}
          />
        </div>
      </section>
    </main>
  );
}
