// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Feature, Point } from "geojson";
import MapView, {
  type RetailerProps,
  type MarkerStyleOpt,
} from "@/components/Map";

type StateOpt = "All" | string;
type MapStyleOpt = "hybrid" | "satellite" | "streets";
type ProjectionOpt = "mercator" | "globe";

const uniq = <T, K extends string | number>(items: T[], by: (t: T) => K): T[] => {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const it of items) {
    const k = by(it);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(it);
    }
  }
  return out;
};

export default function HomePage() {
  // filters
  const [stateFilter, setStateFilter] = useState<StateOpt>("All");
  const [retailerFilter, setRetailerFilter] = useState<string>("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  // map options
  const [mapStyle, setMapStyle] = useState<MapStyleOpt>("hybrid");
  const [projection, setProjection] = useState<ProjectionOpt>("mercator");
  const [markerStyle, setMarkerStyle] = useState<MarkerStyleOpt>("dot");
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [labelColor, setLabelColor] = useState<string>("#fff200");
  const [allowRotate, setAllowRotate] = useState<boolean>(false);
  const [sharpen, setSharpen] = useState<boolean>(true);

  // home
  const [home, setHome] = useState<{ lng: number; lat: number } | null>(null);

  // token (env → window meta → fallback)
  const token =
    (process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ??
      (typeof window !== "undefined"
        ? ((window as any).__MAPBOX_TOKEN as string | undefined)
        : undefined)) ?? "";

  // data
  const [geojson, setGeojson] = useState<
    FeatureCollection<Point, RetailerProps> | null
  >(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("data/retailers.geojson", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as FeatureCollection<
          Point,
          Partial<RetailerProps> & { Logo?: string; Color?: string }
        >;

        const features = (json.features || []).map((f, i) => {
          const raw = f.properties || {};
          const props: RetailerProps = {
            Retailer: String(raw.Retailer ?? ""),
            Name: String(raw.Name ?? ""),
            City: raw.City ? String(raw.City) : undefined,
            State: raw.State ? String(raw.State) : undefined,
            Category: raw.Category ? String(raw.Category) : undefined,
            Address: raw.Address ? String(raw.Address) : undefined,
            Phone: raw.Phone ? String(raw.Phone) : undefined,
            Website: raw.Website ? String(raw.Website) : undefined,
            Color: raw.Color ? String(raw.Color) : undefined,
          };
          const withId: Feature<Point, RetailerProps> =
            f.id == null
              ? { ...f, id: (i + 1).toString(), properties: props }
              : { ...f, properties: props };
          return withId;
        });

        const cleaned: FeatureCollection<Point, RetailerProps> = {
          type: "FeatureCollection",
          features,
        };
        if (alive) setGeojson(cleaned);
      } catch (e: any) {
        if (alive) setErr(String(e?.message || e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // lists
  const allStates = useMemo(() => {
    if (!geojson) return ["All"] as string[];
    const list = uniq(
      geojson.features.map((f) => f.properties?.State).filter(Boolean) as string[],
      (s) => s
    ).sort();
    return ["All", ...list];
  }, [geojson]);

  const allRetailers = useMemo(() => {
    if (!geojson) return ["All"] as string[];
    const list = uniq(
      geojson.features
        .map((f) => f.properties?.Retailer)
        .filter(Boolean) as string[],
      (s) => s
    ).sort();
    return ["All", ...list];
  }, [geojson]);

  const allCategories = useMemo(() => {
    if (!geojson) return ["All"] as string[];
    const list = uniq(
      geojson.features
        .map((f) => f.properties?.Category)
        .filter(Boolean) as string[],
      (s) => s
    ).sort();
    return ["All", ...list];
  }, [geojson]);

  // filtered data
  const filteredGeojson = useMemo(() => {
    if (!geojson) return null;
    const feats = geojson.features.filter((f) => {
      const p = f.properties || ({} as RetailerProps);
      if (stateFilter !== "All" && p.State !== stateFilter) return false;
      if (retailerFilter !== "All" && p.Retailer !== retailerFilter) return false;
      if (categoryFilter !== "All" && p.Category !== categoryFilter) return false;
      return true;
    });
    return {
      type: "FeatureCollection",
      features: feats,
    } as FeatureCollection<Point, RetailerProps>;
  }, [geojson, stateFilter, retailerFilter, categoryFilter]);

  const clearFilters = () => {
    setStateFilter("All");
    setRetailerFilter("All");
    setCategoryFilter("All");
  };

  return (
    <div className="page-root">
      <div className="page-header">
        <div className="brand">
          <img src="logos/certis.png" alt="Certis" />
          <a className="home-link" href="./">Home</a>
        </div>
        <div className="titles">
          <h1>Certis AgRoute Planner</h1>
          <div className="muted small">Filter retailers and visualize routes. Dbl-click map to set Home.</div>
        </div>
      </div>

      <div className="layout">
        <div className="sidebar">
          <div className="card">
            <h2>Filters</h2>

            <div className="field">
              <label>State</label>
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                {allStates.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Retailer</label>
              <select value={retailerFilter} onChange={(e) => setRetailerFilter(e.target.value)}>
                {allRetailers.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Category</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                {allCategories.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <button onClick={clearFilters}>Clear Filters</button>
            <div className="muted small" style={{ marginTop: 6 }}>
              {filteredGeojson ? `${filteredGeojson.features.length} shown` : "…"}
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

            <div className="field">
              <label className="row gap">
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(e) => setShowLabels(e.target.checked)}
                />
                Show labels
              </label>
              <label>Label color</label>
              <input
                type="color"
                value={labelColor}
                onChange={(e) => setLabelColor(e.target.value)}
              />
            </div>

            <div className="toggles">
              <label className="row gap">
                <input
                  type="checkbox"
                  checked={allowRotate}
                  onChange={(e) => setAllowRotate(e.target.checked)}
                />
                Allow rotate
              </label>

              <label className="row gap">
                <input
                  type="checkbox"
                  checked={sharpen}
                  onChange={(e) => setSharpen(e.target.checked)}
                />
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
              <select
                value={markerStyle}
                onChange={(e) => setMarkerStyle(e.target.value as MarkerStyleOpt)}
              >
                <option value="dot">Dot</option>
                <option value="logo">Logo</option>
              </select>
            </div>
          </div>
        </div>

        <div className="map-shell">
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
            onPickHome={(lng, lat) => setHome({ lng, lat })}
            home={home ?? undefined}
          />
          <div className="map-footer">
            <span>Scroll to zoom • drag to pan • dbl-click to set Home</span>
          </div>
        </div>
      </div>

      {err ? (
        <div className="card" style={{ marginTop: 12, color: "#f87171" }}>
          Data load error: {err}
        </div>
      ) : null}
    </div>
  );
}
