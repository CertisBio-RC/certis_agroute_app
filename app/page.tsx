"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Feature, Point } from "geojson";
import MapView, { type RetailerProps } from "@/components/Map";

/* ---------------- Error boundary ---------------- */
class MapErrorBoundary extends React.Component<{ children: React.ReactNode }, { err?: Error }> {
  constructor(props: any) {
    super(props);
    this.state = { err: undefined };
  }
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error, info: any) {
    // helpful in devtools
    console.error("Map crashed:", err, info);
    (window as any).__lastMapError = err;
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 24 }}>
          <h2>Map failed to render</h2>
          <p style={{ opacity: 0.8 }}>
            {this.state.err.message || String(this.state.err)}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------- Local page-only types ---------------- */
type MarkerStyle = "logo" | "dot" | "color-dot";
type BasemapKey = "hybrid" | "satellite" | "streets" | "light" | "dark";
type HomeLoc = { lng: number; lat: number };

const BASEMAPS: Record<BasemapKey, string> = {
  hybrid: "mapbox://styles/mapbox/satellite-streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-v9",
  streets: "mapbox://styles/mapbox/streets-v12",
  light: "mapbox://styles/mapbox/light-v11",
  dark: "mapbox://styles/mapbox/dark-v11",
};

export default function Page() {
  /* ---------------- State ---------------- */
  const [token, setToken] = useState<string>("");
  const [geojson, setGeojson] = useState<FeatureCollection<Point, RetailerProps> | null>(null);

  const [basemap, setBasemap] = useState<BasemapKey>("hybrid");
  const [markerStyle, setMarkerStyle] = useState<MarkerStyle>("color-dot");

  const [projectionFlat, setProjectionFlat] = useState<boolean>(true);
  const [allowRotate, setAllowRotate] = useState<boolean>(false);
  const [rasterSharpen, setRasterSharpen] = useState<boolean>(true);

  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [labelColor, setLabelColor] = useState<string>("#fff200");

  const [query, setQuery] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("All");

  const [home, setHome] = useState<HomeLoc | null>({ lng: -97, lat: 38.5 });

  /* ---------------- Token ---------------- */
  useEffect(() => {
    const env = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ?? "";
    if (env) {
      setToken(env);
      return;
    }
    if (typeof document !== "undefined") {
      const meta = document.querySelector('meta[name="mapbox-token"]') as HTMLMetaElement | null;
      const metaVal = meta?.content ?? "";
      const win = (window as any) || {};
      setToken(metaVal || win.__MAPBOX_TOKEN || "");
    }
  }, []);

  /* ---------------- Data fetch + normalize ---------------- */
  useEffect(() => {
    let alive = true;
    fetch("data/retailers.geojson")
      .then((r) => r.json())
      .then((json: FeatureCollection<Point, RetailerProps>) => {
        if (!alive) return;

        const fixed: FeatureCollection<Point, RetailerProps> = {
          type: "FeatureCollection",
          features: (json.features || []).map((f, i) => {
            const props: any = { ...(f.properties || {}) };

            // Ensure string id so clustering / feature ids are stable-ish
            const withId: Feature<Point, RetailerProps> =
              f.id == null ? { ...f, id: (i + 1).toString(), properties: props } : { ...f, properties: props };

            // If dataset uses leading slash in logos, trim it for GH Pages
            if (typeof props.Logo === "string" && props.Logo.startsWith("/")) {
              props.Logo = props.Logo.replace(/^\/+/, "");
            }
            return withId as Feature<Point, RetailerProps>;
          }),
        };

        setGeojson(fixed);
      })
      .catch((e) => {
        console.error("Failed to load retailers.geojson", e);
        setGeojson({ type: "FeatureCollection", features: [] });
      });
    return () => {
      alive = false;
    };
  }, []);

  /* ---------------- Derived filters ---------------- */
  const stateList = useMemo(() => {
    const s = new Set<string>();
    (geojson?.features || []).forEach((f) => {
      const st = (f.properties as any)?.State ?? (f.properties as any)?.state;
      if (st) s.add(String(st));
    });
    return ["All", ...Array.from(s).sort()];
  }, [geojson]);

  const filteredGeojson = useMemo(() => {
    if (!geojson) return null;
    const q = query.trim().toLowerCase();
    return {
      type: "FeatureCollection",
      features: geojson.features.filter((f) => {
        const p: any = f.properties || {};
        if (stateFilter !== "All" && (p.State ?? p.state) !== stateFilter) return false;
        if (!q) return true;
        const hay = [
          p.Retailer,
          p.Name,
          p.City,
          p.State ?? p.state,
          p.Category,
          p.Address,
          p.Phone,
          p.Website,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      }),
    } as FeatureCollection<Point, RetailerProps>;
  }, [geojson, query, stateFilter]);

  /* ---------------- Map props ---------------- */
  const mapStyle = BASEMAPS[basemap];
  const projection = projectionFlat ? "mercator" : "globe";

  /* ---------------- Render ---------------- */
  return (
    <div className="page-root">
      {/* Header */}
      <header className="page-header">
        <div className="brand">
          {/* Keep this path relative for GH Pages subpath */}
          <img src="logos/certis-white.png" alt="Certis" />
          <a className="home-link" href="./">Home</a>
        </div>
        <div className="titles">
          <h1>Certis AgRoute Planner</h1>
          <div className="muted small">
            {geojson ? `${geojson.features.length} retailers` : "Loading retailers..."}
          </div>
        </div>
      </header>

      {/* 2-column grid */}
      <div className="layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <section className="card">
            <h2>Map</h2>
            <div className="field">
              <label>Basemap</label>
              <select value={basemap} onChange={(e) => setBasemap(e.target.value as BasemapKey)}>
                <option value="hybrid">Hybrid</option>
                <option value="satellite">Satellite</option>
                <option value="streets">Streets</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div className="field">
              <label>Markers</label>
              <select value={markerStyle} onChange={(e) => setMarkerStyle(e.target.value as MarkerStyle)}>
                <option value="color-dot">Color dot</option>
                <option value="dot">Dot</option>
                <option value="logo">Logo</option>
              </select>
            </div>

            <div className="toggles">
              <label className="row gap">
                <input type="checkbox" checked={projectionFlat} onChange={(e) => setProjectionFlat(e.target.checked)} />
                <span>Flat (Mercator)</span>
              </label>
              <label className="row gap">
                <input type="checkbox" checked={allowRotate} onChange={(e) => setAllowRotate(e.target.checked)} />
                <span>Rotate</span>
              </label>
              <label className="row gap">
                <input type="checkbox" checked={rasterSharpen} onChange={(e) => setRasterSharpen(e.target.checked)} />
                <span>Sharpen imagery</span>
              </label>
            </div>
          </section>

          <section className="card">
            <h2>Labels</h2>
            <label className="row gap">
              <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
              <span>Show labels</span>
            </label>
            <div className="field">
              <label>Label color</label>
              <input type="color" value={labelColor} onChange={(e) => setLabelColor(e.target.value)} />
            </div>
          </section>

          <section className="card">
            <h2>Filter</h2>
            <div className="field">
              <label>Search</label>
              <input
                type="text"
                placeholder="Retailer, name, city..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="field">
              <label>State</label>
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                {stateList.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </section>

          <section className="card">
            <h2>Home</h2>
            <div className="row gap" style={{ marginBottom: 8 }}>
              <button onClick={() => setHome({ lng: -97, lat: 38.5 })}>Set Example</button>
              <button className="ghost" onClick={() => setHome(null)}>Clear</button>
            </div>
            <div className="small muted">
              lng: {home ? home.lng.toFixed(4) : "-"} / lat: {home ? home.lat.toFixed(4) : "-"}
            </div>
          </section>
        </aside>

        {/* Map panel */}
        <main className="map-shell">
          {/* Gate rendering so Map.tsx never mounts with missing inputs */}
          {!token ? (
            <div style={{ padding: 24 }}>
              <h2>Mapbox token not found</h2>
              <p className="small muted">
                Provide NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN (env) or the meta tag in <code>app/layout.tsx</code>.
              </p>
            </div>
          ) : !filteredGeojson ? (
            <div style={{ padding: 24 }}>
              <h2>Loading retailers…</h2>
            </div>
          ) : (
            <MapErrorBoundary>
              <MapView
                data={filteredGeojson}
                markerStyle={markerStyle}
                showLabels={showLabels}
                labelColor={labelColor}
                mapStyle={BASEMAPS[basemap]}
                projection={projection as any}  /* "mercator" | "globe" */
                allowRotate={allowRotate}
                rasterSharpen={rasterSharpen}
                mapboxToken={token}
                home={home ?? undefined}
              />
            </MapErrorBoundary>
          )}

          <div className="map-footer">
            <span>Use two fingers to move the map</span>
            <span>Use ctrl + scroll to zoom the map</span>
          </div>
        </main>
      </div>
    </div>
  );
}
