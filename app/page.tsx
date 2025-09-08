"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Feature, Point } from "geojson";
import MapView, { type RetailerProps } from "@/components/Map";

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

/* ---------------- Error boundary so prod shows real errors ---------------- */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console for GH Pages
    console.error("Boundary caught:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16 }}>
          <h2>Something blew up in the Map panel</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Page() {
  /* ---------------- State ---------------- */
  const [token, setToken] = useState<string>("");
  const [tokenReady, setTokenReady] = useState<boolean>(false);

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

  /* ---------------- Token: env -> meta -> mapbox-token.txt ---------------- */
  useEffect(() => {
    let cancelled = false;

    const finish = (t: string) => {
      if (cancelled) return;
      setToken(t);
      setTokenReady(true);
    };

    // 1) env at build time
    const fromEnv = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ?? "";
    if (fromEnv) {
      finish(fromEnv);
      return () => {
        cancelled = true;
      };
    }

    // 2) meta at runtime (layout.tsx)
    const fromMeta =
      typeof document !== "undefined"
        ? (document.querySelector('meta[name="mapbox-token"]') as HTMLMetaElement | null)?.content ?? ""
        : "";
    if (fromMeta) {
      finish(fromMeta);
      return () => {
        cancelled = true;
      };
    }

    // 3) file at runtime
    (async () => {
      try {
        const res = await fetch("mapbox-token.txt", { cache: "no-store" });
        if (res.ok) {
          const txt = (await res.text()).trim();
          finish(txt);
        } else {
          finish(""); // resolved, but empty means MapView will show its card
        }
      } catch {
        finish("");
      }
    })();

    return () => {
      cancelled = true;
    };
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
            const withId: Feature<Point, RetailerProps> =
              f.id == null ? { ...f, id: (i + 1).toString(), properties: props } : { ...f, properties: props };
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

  const projection = projectionFlat ? "mercator" : "globe";

  /* ---------------- Render ---------------- */
  return (
    <div className="page-root">
      {/* Header */}
      <header className="page-header">
        <div className="brand">
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
          {!filteredGeojson ? (
            <div style={{ padding: 24 }}>
              <h2>Loading retailers…</h2>
            </div>
          ) : !tokenReady ? (
            <div style={{ padding: 24 }}>
              <h2>Loading map…</h2>
              <div className="muted small">Resolving Mapbox token</div>
            </div>
          ) : (
            <ErrorBoundary>
              <MapView
                data={filteredGeojson}
                markerStyle={markerStyle}
                showLabels={showLabels}
                labelColor={labelColor}
                mapStyle={BASEMAPS[basemap]}
                projection={(projectionFlat ? "mercator" : "globe") as any}
                allowRotate={allowRotate}
                rasterSharpen={rasterSharpen}
                mapboxToken={token || undefined}
                home={home ?? undefined}
              />
            </ErrorBoundary>
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
