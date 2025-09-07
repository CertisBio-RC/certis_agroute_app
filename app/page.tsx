"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Feature, Point, BBox } from "geojson";
import MapView, { type RetailerProps } from "@/components/Map";

/** Local copies so we don’t depend on types exported by Map.tsx */
type MarkerStyle = "logo" | "color";
type HomeLoc = { lng: number; lat: number };

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
};

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ??
  (typeof window !== "undefined" ? (window as any).__MAPBOX_TOKEN : undefined) ??
  "";

type Basemap =
  | { key: "sat"; label: "Satellite"; uri: string; sharpen?: boolean }
  | { key: "hyb"; label: "Hybrid"; uri: string; sharpen?: boolean }
  | { key: "str"; label: "Streets"; uri: string; sharpen?: boolean };

const BASEMAPS: Basemap[] = [
  { key: "sat", label: "Satellite", uri: "mapbox://styles/mapbox/satellite-v9", sharpen: true },
  { key: "hyb", label: "Hybrid", uri: "mapbox://styles/mapbox/satellite-streets-v12", sharpen: true },
  { key: "str", label: "Streets", uri: "mapbox://styles/mapbox/streets-v12" },
];

function normalizeFeature(
  f: Feature<Point, any>,
  i: number
): Feature<Point, RetailerProps> {
  const raw: RawProps = (f.properties ?? {}) as RawProps;

  const props: RetailerProps = {
    Retailer: raw.Retailer ?? "",
    Name: raw.Name ?? "",
    City: raw.City,
    State: raw.State,
    Category: raw.Category,
    Address: raw.Address,
    Phone: raw.Phone,
    Website: raw.Website,
  };

  // keep optional extras; Map.tsx ignores unknown props safely
  (props as any).Logo = raw.Logo ? String(raw.Logo).replace(/^\/+/, "") : undefined;
  (props as any).Color = raw.Color;

  const withId =
    f.id == null ? { ...f, id: (i + 1).toString(), properties: props } : { ...f, properties: props };

  return withId as Feature<Point, RetailerProps>;
}

export default function Page() {
  // ---------------- state: data & filters ----------------
  const [raw, setRaw] = useState<FeatureCollection<Point, any> | null>(null);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("ALL");

  // map options
  const [basemapKey, setBasemapKey] = useState<Basemap["key"]>("hyb");
  const [markerStyle, setMarkerStyle] = useState<MarkerStyle>("color");
  const [showLabels, setShowLabels] = useState(true);
  const [labelColor, setLabelColor] = useState("#ffcc00");
  const [flat, setFlat] = useState(true);
  const [rotate, setRotate] = useState(false);
  const [sharpen, setSharpen] = useState(true);

  // optional "home" marker
  const [home, setHome] = useState<HomeLoc | null>(null);

  // ---------------- load data ----------------
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("data/retailers.geojson", { cache: "no-store" });
      const json = (await res.json()) as FeatureCollection<Point, any>;
      if (!alive) return;
      setRaw({
        type: "FeatureCollection",
        features: (json.features || []).map(normalizeFeature),
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---------------- derived: lists & filtered geojson ----------------
  const states = useMemo(() => {
    const s = new Set<string>();
    for (const f of raw?.features ?? []) {
      const st = (f.properties?.State ?? "").trim();
      if (st) s.add(st);
    }
    return Array.from(s).sort();
  }, [raw]);

  const filtered: FeatureCollection<Point, RetailerProps> | undefined = useMemo(() => {
    if (!raw) return undefined;
    const q = query.trim().toLowerCase();
    const wantAllStates = stateFilter === "ALL";
    const feats = raw.features.filter((f) => {
      const p = f.properties as RetailerProps;
      const matchQ =
        !q ||
        [p.Retailer, p.Name, p.City, p.State, p.Category]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      const matchS = wantAllStates || (p.State ?? "") === stateFilter;
      return matchQ && matchS;
    }) as Feature<Point, RetailerProps>[];
    return { type: "FeatureCollection", features: feats };
  }, [raw, query, stateFilter]);

  const count = filtered?.features.length ?? 0;
  const basemap = BASEMAPS.find((b) => b.key === basemapKey)!;

  // ---------------- helpers ----------------
  function colorInput(v: string) {
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) setLabelColor(v);
  }
  function setExampleHome() {
    setHome({ lng: -97.0, lat: 38.5 });
  }
  function clearHome() {
    setHome(null);
  }

  // ---------------- render ----------------
  return (
    <div className="page-root">
      <header className="page-header">
        <div className="brand">
          <img src="certis-logo.png" alt="Certis" />
          <a className="home-link" href="./">Home</a>
        </div>
        <div className="titles">
          <h1>Certis AgRoute Planner</h1>
          <p className="muted">{count.toLocaleString()} retailers</p>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <section className="card">
            <h2>Map</h2>
            <div className="field">
              <label>Basemap</label>
              <select
                value={basemapKey}
                onChange={(e) => setBasemapKey(e.target.value as Basemap["key"])}
              >
                {BASEMAPS.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Markers</label>
              <select
                value={markerStyle}
                onChange={(e) => setMarkerStyle(e.target.value as MarkerStyle)}
              >
                <option value="logo">Logo</option>
                <option value="color">Color dot</option>
              </select>
            </div>

            <div className="toggles">
              <label>
                <input type="checkbox" checked={flat} onChange={(e) => setFlat(e.target.checked)} />{" "}
                Flat (Mercator)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={rotate}
                  onChange={(e) => setRotate(e.target.checked)}
                  disabled={!flat}
                />{" "}
                Rotate
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={sharpen}
                  onChange={(e) => setSharpen(e.target.checked)}
                />{" "}
                Sharpen imagery
              </label>
            </div>
          </section>

          <section className="card">
            <h2>Labels</h2>
            <div className="toggles">
              <label>
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(e) => setShowLabels(e.target.checked)}
                />{" "}
                Show labels
              </label>
            </div>
            <div className="field">
              <label>Label color</label>
              <input
                type="color"
                value={labelColor}
                onChange={(e) => colorInput(e.target.value)}
              />
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
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
              >
                <option value="ALL">All</option>
                {states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="card">
            <h2>Home</h2>
            <div className="row gap">
              <button onClick={setExampleHome}>Set Example</button>
              <button className="ghost" onClick={clearHome}>
                Clear
              </button>
            </div>
            <p className="muted small">
              {home ? `lng: ${home.lng.toFixed(4)} / lat: ${home.lat.toFixed(4)}` : "No home set"}
            </p>
          </section>
        </aside>

        <section className="map-shell">
          <MapView
            data={filtered}
            markerStyle={markerStyle}
            showLabels={showLabels}
            labelColor={labelColor}
            mapStyle={basemap.uri}
            projection={flat ? "mercator" : "globe"}
            allowRotate={rotate && flat}
            rasterSharpen={sharpen && !!basemap.sharpen}
            mapboxToken={MAPBOX_TOKEN}
            home={home ?? undefined}
          />
          <footer className="map-footer">
            <span className="muted">Use two fingers to move the map</span>
            <span className="muted">Use ctrl + scroll to zoom the map</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
