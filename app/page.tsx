"use client";

import { useEffect, useMemo, useState } from "react";
import CertisMap from "@/components/CertisMap";

type LngLat = [number, number];
type GJPoint = { type: "Point"; coordinates: LngLat };
type GJFeature = {
  type: "Feature";
  geometry: GJPoint | null;
  properties: {
    Retailer: string;
    Name: string;
    Category: string;
    State: string;
    Address?: string;
    City?: string;
    Zip?: string;
  };
};
type GJFC = { type: "FeatureCollection"; features: GJFeature[] };

const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH ??
  (typeof window !== "undefined" && (window as any).__NEXT_ROUTER_BASEPATH__) ??
  "";

const DATA_URL = `${BASE_PATH}/data/retailers.geojson`;
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

function uniqSorted(a: string[]) {
  return [...new Set(a)].sort((x, y) => x.localeCompare(y));
}

function fcBBox(fc: GJFC): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g || g.type !== "Point") continue;
    const [x, y] = g.coordinates;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!isFinite(minX)) return [-125, 24, -66.9, 49.5];
  return [minX, minY, maxX, maxY];
}

export default function Page() {
  // UI state
  const [basemap, setBasemap] = useState<"Hybrid" | "Streets">("Hybrid");
  const [markerStyle, setMarkerStyle] = useState<"Colored dots" | "Logos">("Colored dots");

  // Data
  const [fc, setFc] = useState<GJFC | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filters
  const [selStates, setSelStates] = useState<Set<string>>(new Set());
  const [selRetailers, setSelRetailers] = useState<Set<string>>(new Set());
  const [selTypes, setSelTypes] = useState<Set<string>>(new Set());

  // Reset key forces map to re-mount (fit bounds)
  const [resetKey, setResetKey] = useState(0);

  // Load GeoJSON
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(DATA_URL, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as GJFC;

        if (!alive) return;

        const clean: GJFC = {
          type: "FeatureCollection",
          features: json.features.filter(
            (f) =>
              f.geometry &&
              f.geometry.type === "Point" &&
              Array.isArray(f.geometry.coordinates) &&
              f.geometry.coordinates.length === 2 &&
              typeof f.geometry.coordinates[0] === "number" &&
              typeof f.geometry.coordinates[1] === "number"
          ),
        };
        setFc(clean);

        const states = uniqSorted(clean.features.map((f) => f.properties.State || "").filter(Boolean));
        const retailers = uniqSorted(clean.features.map((f) => f.properties.Retailer || "").filter(Boolean));
        const types = uniqSorted(clean.features.map((f) => f.properties.Category || "").filter(Boolean));

        setSelStates(new Set(states));
        setSelRetailers(new Set(retailers));
        setSelTypes(new Set(types));
        setErr(null);
      } catch (e: any) {
        setErr(`Failed to load data: ${e?.message ?? e}`);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Lists for checkboxes
  const statesList = useMemo(
    () => (fc ? uniqSorted(fc.features.map((f) => f.properties.State || "").filter(Boolean)) : []),
    [fc]
  );
  const retailersList = useMemo(
    () => (fc ? uniqSorted(fc.features.map((f) => f.properties.Retailer || "").filter(Boolean)) : []),
    [fc]
  );
  const typesList = useMemo(
    () => (fc ? uniqSorted(fc.features.map((f) => f.properties.Category || "").filter(Boolean)) : []),
    [fc]
  );

  // Filtered FeatureCollection
  const filteredFc = useMemo<GJFC | null>(() => {
    if (!fc) return null;
    return {
      type: "FeatureCollection",
      features: fc.features.filter((f) => {
        const p = f.properties;
        return selStates.has(p.State || "") && selRetailers.has(p.Retailer || "") && selTypes.has(p.Category || "");
      }),
    };
  }, [fc, selStates, selRetailers, selTypes]);

  const filteredBBox = useMemo(() => (filteredFc ? fcBBox(filteredFc) : ([-125, 24, -66.9, 49.5] as const)), [filteredFc]);

  // helpers
  function toggle(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }
  const allStates = () => setSelStates(new Set(statesList));
  const noneStates = () => setSelStates(new Set());
  const allRetailers = () => setSelRetailers(new Set(retailersList));
  const noneRetailers = () => setSelRetailers(new Set());
  const allTypes = () => setSelTypes(new Set(typesList));
  const noneTypes = () => setSelTypes(new Set());

  // Wire the “Reset Map” header button
  useEffect(() => {
    const btn = document.getElementById("reset-map-btn");
    if (!btn) return;
    const handler = () => {
      if (statesList.length) allStates();
      if (retailersList.length) allRetailers();
      if (typesList.length) allTypes();
      setBasemap("Hybrid");
      setMarkerStyle("Colored dots");
      setResetKey((k) => k + 1);
    };
    btn.addEventListener("click", handler);
    return () => btn.removeEventListener("click", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesList.length, retailersList.length, typesList.length]);

  return (
    <div className="app-grid">
      {/* LEFT: Sidebar */}
      <aside className="aside">
        {/* Map Options */}
        <section className="panel">
          <div className="panel-title">Map Options</div>

          <div className="field">
            <div className="label">Basemap</div>
            <select
              className="select"
              value={basemap}
              onChange={(e) => setBasemap(e.target.value === "Streets" ? "Streets" : "Hybrid")}
            >
              <option>Hybrid</option>
              <option>Streets</option>
            </select>
          </div>

          <div className="field">
            <div className="label">Markers</div>
            <select
              className="select"
              value={markerStyle}
              onChange={(e) => setMarkerStyle(e.target.value === "Logos" ? "Logos" : "Colored dots")}
            >
              <option>Colored dots</option>
              <option>Logos</option>
            </select>
          </div>

          <p className="hint">
            Double-click the map to set <strong>Home</strong>. Click a point to add a stop.
          </p>
        </section>

        {/* Filters */}
        <section className="panel">
          <div className="panel-title">Filters</div>

          {/* States */}
          <div className="field">
            <div className="label">
              States &nbsp;
              <span style={{ color: "var(--muted)" }}>
                ({selStates.size} of {statesList.length})
              </span>
            </div>
            <div className="field" style={{ display: "flex", gap: 8 }}>
              <button className="btn ghost" onClick={allStates} type="button">
                All
              </button>
              <button className="btn ghost" onClick={noneStates} type="button">
                None
              </button>
            </div>
            <div className="panel" style={{ maxHeight: 160, overflow: "auto" }}>
              {statesList.map((s) => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <input
                    type="checkbox"
                    checked={selStates.has(s)}
                    onChange={() => setSelStates((cur) => toggle(cur, s))}
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Retailers */}
          <div className="field">
            <div className="label">
              Retailers &nbsp;
              <span style={{ color: "var(--muted)" }}>
                ({selRetailers.size} of {retailersList.length})
              </span>
            </div>
            <div className="field" style={{ display: "flex", gap: 8 }}>
              <button className="btn ghost" onClick={allRetailers} type="button">
                All
              </button>
              <button className="btn ghost" onClick={noneRetailers} type="button">
                None
              </button>
            </div>
            <div className="panel" style={{ maxHeight: 180, overflow: "auto" }}>
              {retailersList.map((r) => (
                <label key={r} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <input
                    type="checkbox"
                    checked={selRetailers.has(r)}
                    onChange={() => setSelRetailers((cur) => toggle(cur, r))}
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Types */}
          <div className="field">
            <div className="label">
              Location Types &nbsp;
              <span style={{ color: "var(--muted)" }}>
                ({selTypes.size} of {typesList.length})
              </span>
            </div>
            <div className="field" style={{ display: "flex", gap: 8 }}>
              <button className="btn ghost" onClick={allTypes} type="button">
                All
              </button>
              <button className="btn ghost" onClick={noneTypes} type="button">
                None
              </button>
            </div>
            <div className="panel" style={{ maxHeight: 140, overflow: "auto" }}>
              {typesList.map((t) => (
                <label key={t} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <input
                    type="checkbox"
                    checked={selTypes.has(t)}
                    onChange={() => setSelTypes((cur) => toggle(cur, t))}
                  />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {err && (
          <section className="panel" style={{ borderColor: "#7f1d1d", background: "#7f1d1d22" }}>
            <div className="panel-title">Error</div>
            <div>{err}</div>
          </section>
        )}
      </aside>

      {/* RIGHT: Map */}
      <section className="map-shell">
        <div className="map-card">
          {loading || !filteredFc ? (
            <div style={{ padding: 16, color: "var(--muted)" }}>Loading map…</div>
          ) : (
            <CertisMap
              key={resetKey}
              token={MAPBOX_TOKEN}
              basemap={basemap}
              markerStyle={markerStyle}
              data={filteredFc}
              bbox={filteredBBox}
            />
          )}
        </div>
      </section>
    </div>
  );
}
