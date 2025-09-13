"use client";

import { useEffect, useMemo, useState } from "react";
import Map from "@/components/Map";

/* --- ENV HELPERS --- */
const BASE_PATH =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BASE_PATH) || "";
const MAPBOX_TOKEN =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
      process.env.MAPBOX_PUBLIC_TOKEN)) ||
  "";

/* --- TYPES --- */
type Feature = {
  type: "Feature";
  geometry: { type: string; coordinates?: [number, number] } | null;
  properties: Record<string, any>;
};
type FC = { type: "FeatureCollection"; features: Feature[] };

const SKEYS = ["state", "State", "STATE"];
const RKEYS = ["retailer", "Retailer", "RETAILER"];
const CKEYS = ["category", "Category", "CATEGORY"];

const gp = (obj: any, keys: string[]) => {
  for (const k of keys) if (obj && obj[k] != null) return obj[k];
  return undefined;
};
const isLngLat = (c: any): c is [number, number] =>
  Array.isArray(c) &&
  c.length === 2 &&
  Number.isFinite(c[0]) &&
  Number.isFinite(c[1]) &&
  c[0] >= -180 &&
  c[0] <= 180 &&
  c[1] >= -90 &&
  c[1] <= 90;

export default function Page() {
  /* UI STATE */
  const [stateF, setStateF] = useState("All");
  const [retailerF, setRetailerF] = useState("All");
  const [categoryF, setCategoryF] = useState("All");
  const [basemap, setBasemap] = useState<"hybrid" | "streets">("hybrid");
  const [markerStyle, setMarkerStyle] = useState<"dots" | "logos">("dots");

  /* DATA */
  const [raw, setRaw] = useState<FC | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dataUrl = useMemo(() => {
    const v = `v=${Date.now()}`;
    const u = `${BASE_PATH}/data/retailers.geojson`;
    return u.includes("?") ? `${u}&${v}` : `${u}?${v}`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetch(dataUrl)
      .then(async (r) => {
        if (!r.ok) throw new Error(`retailers fetch failed: ${r.status}`);
        const j = (await r.json()) as FC;
        if (!cancelled) setRaw(j);
      })
      .catch((e) => !cancelled && setLoadError(String(e?.message || e)));
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  /* Normalize + filter + stats */
  const { fc, states, retailers, categories, bbox, shown, skipped } = useMemo(() => {
    const out: FC = { type: "FeatureCollection", features: [] };
    const S = new Set<string>(),
      R = new Set<string>(),
      C = new Set<string>();
    const bb = { minX: 180, minY: 90, maxX: -180, maxY: -90 };
    let shown = 0,
      skipped = 0;

    for (const f of raw?.features ?? []) {
      const st = String(gp(f.properties, SKEYS) ?? "").trim();
      const rt = String(gp(f.properties, RKEYS) ?? "").trim();
      const ct = String(gp(f.properties, CKEYS) ?? "").trim();

      if (st) S.add(st);
      if (rt) R.add(rt);
      if (ct) C.add(ct);

      const include =
        (stateF === "All" || st === stateF) &&
        (retailerF === "All" || rt === retailerF) &&
        (categoryF === "All" || ct === categoryF);

      if (!include) continue;

      const c = f.geometry?.coordinates;
      if (!isLngLat(c)) {
        skipped++;
        continue;
      }
      out.features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: c },
        properties: { ...f.properties, __retailerName: rt || "Unknown" },
      });
      shown++;
      if (c[0] < bb.minX) bb.minX = c[0];
      if (c[1] < bb.minY) bb.minY = c[1];
      if (c[0] > bb.maxX) bb.maxX = c[0];
      if (c[1] > bb.maxY) bb.maxY = c[1];
    }

    const sorted = (s: Set<string>) => ["All", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
    const bbox =
      out.features.length > 0 ? ([bb.minX, bb.minY, bb.maxX, bb.maxY] as [number, number, number, number]) : null;

    return {
      fc: out,
      states: sorted(S),
      retailers: sorted(R),
      categories: sorted(C),
      bbox,
      shown,
      skipped,
    };
  }, [raw, stateF, retailerF, categoryF]);

  /* ------- RENDER (LOCKED 2-COLUMN GRID) ------- */
  return (
    <div
      style={{
        height: "100dvh",
        display: "grid",
        gridTemplateColumns: "420px 1fr",
        background: "#0a0a0a",
        color: "#e5e5e5",
      }}
    >
      {/* LEFT SIDEBAR */}
      <aside
        style={{
          height: "100%",
          overflow: "auto",
          borderRight: "1px solid #262626",
          padding: 16,
        }}
      >
        {/* Header w/ small, fixed-size logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${BASE_PATH}/certis-logo.png?v=9`}
            alt="Certis"
            width={148}
            height={34}
            style={{ width: 148, height: "auto", display: "block" }}
          />
          <a href={`${BASE_PATH}/`} style={{ fontSize: 12, opacity: 0.8 }}>
            Home
          </a>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Certis AgRoute Planner</h1>
        <p style={{ fontSize: 12, opacity: 0.75, marginBottom: 14 }}>
          Filter retailers and visualize routes. Dbl-click map to set Home.
        </p>

        {/* Filters card */}
        <section
          style={{
            background: "#111827",
            border: "1px solid #334155",
            borderRadius: 14,
            padding: 12,
            marginBottom: 14,
          }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Filters</h2>

          <label style={{ fontSize: 12, opacity: 0.8 }}>State</label>
          <select
            style={{ width: "100%", marginTop: 4, marginBottom: 8, background: "#0a0a0a", padding: 8, borderRadius: 8 }}
            value={stateF}
            onChange={(e) => setStateF(e.target.value)}
          >
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>

          <label style={{ fontSize: 12, opacity: 0.8 }}>Retailer</label>
          <select
            style={{ width: "100%", marginTop: 4, marginBottom: 8, background: "#0a0a0a", padding: 8, borderRadius: 8 }}
            value={retailerF}
            onChange={(e) => setRetailerF(e.target.value)}
          >
            {retailers.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>

          <label style={{ fontSize: 12, opacity: 0.8 }}>Category</label>
          <select
            style={{ width: "100%", marginTop: 4, marginBottom: 8, background: "#0a0a0a", padding: 8, borderRadius: 8 }}
            value={categoryF}
            onChange={(e) => setCategoryF(e.target.value)}
          >
            {categories.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              style={{ padding: "8px 12px", borderRadius: 8, background: "#0ea5e9", color: "#fff", fontWeight: 600 }}
              onClick={() => {
                setStateF("All");
                setRetailerF("All");
                setCategoryF("All");
              }}
            >
              Clear Filters
            </button>
            <span style={{ fontSize: 12, opacity: 0.8 }}>
              {shown} shown{skipped ? ` (${skipped} skipped: invalid geometry)` : ""}
            </span>
          </div>
        </section>

        {/* Map options card */}
        <section
          style={{
            background: "#111827",
            border: "1px solid #334155",
            borderRadius: 14,
            padding: 12,
          }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Map Options</h2>

          <label style={{ fontSize: 12, opacity: 0.8 }}>Basemap</label>
          <select
            style={{ width: "100%", marginTop: 4, marginBottom: 8, background: "#0a0a0a", padding: 8, borderRadius: 8 }}
            value={basemap}
            onChange={(e) => setBasemap(e.target.value as any)}
            disabled={!MAPBOX_TOKEN}
            title={MAPBOX_TOKEN ? "" : "Mapbox token missing — using OSM fallback"}
          >
            <option value="hybrid">Hybrid</option>
            <option value="streets">Streets</option>
          </select>

          <label style={{ fontSize: 12, opacity: 0.8 }}>Markers</label>
          <select
            style={{ width: "100%", marginTop: 4, background: "#0a0a0a", padding: 8, borderRadius: 8 }}
            value={markerStyle}
            onChange={(e) => setMarkerStyle(e.target.value as any)}
          >
            <option value="dots">Colored dots</option>
            <option value="logos">Retailer logos</option>
          </select>

          <p style={{ fontSize: 11, opacity: 0.7, marginTop: 10 }}>
            Token detected: <b>{MAPBOX_TOKEN ? "yes" : "no (OSM fallback)"}</b>
            <br />
            Data path: <code>{BASE_PATH}/data/retailers.geojson</code>
            {loadError && (
              <>
                <br />
                <span style={{ color: "#fca5a5" }}>Error: {loadError}</span>
              </>
            )}
          </p>
        </section>
      </aside>

      {/* RIGHT: MAP */}
      <main style={{ position: "relative" }}>
        <Map
          basePath={BASE_PATH}
          token={MAPBOX_TOKEN}
          basemap={basemap}
          markerStyle={markerStyle}
          data={fc}
          bbox={bbox}
        />
      </main>
    </div>
  );
}
