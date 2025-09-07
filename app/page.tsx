// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Feature, Point } from "geojson";
import MapView, { type RetailerProps, type MarkerStyle, type Projection } from "@/components/Map";

type MarkerStyleOpt = "logo" | "dot" | "color-dot";

const BASEMAPS: Record<
  string,
  { label: string; style: string; projection?: Projection; sharpen?: boolean }
> = {
  hybrid: {
    label: "Hybrid",
    style: "mapbox://styles/mapbox/satellite-streets-v12",
    projection: "mercator",
    sharpen: true,
  },
  satellite: {
    label: "Satellite",
    style: "mapbox://styles/mapbox/satellite-v9",
    projection: "mercator",
    sharpen: true,
  },
  streets: {
    label: "Streets",
    style: "mapbox://styles/mapbox/streets-v12",
    projection: "mercator",
    sharpen: false,
  },
};

export default function Page() {
  // --- data ------------------------------------------------------------------
  const [geojson, setGeojson] = useState<FeatureCollection<Point, RetailerProps> | null>(null);
  const [retailerCount, setRetailerCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("data/retailers.geojson");
        const json = (await res.json()) as FeatureCollection<Point, any>;

        // Normalize properties & IDs
        const normalized: FeatureCollection<Point, RetailerProps> = {
          type: "FeatureCollection",
          features: (json.features || []).map((f, i) => {
            const raw = (f.properties || {}) as Record<string, unknown>;
            const props: RetailerProps = {
              Retailer: String(raw.Retailer ?? raw.retailer ?? raw.name ?? "Retailer"),
              Name: String(raw.Name ?? raw.name ?? raw.Retailer ?? "—"),
              City: raw.City ? String(raw.City) : undefined,
              State: raw.State ? String(raw.State) : undefined,
              Category: raw.Category ? String(raw.Category) : undefined,
              Address: raw.Address ? String(raw.Address) : undefined,
              Phone: raw.Phone ? String(raw.Phone) : undefined,
              Website: raw.Website ? String(raw.Website) : undefined,
              Color: raw.Color ? String(raw.Color) : undefined,
              Logo: raw.Logo ? String(raw.Logo).replace(/^\/+/, "") : undefined,
            };
            const withId: Feature<Point, RetailerProps> =
              f.id == null ? { ...f, id: (i + 1).toString(), properties: props } : { ...f, properties: props };
            return withId;
          }),
        };

        setGeojson(normalized);
        setRetailerCount(normalized.features.length);
      } catch (err) {
        console.error("Failed to load retailers:", err);
        setGeojson({ type: "FeatureCollection", features: [] });
        setRetailerCount(0);
      }
    })();
  }, []);

  // --- UI state ---------------------------------------------------------------
  const [basemapKey, setBasemapKey] = useState<keyof typeof BASEMAPS>("hybrid");
  const [markerStyle, setMarkerStyle] = useState<MarkerStyleOpt>("color-dot");
  const [flatProjection, setFlatProjection] = useState(true);
  const [allowRotate, setAllowRotate] = useState(false);
  const [sharpen, setSharpen] = useState(true);

  const [showLabels, setShowLabels] = useState(true);
  const [labelColor, setLabelColor] = useState<string>("#fff000");

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("All");

  const [home, setHome] = useState<{ lng: number; lat: number } | null>({ lng: -97, lat: 38.5 });

  // mapbox token
  const [token, setToken] = useState<string>(
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ??
      (typeof window !== "undefined" ? (window as any).__MAPBOX_TOKEN : undefined) ??
      ""
  );

  useEffect(() => {
    if (token) return;
    // Try public/mapbox-token.txt
    (async () => {
      try {
        const res = await fetch("mapbox-token.txt");
        if (res.ok) {
          const txt = (await res.text()).trim();
          if (txt) setToken(txt);
        }
      } catch {
        // ignore
      }
    })();
  }, [token]);

  // Derived: map style + projection
  const mapStyle = BASEMAPS[basemapKey].style;
  const projection: Projection = flatProjection ? "mercator" : "globe";
  const sharpenImagery = sharpen && Boolean(BASEMAPS[basemapKey].sharpen);

  // All states for dropdown
  const allStates = useMemo(() => {
    const s = new Set<string>();
    (geojson?.features || []).forEach((f) => {
      const st = f.properties?.State;
      if (st) s.add(st);
    });
    return Array.from(s).sort();
  }, [geojson]);

  // Filter
  const filteredGeojson = useMemo<FeatureCollection<Point, RetailerProps> | null>(() => {
    if (!geojson) return null;
    const q = search.trim().toLowerCase();
    const st = stateFilter;
    const feats = geojson.features.filter((f) => {
      const p = f.properties;
      if (!p) return false;
      const inState = st === "All" || p.State === st;
      if (!q) return inState;
      const blob = [p.Retailer, p.Name, p.City, p.State, p.Category].filter(Boolean).join(" ").toLowerCase();
      return inState && blob.includes(q);
    });
    return { type: "FeatureCollection", features: feats };
  }, [geojson, search, stateFilter]);

  const markerStyleStrict: MarkerStyle = markerStyle === "logo" ? "logo" : markerStyle;

  return (
    <div className="min-h-screen bg-[#0b0f14] text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-4">
          <img src="logos/certis.svg" alt="Certis" className="h-6 w-auto opacity-90" />
          <a href="./" className="text-sky-300 hover:text-sky-200 text-sm">Home</a>
          <h1 className="ml-2 text-xl md:text-2xl font-semibold">Certis AgRoute Planner</h1>
          <div className="ml-auto text-sm text-white/70">{retailerCount} retailers</div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* GRID: sidebar + map */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
          {/* LEFT: Controls ------------------------------------------------------ */}
          <div className="space-y-4">
            {/* MAP card */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">Map</h2>

              <div className="mb-3">
                <label className="block text-xs text-white/60 mb-1">Basemap</label>
                <select
                  className="w-full rounded-lg bg-black/30 px-3 py-2 outline-none ring-1 ring-white/10"
                  value={basemapKey}
                  onChange={(e) => setBasemapKey(e.target.value as keyof typeof BASEMAPS)}
                >
                  {Object.entries(BASEMAPS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label className="block text-xs text-white/60 mb-1">Markers</label>
                <select
                  className="w-full rounded-lg bg-black/30 px-3 py-2 outline-none ring-1 ring-white/10"
                  value={markerStyle}
                  onChange={(e) => setMarkerStyle(e.target.value as MarkerStyleOpt)}
                >
                  <option value="color-dot">Color dot</option>
                  <option value="dot">Dot</option>
                  <option value="logo">Logo (fallback to color dot)</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={flatProjection}
                    onChange={(e) => setFlatProjection(e.target.checked)}
                  />
                  <span>Flat (Mercator)</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={allowRotate} onChange={(e) => setAllowRotate(e.target.checked)} />
                  <span>Rotate</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={sharpen} onChange={(e) => setSharpen(e.target.checked)} />
                  <span>Sharpen imagery</span>
                </label>
              </div>
            </section>

            {/* LABELS card */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">Labels</h2>
              <label className="inline-flex items-center gap-2 mb-2">
                <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
                <span>Show labels</span>
              </label>
              <div>
                <label className="block text-xs text-white/60 mb-1">Label color</label>
                <input
                  type="color"
                  value={labelColor}
                  onChange={(e) => setLabelColor(e.target.value)}
                  className="h-8 w-full rounded-lg bg-black/30 outline-none ring-1 ring-white/10"
                />
              </div>
            </section>

            {/* FILTER card */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">Filter</h2>
              <div className="mb-3">
                <label className="block text-xs text-white/60 mb-1">Search</label>
                <input
                  type="text"
                  placeholder="Retailer, name, city..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg bg-black/30 px-3 py-2 outline-none ring-1 ring-white/10"
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">State</label>
                <select
                  className="w-full rounded-lg bg-black/30 px-3 py-2 outline-none ring-1 ring-white/10"
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                >
                  <option value="All">All</option>
                  {allStates.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {/* HOME card */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">Home</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHome({ lng: -97, lat: 38.5 })}
                  className="rounded-lg bg-sky-600 px-3 py-2 text-sm hover:bg-sky-500"
                >
                  Set Example
                </button>
                <button
                  onClick={() => setHome(null)}
                  className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
                >
                  Clear
                </button>
              </div>
              <div className="mt-2 text-sm text-white/70">
                lng: {home?.lng.toFixed(4) ?? "—"} / lat: {home?.lat.toFixed(4) ?? "—"}
              </div>
            </section>
          </div>

          {/* RIGHT: Map ---------------------------------------------------------- */}
          <div>
            <div className="overflow-hidden rounded-xl border border-white/10 shadow-sm">
              <MapView
                data={filteredGeojson || undefined}
                markerStyle={markerStyleStrict}
                showLabels={showLabels}
                labelColor={labelColor}
                mapStyle={mapStyle}
                allowRotate={allowRotate}
                projection={projection}
                rasterSharpen={sharpenImagery}
                mapboxToken={token}
                home={home ?? undefined}
              />
            </div>
            <div className="mt-2 text-xs text-white/60">
              Use two fingers to move the map • Use ctrl + scroll to zoom the map
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
