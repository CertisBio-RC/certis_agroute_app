"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { GeoJSON } from "geojson";

const CertisMap = dynamic(() => import("@/components/CertisMap"), { ssr: false });

type GJPoint = GeoJSON.Feature<GeoJSON.Point, any>;
type GJFC = GeoJSON.FeatureCollection<GeoJSON.Point, any>;

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

const US_BBOX: [number, number, number, number] = [-125, 24, -66.9, 49.5];

function bboxOf(fc: GJFC): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const f of fc.features) {
    const [x, y] = f.geometry.coordinates;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!isFinite(minX)) return US_BBOX;
  return [minX, minY, maxX, maxY];
}

export default function Page() {
  const [raw, setRaw] = useState<GJFC | null>(null);
  const [basemap, setBasemap] = useState<"Hybrid" | "Streets">("Hybrid");

  // Filters
  const [stateSel, setStateSel] = useState<string[]>([]);
  const [retSel, setRetSel] = useState<string[]>([]);
  const [typeSel, setTypeSel] = useState<string[]>([]);

  // Trip builder (UI only for now; optimizer will come back next change)
  const [stops, setStops] = useState<{ title: string; coords: [number, number] }[]>([]);
  const [homeText, setHomeText] = useState("");
  const [home, setHome] = useState<[number, number] | null>(null);

  // load dataset
  useEffect(() => {
    const url = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/retailers.geojson`;
    fetch(url)
      .then((r) => r.json())
      .then((fc) => setRaw(fc))
      .catch((e) => console.error("Failed to load retailers.geojson", e));
  }, []);

  // catalog lists
  const { states, retailers, types } = useMemo(() => {
    const s = new Set<string>();
    const r = new Set<string>();
    const t = new Set<string>();
    for (const f of raw?.features ?? []) {
      const p: any = f.properties || {};
      const state = (p.state ?? p.State ?? "").toString().trim();
      const retailer = (p.retailer ?? p.Retailer ?? "").toString().trim();
      const type = (p.category ?? p.Category ?? p.type ?? p.Type ?? "").toString().trim();
      if (state) s.add(state);
      if (retailer) r.add(retailer);
      if (type) t.add(type);
    }
    return {
      states: Array.from(s).sort(),
      retailers: Array.from(r).sort(),
      types: Array.from(t).sort(),
    };
  }, [raw]);

  // initialize selections (first load)
  useEffect(() => {
    if (!raw) return;
    setStateSel(states);
    setRetSel(retailers);
    setTypeSel(types);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  // filtering
  const filteredFc: GJFC | null = useMemo(() => {
    if (!raw) return null;
    const feats = raw.features.filter((f) => {
      const p: any = f.properties || {};
      const state = (p.state ?? p.State ?? "").toString().trim();
      const retailer = (p.retailer ?? p.Retailer ?? "").toString().trim();
      const type = (p.category ?? p.Category ?? p.type ?? p.Type ?? "").toString().trim();
      return stateSel.includes(state) && retSel.includes(retailer) && typeSel.includes(type);
    });
    return { type: "FeatureCollection", features: feats };
  }, [raw, stateSel, retSel, typeSel]);

  const filteredBBox = useMemo<[number, number, number, number]>(() => {
    if (!filteredFc || filteredFc.features.length === 0) return US_BBOX;
    return bboxOf(filteredFc);
  }, [filteredFc]);

  // map click (add stop)
  const handlePointClick = (lngLat: [number, number], title: string) => {
    setStops((s) => [...s, { title, coords: lngLat }]);
  };

  // geocode Home
  const geocode = async (q: string) => {
    if (!q || !MAPBOX_TOKEN) return;
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        q
      )}.json?limit=1&access_token=${MAPBOX_TOKEN}`;
      const res = await fetch(url);
      const j = await res.json();
      const first = j?.features?.[0];
      if (!first) return;
      const [x, y] = first.center as [number, number];
      setHome([x, y]);
      alert(`Home set: ${first.place_name}`);
    } catch (e) {
      console.error(e);
    }
  };

  const resetFilters = () => {
    setStateSel(states);
    setRetSel(retailers);
    setTypeSel(types);
  };

  return (
    <main>
      {/* Header */}
      <header className="site-header">
        <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/certis-logo.png`} alt="Certis Biologicals" className="brand-logo" />
        <nav className="header-nav">
          <button className="btn ghost" onClick={resetFilters}>
            Reset Filters
          </button>
          <a className="btn ghost" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`}>
            Reset Map
          </a>
        </nav>
      </header>

      {/* Grid */}
      <div className="app-grid">
        {/* Sidebar */}
        <aside className="aside">
          <section className="panel">
            <div className="panel-title">Map Options</div>

            <div className="field">
              <div className="label">Basemap</div>
              <select className="select" value={basemap} onChange={(e) => setBasemap(e.target.value as any)}>
                <option>Hybrid</option>
                <option>Streets</option>
              </select>
            </div>

            <div className="hint">Double-click map to set Home. Click a point to add a stop.</div>
          </section>

          <section className="panel">
            <div className="panel-title">Filters</div>

            <div className="label">States ({states.length})</div>
            <div className="field">
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button className="btn" onClick={() => setStateSel(states)}>
                  All
                </button>
                <button className="btn" onClick={() => setStateSel([])}>
                  None
                </button>
              </div>
              <div className="checklist">
                {states.map((s) => (
                  <label key={s}>
                    <input
                      type="checkbox"
                      checked={stateSel.includes(s)}
                      onChange={(e) =>
                        setStateSel((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))
                      }
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            <div className="label">Retailers ({retailers.length})</div>
            <div className="field">
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button className="btn" onClick={() => setRetSel(retailers)}>
                  All
                </button>
                <button className="btn" onClick={() => setRetSel([])}>
                  None
                </button>
              </div>
              <div className="checklist">
                {retailers.map((r) => (
                  <label key={r}>
                    <input
                      type="checkbox"
                      checked={retSel.includes(r)}
                      onChange={(e) =>
                        setRetSel((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)))
                      }
                    />
                    {r}
                  </label>
                ))}
              </div>
            </div>

            <div className="label">Location Types ({types.length})</div>
            <div className="field">
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button className="btn" onClick={() => setTypeSel(types)}>
                  All
                </button>
                <button className="btn" onClick={() => setTypeSel([])}>
                  None
                </button>
              </div>
              <div className="checklist">
                {types.map((t) => (
                  <label key={t}>
                    <input
                      type="checkbox"
                      checked={typeSel.includes(t)}
                      onChange={(e) =>
                        setTypeSel((prev) => (e.target.checked ? [...prev, t] : prev.filter((x) => x !== t)))
                      }
                    />
                    {t}
                  </label>
                ))}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">Trip Planner</div>
            <div className="field">
              <div className="label">Home (ZIP or address)</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="input" value={homeText} onChange={(e) => setHomeText(e.target.value)} placeholder="e.g., 50638" />
                <button className="btn" onClick={() => geocode(homeText)}>
                  Set
                </button>
              </div>
            </div>
            <div className="hint">Click any map point to add it as a stop.</div>
            <div className="field">
              {stops.length === 0 ? (
                <div className="hint">No stops yet.</div>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 16 }}>
                  {stops.map((s, i) => (
                    <li key={`${s.title}-${i}`}>{s.title}</li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </aside>

        {/* Map */}
        <div className="map-shell">
          {filteredFc && (
            <CertisMap
              key={filteredFc.features.length} // force small reset when filters change a lot
              token={MAPBOX_TOKEN}
              basemap={basemap}
              data={filteredFc}
              bbox={filteredBBox}
              onPointClick={handlePointClick}
            />
          )}
        </div>
      </div>
    </main>
  );
}
