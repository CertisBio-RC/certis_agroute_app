"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import CertisMap, { CATEGORY_COLOR } from "@/components/CertisMap";
import { withBasePath } from "@/utils/paths";
import type { FeatureCollection, Point, GeoJsonProperties, Position } from "geojson";
import type { LngLat } from "mapbox-gl";

/** -----------------------------
 *  Minimal data loader (kept same shape you already use)
 *  - main retail locations
 *  - kingpins
 *  - suppliers list (optional filter)
 * -------------------------------- */
async function loadJson<T = any>(path: string): Promise<T> {
  const res = await fetch(withBasePath(path), { cache: "force-cache" });
  if (!res.ok) throw new Error(`failed to fetch ${path}`);
  return res.json();
}

type CatKey = "Agronomy" | "Agronomy/Grain" | "Distribution" | "Grain" | "Grain/Feed" | "Kingpin" | "Office/Service";

export default function Page() {
  // --- data ---
  const [rawMain, setRawMain] = useState<FeatureCollection<Point, GeoJsonProperties> | null>(null);
  const [rawKing, setRawKing] = useState<FeatureCollection<Point, GeoJsonProperties> | null>(null);

  useEffect(() => {
    let ok = true;
    (async () => {
      // paths should match your /public/data files
      const [main, kings] = await Promise.all([
        loadJson<FeatureCollection<Point>>("/data/retailers.geojson"),
        loadJson<FeatureCollection<Point>>("/data/kingpins.geojson"),
      ]);
      if (!ok) return;
      setRawMain(main);
      setRawKing(kings);
    })().catch(console.error);
    return () => {
      ok = false;
    };
  }, []);

  // --- filters / UI state (kept simple; wire to your existing logic as needed) ---
  const [zip, setZip] = useState("");
  const [mapStyle, setMapStyle] = useState<"hybrid" | "street">("hybrid");
  const [roundTrip, setRoundTrip] = useState(true);

  // Category toggles (all on by default)
  const allCats: CatKey[] = ["Agronomy","Agronomy/Grain","Distribution","Grain","Grain/Feed","Kingpin","Office/Service"];
  const [selectedCats, setSelectedCats] = useState<Record<CatKey, boolean>>(
    () => Object.fromEntries(allCats.map((k) => [k, true])) as Record<CatKey, boolean>
  );

  // Home (ZIP) geocoded to [lng,lat]
  const [home, setHome] = useState<Position | null>(null);
  const geocodeZip = useCallback(async () => {
    const code = zip.trim();
    if (!code) return;
    try {
      // very small geocoder (replace with your existing)
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&postalcode=${encodeURIComponent(code)}&countrycodes=us`);
      const arr = await res.json();
      if (Array.isArray(arr) && arr[0]) {
        setHome([parseFloat(arr[0].lon), parseFloat(arr[0].lat)]);
      }
    } catch {}
  }, [zip]);

  // Filter main dataset by categories (relies on your feature properties.category value)
  const filteredMain = useMemo<FeatureCollection<Point> | null>(() => {
    if (!rawMain) return null;
    const feats = rawMain.features.filter((f) => {
      const c = (f.properties?.category as CatKey) ?? "Agronomy";
      return selectedCats[c] !== false;
    });
    return { type: "FeatureCollection", features: feats };
  }, [rawMain, selectedCats]);

  // Add stop (kept same signature as your map)
  const addStop = useCallback((props: any, ll: LngLat) => {
    // hook into your trip list logic here
    // console.log("Add stop:", props?.name, ll.lng, ll.lat);
  }, []);

  // --- layout ---
  return (
    <main className="agroute-shell">
      {/* LEFT COLUMN */}
      <aside className="agroute-sidebar">
        <div className="card" style={{ paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <img src={withBasePath("/certis-logo.png")} alt="CERTIS" style={{ height: 24 }} />
          </div>

          <h1 style={{ marginBottom: 6 }}>Home (ZIP)</h1>
          <div className="input-row" style={{ marginBottom: 10 }}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 50309"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
            <button className="btn" onClick={geocodeZip}>Set</button>
          </div>
        </div>

        <div className="card">
          <h2>Map Style</h2>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 6 }}>
            <label><input type="radio" name="style" checked={mapStyle==="hybrid"} onChange={() => setMapStyle("hybrid")} /> Hybrid</label>
            <label><input type="radio" name="style" checked={mapStyle==="street"} onChange={() => setMapStyle("street")} /> Street</label>
          </div>
        </div>

        <div className="card">
          <h2>Location Types</h2>
          <div className="legend-dots" style={{ marginTop: 8 }}>
            {allCats.map((c) => (
              <label key={c} style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span className="dot" style={{ background: CATEGORY_COLOR[c] || "#aaa" }} />
                <input type="checkbox" checked={selectedCats[c]} onChange={(e)=>setSelectedCats(s=>({...s,[c]:e.target.checked}))} />
                {c}
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Trip Builder</h2>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>Hover to preview, click to add a stop.</p>
          <label style={{ display:"flex", gap:8, alignItems:"center", marginTop: 10 }}>
            <input type="checkbox" checked={roundTrip} onChange={(e)=>setRoundTrip(e.target.checked)} />
            Round trip
          </label>
        </div>
      </aside>

      {/* RIGHT COLUMN (MAP) */}
      <section className="agroute-map-panel">
        <div className="card map-host">
          <div className="map-watermark">
            <img src={withBasePath("/certis-logo.png")} alt="CERTIS" />
          </div>

          {/* Map component: passes filtered main + kingpins */}
          {filteredMain && rawKing && (
            <CertisMap
              main={filteredMain}
              kingpins={rawKing}
              home={home as Position}
              onPointClick={addStop}
              mapStyle={mapStyle}
            />
          )}
        </div>
      </section>
    </main>
  );
}

