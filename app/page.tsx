"use client";

import { useEffect, useMemo, useState } from "react";
import type { Feature, FeatureCollection as GJFC, GeoJsonProperties, Point } from "geojson";
import CertisMap, { Basemap } from "@/components/CertisMap";

// ---------- ENV ----------
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// If you keep your data somewhere else, adjust this list (first one that loads wins)
const DATA_CANDIDATES = [
  "/data/retailers.geojson",
  "/retailers.geojson",
  "/data/retailers.json",
  "/retailers.json",
];

// Lower 48 default bbox (mutable, not readonly)
const DEFAULT_BBOX: [number, number, number, number] = [-125, 24, -66.9, 49.5];

// ---------- Types ----------
type Stop = { title: string; coord: [number, number] };

type PTF = Feature<Point, GeoJsonProperties>;

// ---------- Helpers ----------
function isPointFeature(f: Feature): f is PTF {
  return f.geometry?.type === "Point";
}

function bboxOf(fc: GJFC): [number, number, number, number] {
  const nums: number[] = [];
  for (const f of fc.features) {
    if (!isPointFeature(f)) continue;
    const [x, y] = f.geometry.coordinates as [number, number];
    nums.push(x, y);
  }
  if (nums.length < 2) return [...DEFAULT_BBOX];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    const x = nums[i], y = nums[i + 1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  // Pad slightly
  const padX = (maxX - minX) * 0.05 || 0.5;
  const padY = (maxY - minY) * 0.05 || 0.5;
  return [minX - padX, minY - padY, maxX + padX, maxY + padY];
}

function uniqueSorted<T>(arr: T[]) {
  return Array.from(new Set(arr)).sort((a, b) => (String(a)).localeCompare(String(b)));
}

function getProp(p: Record<string, any>, keys: string[], fallback = "") {
  for (const k of keys) {
    const v = p[k];
    if (v != null && v !== "") return v;
  }
  return fallback;
}

async function geocodeZip(zip: string): Promise<[number, number] | null> {
  const z = zip.trim();
  if (!z) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    z
  )}.json?country=US&types=postcode&limit=1&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const feat = json?.features?.[0];
  const center = feat?.center;
  if (Array.isArray(center) && center.length === 2) return [center[0], center[1]];
  return null;
}

function nearestNeighbor(origin: [number, number], points: [number, number][]) {
  const remaining = points.slice();
  const order: number[] = [];
  let current = origin;
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const [x, y] = remaining[i];
      const d = (x - current[0]) ** 2 + (y - current[1]) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [chosen] = remaining.splice(bestIdx, 1);
    order.push(points.findIndex((p) => p[0] === chosen[0] && p[1] === chosen[1]));
    current = chosen;
  }
  return order;
}

