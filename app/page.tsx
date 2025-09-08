// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Feature, Point } from "geojson";
import MapView, {
  type RetailerProps,
  type MarkerStyleOpt,
  type HomeLoc,
} from "@/components/Map";

// ---- UI option helpers ----
type StateOpt = "All" | string;
type CategoryOpt = "All" | string;
type RetailerOpt = "All" | string;
type MapStyleOpt = "hybrid" | "satellite" | "streets";
type ProjectionOpt = "mercator" | "globe";

const EMPTY_FC: FeatureCollection<Point, RetailerProps> = {
  type: "FeatureCollection",
  features: [],
};

export default function Page() {
  // --- token (from env or <meta name="mapbox-token">) ---
  const [token, setToken] = useState<string>("");

  useEffect(() => {
    const env = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ?? "";
    if (env) {
      setToken(env);
    } else if (typeof document !== "undefined") {
      const meta =
        document.querySelector('meta[name="mapbox-token"]')?.getAttribute("content") ?? "";
      setToken(meta);
    }
  }, []);

  // --- data ---
  const [geojson, setGeojson] = useState<FeatureCollection<Point, RetailerProps>>(EMPTY_FC);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch("data/retailers.geojson", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = (await res.json()) as FeatureCollection<Point, any>;

        // Normalize to RetailerProps and ensure required fields
        const features: Feature<Point, RetailerProps>[] = (raw.features || []).map((f, i) => {
          const pRaw = f.properties || {};
          const props: RetailerProps = {
            Retailer: (pRaw.Retailer ?? pRaw.retailer ?? pRaw.Name ?? "Unknown").toString(),
            Name: (pRaw.Name ?? pRaw.retailer ?? pRaw.Retailer ?? `#${i + 1}`).toString(),
            City: pRaw.City ?? undefined,
            State: pRaw.State ?? undefined,
            Category: pRaw.Category ?? undefined,
            Address: pRaw.Address ?? undefined,
            Phone: pRaw.Phone ?? undefined,
            Website: pRaw.Website ?? undefined,
            Logo: pRaw.Logo ? String(pRaw.Logo).replace(/^\/+/, "") : undefined,
            Color: pRaw.Color ?? undefined,
          };
          const geom = f.geometry as Point;
          const idd = f.id ?? (i + 1).toString();
          return { type: "Feature", geometry: geom, properties: props, id: idd };
        });

        const fc: FeatureCollection<Point, RetailerProps> = { type: "FeatureCollection", features };
        if (alive) setGeojson(fc);
      } catch (e: any) {
        if (alive) setErr(String(e?.message ?? e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // --- filters + map controls ---
  const [stateSel, setStateSel] = useState<StateOpt>("All");
  const [retSel, setRetSel] = useState<RetailerOpt>("All");
  const [catSel, setCatSel] = useState<CategoryOpt>("All");

  const [mapStyle, setMapStyle] = useState<MapStyleOpt>("hybrid");
  const [projection, setProjection] = useState<ProjectionOpt>("mercator");
  const [markerStyle, setMarkerStyle] = useState<MarkerStyleOpt>("circle");
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [labelColor, setLabelColor] = useState<string>("#fff200");
  const [allowRotate, setAllowRotate] = useState<boolean>(false);
  const [sharpen, setSharpen] = useState<boolean>(true);

  const [home, setHome] = useState<HomeLoc | null>(null);

  // distinct lists
  const allStates = useMemo(() => {
    const s = new Set<string>();
    for (const f of geojson.features) if (f.properties.State) s.add(f.properties.State);
    return ["All", ...Array.from(s).sort()] as StateOpt[];
  }, [geojson]);

  const allRetailers = useMemo(() => {
    const s = new Set<string>();
    for (const f of geojson.features) if (f.properties.Retailer) s.add(f.properties.Retailer);
    return ["All", ...Array.from(s).sort()] as RetailerOpt[];
  }, [geojson]);

  const allCategories = useMemo(() => {
    const s = new Set<string>();
    for (const f of geojson.features) if (f.properties.Category) s.add(f.properties.Category);
    return ["All", ...Array.from(s).sort()] as CategoryOpt[];
  }, [geojson]);

  // filtered data
  const filteredGeojson = useMemo<FeatureCollection<Point, RetailerProps>>(() => {
    if (!geojson.features?.length) return EMPTY_FC;
    const filtered = geojson.features.filter((f) => {
      const p = f.properties;
      if (stateSel !== "All" && p.State !== stateSel) return false;
      if (retSel !== "All" && p.Retailer !== retSel) return false;
      if (catSel !== "All" && p.Category !== catSel) return false;
      return true;
    });
    return { type: "FeatureCollection", features: filtered };
  }, [geojson, stateSel, retSel, catSel]);

  // helpers
  const setHomeToBrowserLocation = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setHome({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
      () => {}
    );
  };

  return (
    <div className="page-root">
      {/* Header */}
      <div className="page-header">
        <div className="brand">
          <img src="logos/certis.png" alt="Certis" />
          <a className="home-link" href="./">Home</a>
        </div>
        <div className="titles">
          <h1>Certis AgRoute Planner</h1>
          <p className="muted small">Filter retailers and visualize routes. Dbl-click map to set Home.</p>
        </div>
      </div>

      {/* Layout */}
      <div className="layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="card">
            <h2>Filters</h2>
            <div className="field">
              <label>State</label>
              <select value={stateSel} onChange={(e) => setStateSel(e.target.value as StateOpt)}>
                {allStates.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Retailer</label>
              <select value={retSel} onChange={(e) => setRetSel(e.target.value as RetailerOpt)}>
                {allRetailers.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Category</label>
              <select value={catSel} onChange={(e) => setCatSel(e.target.value as CategoryOpt)}>
                {allCategories.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="row gap">
              <button onClick={() => { setStateSel("All"); setRetSel("All"); setCatSel("All"); }}>
                Clear Filters
              </button>
              <span className="muted small">{filteredGeojson.features.length} shown</span>
            </div>
          </div>

          <div className="card">
            <h2>Map Options</h2>

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

            <div className="toggles">
              <label className="row gap">
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(e) => setShowLabels(e.target.checked)}
                />
                Show labels
              </label>
              <div className="row gap">
                <span className="small muted" style={{ width: 84 }}>Label color</span>
                <input
                  aria-label="label color"
                  type="color"
                  value={labelColor}
                  onChange={(e) => setLabelColor(e.target.value)}
                />
              </div>
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
              <select
                value={projection}
                onChange={(e) => setProjection(e.target.value as ProjectionOpt)}
              >
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
                <option value="circle">Circle</option>
                <option value="dot">Dot</option>
              </select>
            </div>

            <div className="row gap">
              <button onClick={setHomeToBrowserLocation}>Set Home (GPS)</button>
              <button className="ghost" onClick={() => setHome(null)}>Clear Home</button>
            </div>

            <p className="small muted" style={{ marginTop: 8 }}>
              Dbl-click on the map to set Home too.
            </p>
          </div>

          {!token && (
            <div className="card">
              <h2>Token</h2>
              <p className="small muted">
                No <code>NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN</code> found; using OSM fallback.
              </p>
            </div>
          )}

          {err && (
            <div className="card">
              <h2>Error</h2>
              <p className="small" style={{ color: "#ff8686" }}>{err}</p>
            </div>
          )}
        </aside>

        {/* Map */}
        <main>
          <div className="map-shell">
            {loading ? (
              <div style={{ padding: 12 }} className="small muted">Loading data…</div>
            ) : (
              <MapView
                data={filteredGeojson}
                markerStyle={markerStyle}
                showLabels={showLabels}
                labelColor={labelColor}
                mapStyle={mapStyle}
                allowRotate={allowRotate}
                projection={projection}
                rasterSharpen={sharpen}
                mapboxToken={token}
                home={home ?? undefined}
                onPickHome={(lng, lat) => setHome({ lng, lat })}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
