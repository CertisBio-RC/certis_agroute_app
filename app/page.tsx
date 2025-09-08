"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Feature, Point } from "geojson";
import MapView, { type RetailerProps, type MarkerStyleOpt } from "@/components/Map";

/* ------------------------ Local UI types ------------------------ */
type StateOpt = "All" | string;
type MapStyleOpt = "hybrid" | "satellite" | "streets";
type ProjectionOpt = "mercator" | "globe";

/* ----------------------- Helpers / Token ------------------------ */
function getPublicToken(): string | undefined {
  // 1) env at build-time (Next)
  if (process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN) {
    return process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN;
  }
  // 2) meta tag injected by layout.tsx (works on GitHub Pages too)
  if (typeof document !== "undefined") {
    const meta = document.querySelector('meta[name="mapbox-token"]') as HTMLMetaElement | null;
    if (meta?.content) return meta.content;
  }
  // none: fall back to OSM inside the Map component
  return undefined;
}

/* --------------------------- Page ------------------------------- */
export default function Page(): JSX.Element {
  /* ---- data ---- */
  const [geojson, setGeojson] = useState<FeatureCollection<Point, RetailerProps> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---- filters ---- */
  const [stateFilter, setStateFilter] = useState<StateOpt>("All");
  const [retailerFilter, setRetailerFilter] = useState<string>("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  /* ---- map options ---- */
  const [mapStyle, setMapStyle] = useState<MapStyleOpt>("hybrid");
  const [projection, setProjection] = useState<ProjectionOpt>("mercator");
  const [markerStyle, setMarkerStyle] = useState<MarkerStyleOpt>("color-dot");
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [labelColor, setLabelColor] = useState<string>("#fff200");
  const [allowRotate, setAllowRotate] = useState<boolean>(false);
  const [sharpen, setSharpen] = useState<boolean>(true);

  /* ---- home (dbl-click) ---- */
  const [home, setHome] = useState<{ lng: number; lat: number } | null>(null);

  /* ---- token ---- */
  const [token, setToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    setToken(getPublicToken());
  }, []);

  /* ---- load GeoJSON ---- */
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        // IMPORTANT: relative path (no leading slash) for GitHub Pages subpath
        const res = await fetch("data/retailers.geojson", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to fetch retailers.geojson: ${res.status}`);
        const json = await res.json();

        // Normalize properties and ensure relative logos (no leading slash)
        const norm: FeatureCollection<Point, RetailerProps> = {
          type: "FeatureCollection",
          features: (json.features || []).map((f: Feature<Point, any>, i: number) => {
            const p = { ...(f.properties || {}) } as RetailerProps & { Logo?: string };
            if (p.Logo && p.Logo.startsWith("/")) p.Logo = p.Logo.replace(/^\/+/, "");
            // coerces into our known shape (Retailer & Name should be present)
            const props: RetailerProps = {
              Retailer: String((p as any).Retailer ?? (p as any).retailer ?? ""),
              Name: String((p as any).Name ?? (p as any).name ?? ""),
              City: p.City,
              State: p.State,
              Category: p.Category,
              Address: p.Address,
              Phone: p.Phone,
              Website: p.Website,
              Color: p.Color,
              Logo: p.Logo,
            };
            const withId: Feature<Point, RetailerProps> =
              f.id == null ? { ...f, id: (i + 1).toString(), properties: props } : { ...f, properties: props };
            return withId;
          }),
        };
        if (!aborted) setGeojson(norm);
      } catch (e: any) {
        if (!aborted) setError(e?.message || "Failed to load data");
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  /* ---- filter options ---- */
  const allStates = useMemo(() => {
    if (!geojson) return ["All"];
    const s = new Set<string>();
    for (const f of geojson.features) if (f.properties?.State) s.add(f.properties.State);
    return ["All", ...Array.from(s).sort()];
  }, [geojson]);

  const allRetailers = useMemo(() => {
    if (!geojson) return ["All"];
    const s = new Set<string>();
    for (const f of geojson.features) if (f.properties?.Retailer) s.add(f.properties.Retailer);
    return ["All", ...Array.from(s).sort()];
  }, [geojson]);

  const allCategories = useMemo(() => {
    if (!geojson) return ["All"];
    const s = new Set<string>();
    for (const f of geojson.features) if (f.properties?.Category) s.add(f.properties.Category);
    return ["All", ...Array.from(s).sort()];
  }, [geojson]);

  /* ---- apply filters ---- */
  const filteredGeojson: FeatureCollection<Point, RetailerProps> | null = useMemo(() => {
    if (!geojson) return null;
    const pass = (f: Feature<Point, RetailerProps>) => {
      if (stateFilter !== "All" && f.properties?.State !== stateFilter) return false;
      if (retailerFilter !== "All" && f.properties?.Retailer !== retailerFilter) return false;
      if (categoryFilter !== "All" && f.properties?.Category !== categoryFilter) return false;
      return true;
    };
    return { type: "FeatureCollection", features: geojson.features.filter(pass) };
  }, [geojson, stateFilter, retailerFilter, categoryFilter]);

  const shownCount = filteredGeojson?.features.length ?? 0;

  /* ---- clear filters ---- */
  function clearFilters() {
    setStateFilter("All");
    setRetailerFilter("All");
    setCategoryFilter("All");
  }

  return (
    <div className="page-root">
      {/* Header / brand */}
      <header className="page-header">
        <div className="brand">
          {/* RELATIVE path so it works on GitHub Pages subpath */}
          <img src="logos/certis.png" alt="Certis" />
          <a className="home-link" href="./">Home</a>
        </div>
        <div className="titles">
          <h1>Certis AgRoute Planner</h1>
          <p className="muted small">Filter retailers and visualize routes. Dbl-click map to set Home.</p>
        </div>
      </header>

      <div className="layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="card">
            <h2>Filters</h2>

            <div className="field">
              <label>State</label>
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                {allStates.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Retailer</label>
              <select value={retailerFilter} onChange={(e) => setRetailerFilter(e.target.value)}>
                {allRetailers.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Category</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                {allCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="row gap">
              <button onClick={clearFilters}>Clear Filters</button>
              <span className="muted small">{shownCount} shown</span>
            </div>
          </div>

          <div className="card">
            <h2>Map options</h2>

            <div className="field">
              <label>Basemap</label>
              <select value={mapStyle} onChange={(e) => setMapStyle(e.target.value as MapStyleOpt)}>
                <option value="hybrid">Hybrid</option>
                <option value="satellite">Satellite</option>
                <option value="streets">Streets</option>
              </select>
            </div>

            <div className="toggles">
              <label className="row gap">
                <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
                Show labels
              </label>

              <div className="row gap">
                <label className="small muted" style={{ width: 84 }}>
                  Label color
                </label>
                <input
                  type="color"
                  value={labelColor}
                  onChange={(e) => setLabelColor(e.target.value)}
                  style={{ width: 64, height: 28 }}
                />
              </div>

              <label className="row gap">
                <input type="checkbox" checked={allowRotate} onChange={(e) => setAllowRotate(e.target.checked)} />
                Allow rotate
              </label>

              <label className="row gap">
                <input type="checkbox" checked={sharpen} onChange={(e) => setSharpen(e.target.checked)} />
                Sharpen imagery (raster contrast)
              </label>
            </div>

            <div className="field">
              <label>Projection</label>
              <select value={projection} onChange={(e) => setProjection(e.target.value as ProjectionOpt)}>
                <option value="mercator">Mercator</option>
                <option value="globe">Globe</option>
              </select>
            </div>

            <div className="field">
              <label>Marker style</label>
              <select value={markerStyle} onChange={(e) => setMarkerStyle(e.target.value as MarkerStyleOpt)}>
                <option value="color-dot">Color dot</option>
                <option value="dot">Dot</option>
                <option value="logo">Logo (if available)</option>
              </select>
            </div>
          </div>
        </aside>

        {/* Map */}
        <div className="map-shell">
          {error && (
            <div className="p-3 text-sm text-red-300/90">
              <strong className="block mb-1">Data error</strong>
              <span className="opacity-80">{error}</span>
            </div>
          )}

          {/* Only render the map after data loads (or with empty data) */}
          <div className="overflow-hidden rounded-xl border border-gray-800/40">
            <MapView
              data={filteredGeojson || undefined}
              markerStyle={markerStyle}
              showLabels={showLabels}
              labelColor={labelColor}
              mapStyle={mapStyle}
              projection={projection}
              allowRotate={allowRotate}
              rasterSharpen={sharpen}
              mapboxToken={token}
              home={home ?? undefined}
              onPickHome={(lng, lat) => setHome({ lng, lat })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
