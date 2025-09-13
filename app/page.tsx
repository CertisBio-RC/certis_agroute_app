"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Map from "@/components/Map";

/* ---------- ENV HELPERS ---------- */
const BASE_PATH =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BASE_PATH) || "";
const MAPBOX_TOKEN =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
      process.env.MAPBOX_PUBLIC_TOKEN)) ||
  "";

/* ---------- TYPES ---------- */
type Feature = {
  type: "Feature";
  geometry: { type: string; coordinates?: [number, number] } | null;
  properties: Record<string, any>;
};
type FC = { type: "FeatureCollection"; features: Feature[] };

type Stop = { coord: [number, number]; title: string };

/* ---------- UTILS ---------- */
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

const fmtLatLng = ([lng, lat]: [number, number]) =>
  `${lat.toFixed(6)},${lng.toFixed(6)}`;

/* ---------- PAGE ---------- */
export default function Page() {
  /* Filters / options */
  const [stateF, setStateF] = useState("All");
  const [retailerF, setRetailerF] = useState("All");
  const [categoryF, setCategoryF] = useState("All");
  const [basemap, setBasemap] = useState<"hybrid" | "streets">("hybrid");
  const [markerStyle, setMarkerStyle] = useState<"dots" | "logos">("dots");

  /* Data */
  const [raw, setRaw] = useState<FC | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* Trip planner state */
  const [home, setHome] = useState<[number, number] | null>(null); // [lng,lat]
  const [homeQuery, setHomeQuery] = useState("");
  const [stops, setStops] = useState<Stop[]>([]);
  const [routeGeoJSON, setRouteGeoJSON] = useState<any | null>(null);
  const [legs, setLegs] = useState<Array<{ from: [number, number]; to: [number, number] }>>([]);
  const [roundtrip, setRoundtrip] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [optError, setOptError] = useState<string | null>(null);

  /* Load retailers */
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

  /* Normalize + filter */
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

  /* Persist/restore trip state */
  useEffect(() => {
    try {
      const j = localStorage.getItem("certis_trip_v1");
      if (!j) return;
      const p = JSON.parse(j);
      if (Array.isArray(p?.stops)) setStops(p.stops);
      if (Array.isArray(p?.home) && p.home.length === 2) setHome(p.home);
      if (typeof p?.roundtrip === "boolean") setRoundtrip(p.roundtrip);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("certis_trip_v1", JSON.stringify({ home, stops, roundtrip }));
    } catch {}
  }, [home, stops, roundtrip]);

  /* Map event callbacks */
  const handleMapDblClick = useCallback((lnglat: [number, number]) => {
    setHome(lnglat);
  }, []);
  const handlePointClick = useCallback((lnglat: [number, number], title: string) => {
    setStops((s) => (s.find((t) => t.coord[0] === lnglat[0] && t.coord[1] === lnglat[1]) ? s : [...s, { coord: lnglat, title }]));
  }, []);

  /* Geocode "Home" from text */
  const geocodeHome = async () => {
    if (!homeQuery.trim()) return;
    if (!MAPBOX_TOKEN) {
      alert("Mapbox token missing. Add NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN.");
      return;
    }
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        homeQuery.trim()
      )}.json?limit=1&access_token=${MAPBOX_TOKEN}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`geocode failed: ${r.status}`);
      const j = await r.json();
      const f = j?.features?.[0];
      if (f?.center && Array.isArray(f.center) && f.center.length === 2) {
        setHome([f.center[0], f.center[1]]);
      } else {
        alert("Could not geocode that address.");
      }
    } catch (e: any) {
      alert(`Geocoding error: ${e?.message || e}`);
    }
  };

  /* Optimize trip with Mapbox Optimization API (v1) */
  const optimizeTrip = async () => {
    setOptError(null);
    setRouteGeoJSON(null);
    setLegs([]);

    if (!MAPBOX_TOKEN) {
      setOptError("Mapbox token missing; set NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN.");
      return;
    }
    if (!home) {
      setOptError("Set Home (address/ZIP or double-click the map).");
      return;
    }
    if (stops.length === 0) {
      setOptError("Add at least one stop (click a point).");
      return;
    }

    // Mapbox standard plan supports up to 12 coordinates (home + 11 stops)
    const coords: [number, number][] = [home, ...stops.map((s) => s.coord)];
    if (coords.length > 12) {
      setOptError(
        `Too many points for one optimization request: ${coords.length}. Limit is 12 (Home + 11 stops). Remove a few stops and try again.`
      );
      return;
    }

    try {
      setOptimizing(true);

      const coordStr = coords.map(([lng, lat]) => `${lng},${lat}`).join(";");
      const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        geometries: "geojson",
        overview: "full",
        roundtrip: String(roundtrip),
        steps: "false",
      });
      // Always start at Home (first coord). If not roundtrip, also end at last coord.
      params.set("source", "first");
      if (!roundtrip) params.set("destination", "last");

      const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordStr}?${params.toString()}`;

      const r = await fetch(url);
      const rawText = await r.text(); // allow detailed error body
      let j: any;
      try {
        j = JSON.parse(rawText);
      } catch {
        if (!r.ok) throw new Error(`Mapbox error ${r.status}: ${rawText}`);
        throw new Error("Unexpected response from Mapbox.");
      }

      if (!r.ok || (j.code && j.code !== "Ok")) {
        const msg = j.message || j.error || j.code || `HTTP ${r.status}`;
        throw new Error(String(msg));
      }

      const trip = j?.trips?.[0];
      if (!trip?.geometry) throw new Error("No trip found.");

      // Determine optimized order of input coordinates
      // Prefer trip.waypoint_order; fallback to waypoints[].waypoint_index
      let order: number[] | null = Array.isArray(trip.waypoint_order) ? trip.waypoint_order : null;
      if (!order && Array.isArray(j.waypoints)) {
        const arr = j.waypoints
          .slice()
          .sort((a: any, b: any) => (a.waypoint_index ?? 0) - (b.waypoint_index ?? 0));
        order = arr.map((w: any) => w.trip_index != null ? w.trip_index : w.waypoint_index);
        // If that still looks odd, map back by 'waypoint_index'
        if (!order || order.some((x: any) => typeof x !== "number")) {
          order = j.waypoints.map((w: any) => w.waypoint_index);
        }
      }
      if (!order || !Array.isArray(order) || order.length !== coords.length) {
        // As a final fallback, use input order (still valid if source=first)
        order = coords.map((_c, i) => i);
      }

      const orderedCoords: [number, number][] = order.map((i: number) => coords[i]);
      // If roundtrip, ensure last leg returns to start for external links
      if (roundtrip && orderedCoords.length > 1) {
        orderedCoords.push(orderedCoords[0]);
      }

      // Build leg pairs from ordered coordinates
      const legPairs: Array<{ from: [number, number]; to: [number, number] }> = [];
      for (let i = 0; i < orderedCoords.length - 1; i++) {
        legPairs.push({ from: orderedCoords[i], to: orderedCoords[i + 1] });
      }

      setRouteGeoJSON({ type: "Feature", geometry: trip.geometry, properties: {} });
      setLegs(legPairs);
    } catch (e: any) {
      setOptError(String(e?.message || e));
    } finally {
      setOptimizing(false);
    }
  };

  const clearTrip = () => {
    setStops([]);
    setRouteGeoJSON(null);
    setLegs([]);
  };
  const removeStop = (i: number) => {
    setStops((s) => s.filter((_, idx) => idx !== i));
  };

  /* Link builders (per leg) */
  const googleLeg = (from: [number, number], to: [number, number]) =>
    `https://www.google.com/maps/dir/?api=1&origin=${fmtLatLng(from)}&destination=${fmtLatLng(
      to
    )}&travelmode=driving`;
  const appleLeg = (from: [number, number], to: [number, number]) =>
    `https://maps.apple.com/?saddr=${fmtLatLng(from)}&daddr=${fmtLatLng(to)}&dirflg=d`;
  const wazeLeg = (_from: [number, number], to: [number, number]) =>
    `https://waze.com/ul?ll=${fmtLatLng(to)}&navigate=yes`;

  /* ---------- RENDER ---------- */
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
        {/* Header + logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${BASE_PATH}/certis-logo.png?v=10`}
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
          Filter retailers and plan optimized trips. Double-click map to set <b>Home</b>. Click a point to <b>add
          stop</b>.
        </p>

        {/* Filters */}
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

        {/* Map options */}
        <section
          style={{
            background: "#111827",
            border: "1px solid #334155",
            borderRadius: 14,
            padding: 12,
            marginBottom: 14,
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

        {/* Trip Planner */}
        <section
          style={{
            background: "#111827",
            border: "1px solid #334155",
            borderRadius: 14,
            padding: 12,
          }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Trip Planner</h2>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>
              Home (address or double-click map)
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder="ZIP or address (e.g., 50638)"
                value={homeQuery}
                onChange={(e) => setHomeQuery(e.target.value)}
                style={{
                  flex: 1,
                  background: "#0a0a0a",
                  color: "#e5e5e5",
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid #334155",
                }}
              />
              <button
                onClick={geocodeHome}
                style={{ padding: "8px 12px", borderRadius: 8, background: "#22c55e", color: "#111", fontWeight: 700 }}
              >
                Set
              </button>
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
              {home ? `Home: ${fmtLatLng([home[0], home[1]])}` : "No Home set."}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Stops (click map points to add)</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {stops.map((s, i) => (
                <li
                  key={`${s.coord[0]},${s.coord[1]}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: "#0b1322",
                    border: "1px solid #24324a",
                  }}
                >
                  <div style={{ fontSize: 12 }}>
                    <b>{i + 1}.</b>{" "}
                    {s.title || (
                      <span style={{ opacity: 0.75 }}>{fmtLatLng([s.coord[0], s.coord[1]])}</span>
                    )}
                  </div>
                  <button
                    onClick={() => removeStop(i)}
                    style={{ padding: "4px 8px", borderRadius: 6, background: "#ef4444", color: "#fff" }}
                    title="Remove"
                  >
                    Remove
                  </button>
                </li>
              ))}
              {stops.length === 0 && (
                <li style={{ fontSize: 12, opacity: 0.7 }}>No stops yet. Click a dot/logo on the map.</li>
              )}
            </ul>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={roundtrip} onChange={(e) => setRoundtrip(e.target.checked)} />
              Roundtrip
            </label>
            <button
              onClick={optimizeTrip}
              disabled={optimizing || !home || stops.length === 0}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: optimizing ? "#64748b" : "#0ea5e9",
                color: "#fff",
                fontWeight: 700,
              }}
              title={!home ? "Set Home first" : stops.length === 0 ? "Add at least one stop" : "Optimize"}
            >
              {optimizing ? "Optimizing…" : "Optimize Trip"}
            </button>
            <button
              onClick={clearTrip}
              style={{ padding: "8px 12px", borderRadius: 8, background: "#334155", color: "#e5e5e5", fontWeight: 600 }}
            >
              Clear Trip
            </button>
          </div>

          {optError && (
            <div style={{ color: "#fca5a5", fontSize: 12, marginTop: 8 }}>
              {optError}
            </div>
          )}

          {legs.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Optimized legs</div>
              <ol style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                {legs.map((leg, i) => (
                  <li key={i} style={{ fontSize: 12 }}>
                    <span style={{ opacity: 0.85 }}>Leg {i + 1}</span>{" "}
                    <a href={googleLeg(leg.from, leg.to)} target="_blank" rel="noreferrer">
                      Google
                    </a>{" "}
                    •{" "}
                    <a href={appleLeg(leg.from, leg.to)} target="_blank" rel="noreferrer">
                      Apple
                    </a>{" "}
                    •{" "}
                    <a href={wazeLeg(leg.from, leg.to)} target="_blank" rel="noreferrer">
                      Waze
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}
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
          /* trip planner props */
          home={home}
          stops={stops}
          routeGeoJSON={routeGeoJSON}
          onMapDblClick={handleMapDblClick}
          onPointClick={handlePointClick}
        />
      </main>
    </div>
  );
}