function googleDirectionsUrl(
  home: [number, number],
  orderedStops: Stop[],
  roundtrip: boolean
) {
  // Google supports an origin, destination, and waypoints in between.
  if (!orderedStops.length) {
    return `https://www.google.com/maps/dir/${home[1]},${home[0]}`;
  }
  const origin = `${home[1]},${home[0]}`;
  const coords = orderedStops.map((s) => `${s.coord[1]},${s.coord[0]}`);
  let destination = coords[coords.length - 1];
  let waypoints = coords.slice(0, -1);
  if (roundtrip) {
    destination = origin;
    waypoints = coords;
  }
  const wp = waypoints.length ? `&waypoints=${encodeURIComponent(waypoints.join("|"))}` : "";
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origin
  )}&destination=${encodeURIComponent(destination)}${wp}`;
}

// ---------- Page ----------
export default function Page() {
  const [basemap, setBasemap] = useState<Basemap>("Hybrid");

  const [fc, setFc] = useState<GJFC>({ type: "FeatureCollection", features: [] });
  const [fcBbox, setFcBbox] = useState<[number, number, number, number]>([...DEFAULT_BBOX]);

  // Filters
  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);

  const [selStates, setSelStates] = useState<Record<string, boolean>>({});
  const [selRetailers, setSelRetailers] = useState<Record<string, boolean>>({});
  const [selTypes, setSelTypes] = useState<Record<string, boolean>>({});

  // Home via ZIP
  const [zip, setZip] = useState("");
  const [home, setHome] = useState<[number, number] | null>(null);

  // Trip planner
  const [stops, setStops] = useState<Stop[]>([]);
  const [roundtrip, setRoundtrip] = useState(true);

  // Load data once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let data: GJFC | null = null;
      for (const url of DATA_CANDIDATES) {
        try {
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) continue;
          const j = await r.json();
          if (j && j.type === "FeatureCollection") {
            data = j;
            break;
          }
        } catch {
          // keep trying
        }
      }
      if (!data) {
        // Fallback to empty
        data = { type: "FeatureCollection", features: [] };
      }
      if (!cancelled) {
        // keep only points
        const pts = (data.features || []).filter(isPointFeature);
        const cleaned: GJFC = { type: "FeatureCollection", features: pts };
        setFc(cleaned);
        setFcBbox(bboxOf(cleaned));

        // Derive filter domains
        const s = uniqueSorted(
          pts.map((f) =>
            getProp((f.properties || {}) as Record<string, any>, ["State", "ST"], "")
          ).filter(Boolean)
        );
        const r = uniqueSorted(
          pts.map((f) =>
            getProp((f.properties || {}) as Record<string, any>, ["Retailer", "Retailer Name"], "")
          ).filter(Boolean)
        );
        const t = uniqueSorted(
          pts.map((f) =>
            getProp(
              (f.properties || {}) as Record<string, any>,
              ["Type", "Location Type", "location_type"],
              ""
            )
          ).filter(Boolean)
        );
        setStates(s);
        setRetailers(r);
        setTypes(t);

        // Select all by default
        setSelStates(Object.fromEntries(s.map((x) => [x, true])));
        setSelRetailers(Object.fromEntries(r.map((x) => [x, true])));
        setSelTypes(Object.fromEntries(t.map((x) => [x, true])));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Apply filters
  const filteredFc: GJFC = useMemo(() => {
    if (!fc.features.length) return fc;
    const features = (fc.features as PTF[]).filter((f) => {
      const p = (f.properties || {}) as Record<string, any>;
      const st = getProp(p, ["State", "ST"], "");
      const rt = getProp(p, ["Retailer", "Retailer Name"], "");
      const ty = getProp(p, ["Type", "Location Type", "location_type"], "");
      return !!selStates[st] && !!selRetailers[rt] && !!selTypes[ty];
    });
    return { type: "FeatureCollection", features };
  }, [fc, selStates, selRetailers, selTypes]);

  const filteredBBox: [number, number, number, number] = useMemo(() => {
    const b = bboxOf(filteredFc);
    return [b[0], b[1], b[2], b[3]];
  }, [filteredFc]);

  // on map click add stop
  const onPointClick = (lnglat: [number, number], title: string) => {
    setStops((prev) => {
      if (prev.some((s) => s.title === title)) return prev;
      return [...prev, { title, coord: lnglat }];
    });
  };

  const resetFilters = () => {
    setSelStates(Object.fromEntries(states.map((x) => [x, true])));
    setSelRetailers(Object.fromEntries(retailers.map((x) => [x, true])));
    setSelTypes(Object.fromEntries(types.map((x) => [x, true])));
  };

  const resetMap = () => {
    setBasemap("Hybrid");
    setHome(null);
    setZip("");
    setStops([]);
  };

  const setAll = (setter: (v: Record<string, boolean>) => void, keys: string[], val: boolean) =>
    setter(Object.fromEntries(keys.map((k) => [k, val])));

  const optimize = () => {
    if (!home || stops.length < 2) return;
    const coords = stops.map((s) => s.coord);
    const orderIdx = nearestNeighbor(home, coords);
    const sorted = orderIdx.map((i) => stops[i]);
    setStops(sorted);
  };

  const googleHref = home ? googleDirectionsUrl(home, stops, roundtrip) : undefined;

  // ZIP → Home
  const geocodeAndSetHome = async () => {
    if (!MAPBOX_TOKEN) {
      alert("Missing NEXT_PUBLIC_MAPBOX_TOKEN.");
      return;
    }
    const pt = await geocodeZip(zip);
    if (!pt) {
      alert("ZIP not found. Please check and try again.");
      return;
    }
    setHome(pt);
  };

  return (
    <main className="app-grid">
      {/* Sidebar */}
      <aside className="aside">
        {/* Brand inside frame (simple img; put correct asset in /public if you want) */}
        <div className="panel" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo-certis.png" alt="Certis Biologicals" style={{ height: 36 }} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn ghost" onClick={resetFilters}>Reset Filters</button>
            <button className="btn ghost" onClick={resetMap}>Reset Map</button>
          </div>
        </div>

        {/* Basemap + ZIP/Home */}
        <div className="panel">
          <div className="field">
            <div className="label">Basemap</div>
            <select
              className="select"
              value={basemap}
              onChange={(e) => setBasemap(e.target.value as Basemap)}
            >
              <option>Hybrid</option>
              <option>Streets</option>
            </select>
          </div>

          <div className="field">
            <div className="label">Home (ZIP code)</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                placeholder="e.g., 68102"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                inputMode="numeric"
              />
              <button className="btn" onClick={geocodeAndSetHome}>Set</button>
            </div>
            <div className="hint">
              Enter a 5-digit ZIP (US). We’ll geocode and center the map.
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="panel">
          <div className="panel-title">Filters</div>

          <div className="field">
            <div className="label">States ({states.length})</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button className="btn ghost" onClick={() => setAll(setSelStates, states, true)}>All</button>
              <button className="btn ghost" onClick={() => setAll(setSelStates, states, false)}>None</button>
            </div>
            <div style={{ maxHeight: 220, overflow: "auto", paddingRight: 6 }}>
              {states.map((s) => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={!!selStates[s]}
                    onChange={(e) => setSelStates({ ...selStates, [s]: e.target.checked })}
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="label">Retailers ({retailers.length})</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button className="btn ghost" onClick={() => setAll(setSelRetailers, retailers, true)}>All</button>
              <button className="btn ghost" onClick={() => setAll(setSelRetailers, retailers, false)}>None</button>
            </div>
            <div style={{ maxHeight: 240, overflow: "auto", paddingRight: 6 }}>
              {retailers.map((r) => (
                <label key={r} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={!!selRetailers[r]}
                    onChange={(e) => setSelRetailers({ ...selRetailers, [r]: e.target.checked })}
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="label">Location Types ({types.length})</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button className="btn ghost" onClick={() => setAll(setSelTypes, types, true)}>All</button>
              <button className="btn ghost" onClick={() => setAll(setSelTypes, types, false)}>None</button>
            </div>
            <div style={{ maxHeight: 200, overflow: "auto", paddingRight: 6 }}>
              {types.map((t) => (
                <label key={t} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={!!selTypes[t]}
                    onChange={(e) => setSelTypes({ ...selTypes, [t]: e.target.checked })}
                  />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Trip planner */}
        <div className="panel">
          <div className="panel-title">Trip Planner</div>
          <div className="field" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={roundtrip} onChange={(e) => setRoundtrip(e.target.checked)} />
              Roundtrip
            </label>
            <button className="btn ghost" onClick={() => setStops([])}>Clear Trip</button>
            <button className="btn ghost" disabled={!home || stops.length < 2} onClick={optimize}>
              Optimize
            </button>
            {home && (
              <a className="btn" href={googleHref} target="_blank" rel="noreferrer">
                Open in Google Maps
              </a>
            )}
          </div>

          <div className="hint">Click any map point to add it as a stop.</div>

          <ol style={{ marginTop: 10, paddingLeft: 18 }}>
            {stops.map((s, i) => (
              <li key={`${s.title}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                <button className="btn ghost" onClick={() => setStops(stops.filter((x, idx) => idx !== i))}>
                  Remove
                </button>
              </li>
            ))}
          </ol>
        </div>
      </aside>

      {/* Map column */}
      <div>
        <div className="panel">
          <CertisMap
            token={MAPBOX_TOKEN}
            basemap={basemap}
            data={filteredFc}
            bbox={filteredBBox}
            home={home ?? undefined}
            onPointClick={onPointClick}
          />
        </div>
      </div>
    </main>
  );
}
