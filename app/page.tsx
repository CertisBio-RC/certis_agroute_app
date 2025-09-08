// /app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Feature, Point } from "geojson";
import MapView, { type RetailerProps, type MarkerStyle } from "@/components/Map";

type StateOpt = "All" | string;
type MapStyleOpt = "hybrid" | "satellite" | "streets";

export default function Page() {
  // ---------------------------------------------------------------------------
  // token resolution (env -> meta tag -> txt file)
  // ---------------------------------------------------------------------------
  const [token, setToken] = useState<string>("");

  useEffect(() => {
    const meta = document.querySelector('meta[name="mapbox-token"]') as HTMLMetaElement | null;
    const fromMeta = meta?.content?.trim() ?? "";
    if (fromMeta) {
      setToken(fromMeta);
      return;
    }
    fetch("mapbox-token.txt")
      .then((r) => (r.ok ? r.text() : ""))
      .then((txt) => setToken(txt.trim()))
      .catch(() => setToken(""));
  }, []);

  // ---------------------------------------------------------------------------
  // data load
  // ---------------------------------------------------------------------------
  const [geojson, setGeojson] = useState<FeatureCollection<Point, RetailerProps> | null>(null);

  useEffect(() => {
    let alive = true;

    fetch("data/retailers.geojson")
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;

        // Normalize: id, logo (no leading slash)
        const fc: FeatureCollection<Point, RetailerProps> = {
          type: "FeatureCollection",
          features: (json.features || []).map((f: Feature<Point, any>, i: number) => {
            const p = { ...(f.properties || {}) } as any;
            if (p.Logo && typeof p.Logo === "string") {
              p.Logo = p.Logo.replace(/^\/+/, "");
            }
            const withId: Feature<Point, RetailerProps> =
              f.id == null ? { ...f, id: (i + 1).toString(), properties: p } : { ...f, properties: p };
            return withId;
          }),
        };
        setGeojson(fc);
      })
      .catch(() => setGeojson({ type: "FeatureCollection", features: [] }));

    return () => {
      alive = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // UI state
  // ---------------------------------------------------------------------------
  const [mapStyle, setMapStyle] = useState<MapStyleOpt>("hybrid");
  const [markerStyle, setMarkerStyle] = useState<MarkerStyle>("color-dot");
  const [allowRotate, setAllowRotate] = useState<boolean>(false);
  const [flatProjection, setFlatProjection] = useState<boolean>(true);
  const [sharpen, setSharpen] = useState<boolean>(true);

  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [labelColor, setLabelColor] = useState<string>("#fff200");

  const [search, setSearch] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<StateOpt>("All");

  const [home, setHome] = useState<{ lng: number; lat: number } | null>(null);

  // ---------------------------------------------------------------------------
  // derived
  // ---------------------------------------------------------------------------
  const filteredGeojson = useMemo<FeatureCollection<Point, RetailerProps> | null>(() => {
    if (!geojson) return null;

    const q = search.trim().toLowerCase();
    const st = stateFilter;

    const feats = geojson.features.filter((f) => {
      const p = f.properties || ({} as RetailerProps);
      const matchText =
        !q ||
        [p.Retailer, p.Name, p.City, p.State, p.Category].some((v) =>
          (v || "").toLowerCase().includes(q)
        );
      const matchState = st === "All" || (p.State || "") === st;
      return matchText && matchState;
    });

    return { type: "FeatureCollection", features: feats };
  }, [geojson, search, stateFilter]);

  const states = useMemo<string[]>(() => {
    if (!geojson) return [];
    const s = new Set<string>();
    for (const f of geojson.features) {
      const st = (f.properties?.State || "").trim();
      if (st) s.add(st);
    }
    return Array.from(s).sort();
  }, [geojson]);

  const count = filteredGeojson?.features.length ?? 0;

  // ---------------------------------------------------------------------------
  // render
  // ---------------------------------------------------------------------------
  return (
    <div className="page-root">
      {/* Header */}
      <div className="page-header">
        <div className="brand">
          <img src="certis.png" alt="Certis" />
          <a className="home-link" href="./">
            Home
          </a>
        </div>
        <div className="titles">
          <h1>Certis AgRoute Planner</h1>
          <div className="muted small">{count} retailers</div>
        </div>
      </div>

      {/* Content grid */}
      <div className="layout">
        {/* Left: controls */}
        <div className="sidebar">
          <div className="card">
            <h2>Map</h2>
            <div className="field">
              <label>Basemap</label>
              <select
                value={mapStyle}
                onChange={(e) => setMapStyle(e.target.value as MapStyleOpt)}
              >
                <option value="hybrid">Hybrid</option>
                <option value="satellite">Satellite</option>
                <option value="streets">Streets</option>
              </select>
            </div>

            <div className="field">
              <label>Markers</label>
              <select
                value={markerStyle}
                onChange={(e) => setMarkerStyle(e.target.value as MarkerStyle)}
              >
                <option value="color-dot">Color dot</option>
                <option value="dot">Dot</option>
              </select>
            </div>

            <div className="toggles">
              <label className="row gap">
                <input
                  type="checkbox"
                  checked={flatProjection}
                  onChange={(e) => setFlatProjection(e.target.checked)}
                />
                <span>Flat (Mercator)</span>
              </label>
              <label className="row gap">
                <input
                  type="checkbox"
                  checked={allowRotate}
                  onChange={(e) => setAllowRotate(e.target.checked)}
                />
                <span>Rotate</span>
              </label>
              <label className="row gap">
                <input
                  type="checkbox"
                  checked={sharpen}
                  onChange={(e) => setSharpen(e.target.checked)}
                />
                <span>Sharpen imagery</span>
              </label>
            </div>
          </div>

          <div className="card">
            <h2>Labels</h2>
            <label className="row gap">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
              />
              <span>Show labels</span>
            </label>
            <div className="field">
              <label>Label color</label>
              <input
                type="color"
                value={labelColor}
                onChange={(e) => setLabelColor(e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <h2>Filter</h2>
            <div className="field">
              <label>Search</label>
              <input
                type="text"
                placeholder="Retailer, name, city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="field">
              <label>State</label>
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value as StateOpt)}
              >
                <option value="All">All</option>
                {states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card">
            <h2>Home</h2>
            <div className="row gap">
              <button onClick={() => setHome({ lng: -97, lat: 38.35 })}>Set Example</button>
              <button className="ghost" onClick={() => setHome(null)}>
                Clear
              </button>
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>
              lng: {(home?.lng ?? -97).toFixed(4)} / lat: {(home?.lat ?? 38.35).toFixed(4)}
            </div>
          </div>
        </div>

        {/* Right: map */}
        <div className="overflow-hidden rounded-xl border border-gray-800/40">
          <MapView
            data={filteredGeojson || undefined}
            markerStyle={markerStyle}
            showLabels={showLabels}
            labelColor={labelColor}
            mapStyle={mapStyle}
            allowRotate={allowRotate}
            projection={flatProjection ? "mercator" : "globe"}
            rasterSharpen={sharpen}
            mapboxToken={token}
            home={home ?? undefined}
          />
          <div className="map-footer">
            <span>Use two fingers to move the map</span>
            <span>Use ctrl + scroll to zoom the map</span>
          </div>
        </div>
      </div>
    </div>
  );
}
