"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Feature, Point, GeoJsonProperties } from "geojson";
import MapView, { type RetailerProps } from "@/components/Map";

// ---------------------------
// Map styles (basemaps)
// ---------------------------
type Basemap = {
  name: string;
  uri: string;
  sharpen?: boolean;
};

const BASEMAPS: Basemap[] = [
  { name: "Satellite", uri: "mapbox://styles/mapbox/satellite-v9", sharpen: true },
  { name: "Hybrid", uri: "mapbox://styles/mapbox/satellite-streets-v12", sharpen: true },
  { name: "Streets", uri: "mapbox://styles/mapbox/streets-v12" },
  { name: "Outdoors", uri: "mapbox://styles/mapbox/outdoors-v12" },
  { name: "Light", uri: "mapbox://styles/mapbox/light-v11" },
  { name: "Dark", uri: "mapbox://styles/mapbox/dark-v11" },
];

// ---------------------------
// Types
// ---------------------------
type MarkerStyle = "logo" | "color";

type RawProps = {
  Retailer?: string;
  Name?: string;
  City?: string;
  State?: string;
  Category?: string;
  Address?: string;
  Phone?: string;
  Website?: string;
  Logo?: string;
  Color?: string;
} & GeoJsonProperties;

// ---------------------------
// Helpers
// ---------------------------
function normalizeFeature(
  f: Feature<Point, RawProps>,
  i: number
): Feature<Point, RetailerProps> {
  const raw = f.properties || {};
  const props: RetailerProps = {
    Retailer: raw.Retailer ?? "",
    Name: raw.Name ?? "",
    City: raw.City,
    State: raw.State,
    Category: raw.Category,
    Address: raw.Address,
    Phone: raw.Phone,
    Website: raw.Website,
    Logo: raw.Logo ? String(raw.Logo).replace(/^\/+/, "") : undefined,
    Color: raw.Color,
  };
  // keep stable id
  const id = f.id != null ? f.id : (i + 1).toString();
  return { ...f, id, properties: props };
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

// ---------------------------
// Page
// ---------------------------
export default function Page() {
  // Data
  const [fc, setFc] = useState<FeatureCollection<Point, RetailerProps> | null>(null);

  // UI state
  const [basemapIdx, setBasemapIdx] = useState(0);
  const basemap = BASEMAPS[basemapIdx];

  const [markerStyle, setMarkerStyle] = useState<MarkerStyle>("logo");
  const [showLabels, setShowLabels] = useState(true);
  const [labelColor, setLabelColor] = useState("#fff200");

  const [flatMap, setFlatMap] = useState(true);
  const [allowRotate, setAllowRotate] = useState(false);
  const [sharpenImagery, setSharpenImagery] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("All");

  // Home (we show marker, but picking is off by default)
  const [home, setHome] = useState<{ lng: number; lat: number } | null>(null);

  // Mapbox token (env or file)
  const [token, setToken] = useState<string>("");

  // Load token once
  useEffect(() => {
    const fromEnv =
      (process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN as string | undefined) ?? "";
    if (fromEnv) {
      setToken(fromEnv);
      return;
    }
    // fallback: public/mapbox-token.txt
    (async () => {
      try {
        const res = await fetch("mapbox-token.txt");
        if (res.ok) {
          const txt = (await res.text()).trim();
          setToken(txt);
        }
      } catch {
        // leave empty -> MapView shows a clear message
      }
    })();
  }, []);

  // Load retailers
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("data/retailers.geojson");
        const json = (await res.json()) as FeatureCollection<Point, RawProps>;
        const normalized: FeatureCollection<Point, RetailerProps> = {
          type: "FeatureCollection",
          features: (json.features ?? []).map((f, i) => normalizeFeature(f as any, i)),
        };
        setFc(normalized);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to load retailers.geojson", err);
      }
    })();
  }, []);

  // Derived lists
  const allStates = useMemo(() => {
    const states = (fc?.features ?? [])
      .map((f) => f.properties?.State)
      .filter(Boolean) as string[];
    return ["All", ...uniq(states).sort()];
  }, [fc]);

  const filteredGeojson = useMemo(() => {
    if (!fc) return null;
    const s = search.trim().toLowerCase();
    const st = stateFilter;

    const features = fc.features.filter((f) => {
      const p = f.properties!;
      const inState = st === "All" || p.State === st;
      if (!s) return inState;
      const hay =
        `${p.Retailer ?? ""} ${p.Name ?? ""} ${p.City ?? ""} ${p.State ?? ""} ${p.Category ?? ""}`.toLowerCase();
      return inState && hay.includes(s);
    });

    return { type: "FeatureCollection", features } as FeatureCollection<
      Point,
      RetailerProps
    >;
  }, [fc, search, stateFilter]);

  const count = filteredGeojson?.features.length ?? 0;

  return (
    <div className="min-h-screen grid grid-rows-[auto,1fr] bg-neutral-950 text-neutral-100">
      {/* Header */}
      <header className="border-b border-white/10 px-4 md:px-6 py-3 sticky top-0 z-20 bg-neutral-950/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <img
            src="certis-logo.png"
            alt="Certis"
            className="h-6 w-auto rounded bg-white/5"
          />
          <h1 className="text-xl font-semibold tracking-tight">
            Certis AgRoute Planner
          </h1>
          <div className="ml-auto text-sm text-white/70">{count} retailers</div>
        </div>
      </header>

      {/* Content grid */}
      <main className="grid md:grid-cols-[340px,1fr] gap-4 p-3 md:p-4">
        {/* Sidebar controls */}
        <aside className="space-y-4">
          {/* Basemap + markers */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-3">
            <h2 className="text-sm font-semibold mb-2">Map</h2>

            <label className="block text-xs mb-1 opacity-80">Basemap</label>
            <select
              className="w-full bg-neutral-900 border border-white/10 rounded px-3 py-2 text-sm mb-3"
              value={basemapIdx}
              onChange={(e) => setBasemapIdx(Number(e.target.value))}
            >
              {BASEMAPS.map((b, i) => (
                <option key={b.name} value={i}>
                  {b.name}
                </option>
              ))}
            </select>

            <label className="block text-xs mb-1 opacity-80">Markers</label>
            <select
              className="w-full bg-neutral-900 border border-white/10 rounded px-3 py-2 text-sm mb-3"
              value={markerStyle}
              onChange={(e) => setMarkerStyle(e.target.value as MarkerStyle)}
            >
              <option value="logo">Logo</option>
              <option value="color">Color dot</option>
            </select>

            <div className="flex items-center gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={flatMap}
                  onChange={(e) => setFlatMap(e.target.checked)}
                />
                <span>Flat (Mercator)</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowRotate}
                  onChange={(e) => setAllowRotate(e.target.checked)}
                />
                <span>Rotate</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sharpenImagery}
                  onChange={(e) => setSharpenImagery(e.target.checked)}
                />
                <span>Sharpen imagery</span>
              </label>
            </div>
          </section>

          {/* Labels */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-3">
            <h2 className="text-sm font-semibold mb-2">Labels</h2>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
              />
              <span>Show labels</span>
            </label>

            <div className="mt-3">
              <label className="block text-xs mb-1 opacity-80">Label color</label>
              <input
                type="color"
                value={labelColor}
                onChange={(e) => setLabelColor(e.target.value)}
                className="h-9 w-full bg-neutral-900 border border-white/10 rounded p-1"
                title="Label color"
              />
            </div>
          </section>

          {/* Filter */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-3">
            <h2 className="text-sm font-semibold mb-2">Filter</h2>

            <label className="block text-xs mb-1 opacity-80">Search</label>
            <input
              type="text"
              placeholder="Retailer, name, city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-neutral-900 border border-white/10 rounded px-3 py-2 text-sm mb-3"
            />

            <label className="block text-xs mb-1 opacity-80">State</label>
            <select
              className="w-full bg-neutral-900 border border-white/10 rounded px-3 py-2 text-sm"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
            >
              {allStates.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </section>

          {/* Home marker (manual quick set) */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-3">
            <h2 className="text-sm font-semibold mb-2">Home</h2>
            <div className="flex gap-2">
              <button
                className="px-3 py-2 text-sm rounded bg-sky-600 hover:bg-sky-500"
                onClick={() => setHome({ lng: -121.8863, lat: 37.3382 })} // example: San Jose
              >
                Set Example
              </button>
              <button
                className="px-3 py-2 text-sm rounded bg-neutral-800 hover:bg-neutral-700"
                onClick={() => setHome(null)}
              >
                Clear
              </button>
            </div>
            {home && (
              <div className="mt-2 text-xs opacity-80">
                lng: {home.lng.toFixed(4)} / lat: {home.lat.toFixed(4)}
              </div>
            )}
          </section>
        </aside>

        {/* Map */}
        <section className="rounded-xl overflow-hidden border border-white/10 bg-black">
          <MapView
            data={filteredGeojson || undefined}
            markerStyle={markerStyle}
            showLabels={showLabels}
            labelColor={labelColor}
            mapStyle={basemap.uri}
            projection={flatMap ? "mercator" : "globe"}
            allowRotate={allowRotate && !flatMap}
            rasterSharpen={sharpenImagery && Boolean(basemap.sharpen)}
            mapboxToken={token}
            enableHomePick={false}
            onPickHome={(lng, lat) => setHome({ lng, lat })}
            home={home ?? undefined}
          />
        </section>
      </main>
    </div>
  );
}
