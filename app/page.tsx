'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CertisMap from '@/components/CertisMap';
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson';

type GJFC = FeatureCollection<Geometry, any>;
type Basemap = 'Hybrid' | 'Streets';

const DATA_URL = '/certis_agroute_app/data/retailers.geojson';
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

type Stop = { title: string; coord: [number, number] };

const US_BBOX: [number, number, number, number] = [-125, 24, -66.9, 49.5];

function bboxOf(fc: GJFC | null): [number, number, number, number] {
  if (!fc || !fc.features?.length) return US_BBOX;
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const f of fc.features) {
    if (f.geometry?.type === 'Point') {
      const [x, y] = (f.geometry as Point).coordinates as [number, number];
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

function haversine(a: [number, number], b: [number, number]) {
  const R = 6371;
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nearestNeighbor(home: [number, number], pts: Stop[]): Stop[] {
  const remaining = [...pts];
  const ordered: Stop[] = [];
  let cur = home;
  while (remaining.length) {
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(cur, remaining[i].coord);
      if (d < bestD) { bestD = d; best = i; }
    }
    const next = remaining.splice(best, 1)[0];
    ordered.push(next);
    cur = next.coord;
  }
  return ordered;
}

function googleLink(home: [number, number], path: Stop[]) {
  // Google Maps supports up to 25 waypoints (including origin + destination)
  const coords = path.map(p => `${p.coord[1]},${p.coord[0]}`);
  const origin = `${home[1]},${home[0]}`;
  const destination = coords.length ? coords[coords.length - 1] : origin;
  const waypoints = coords.slice(0, Math.max(0, 23)).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving&waypoints=${encodeURIComponent(waypoints)}`;
}

export default function Page() {
  const [basemap, setBasemap] = useState<Basemap>('Hybrid');
  const [raw, setRaw] = useState<GJFC | null>(null);

  // Filters
  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);

  const [stateSel, setStateSel] = useState<Set<string>>(new Set());
  const [retailerSel, setRetailerSel] = useState<Set<string>>(new Set());
  const [typeSel, setTypeSel] = useState<Set<string>>(new Set());

  const [homeText, setHomeText] = useState('');
  const [home, setHome] = useState<[number, number] | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [routeUrl, setRouteUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch(DATA_URL);
      const fc = (await r.json()) as GJFC;
      setRaw(fc);

      // seed filter lists
      const s = new Set<string>(), rset = new Set<string>(), t = new Set<string>();
      for (const f of fc.features) {
        const p: any = f.properties || {};
        if (p.State) s.add(p.State);
        if (p.Retailer) rset.add(p.Retailer);
        if (p.Type) t.add(p.Type);
      }
      const sArr = Array.from(s).sort();
      const rArr = Array.from(rset).sort();
      const tArr = Array.from(t).sort();
      setStates(sArr);
      setRetailers(rArr);
      setTypes(tArr);

      // default selections: all
      setStateSel(new Set(sArr));
      setRetailerSel(new Set(rArr));
      setTypeSel(new Set(tArr));
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!raw) return null;
    const feats = raw.features.filter(f => {
      const p: any = f.properties || {};
      return stateSel.has(p.State) && retailerSel.has(p.Retailer) && typeSel.has(p.Type);
    });
    return { type: 'FeatureCollection', features: feats } as GJFC;
  }, [raw, stateSel, retailerSel, typeSel]);

  const fcBbox = useMemo(() => bboxOf(filtered || raw), [filtered, raw]);

  const toggleFrom = (set: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) => {
    set(prev => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  // Map click -> add stop
  const handleAddStop = (coord: [number, number], title: string) => {
    setStops(prev => [...prev, { coord, title }]);
  };

  // Home geocode
  const geocodeHome = async () => {
    if (!homeText.trim()) return;
    try {
      const q = encodeURIComponent(homeText.trim());
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?limit=1&access_token=${MAPBOX_TOKEN}`;
      const r = await fetch(url);
      const j = await r.json();
      const c = j?.features?.[0]?.center as [number, number] | undefined;
      if (c) setHome(c);
    } catch {}
  };

  const optimize = () => {
    if (!home || stops.length === 0) {
      setRouteUrl(null);
      return;
    }
    const ordered = nearestNeighbor(home, stops);
    setRouteUrl(googleLink(home, ordered));
  };

  const clearTrip = () => {
    setStops([]);
    setRouteUrl(null);
  };

  return (
    <main className="app-grid">
      {/* Left column */}
      <aside className="aside">
        <section className="panel">
          <div className="panel-title">Basemap</div>
          <select
            className="select"
            value={basemap}
            onChange={e => setBasemap(e.target.value as Basemap)}
          >
            <option>Hybrid</option>
            <option>Streets</option>
          </select>
          <div className="hint">Double-click the map to set <b>Home</b>. Click a point to add a stop.</div>
        </section>

        <section className="panel">
          <div className="panel-title">Filters</div>

          <div className="label">States ({states.length})</div>
          <div className="chip-row">
            <button className="chip" onClick={() => setStateSel(new Set(states))}>All</button>
            <button className="chip" onClick={() => setStateSel(new Set())}>None</button>
          </div>
          <div className="checklist">
            {states.map(s => (
              <label key={s} className="checkrow">
                <input type="checkbox" checked={stateSel.has(s)} onChange={() => toggleFrom(setStateSel, s)} />
                <span>{s}</span>
              </label>
            ))}
          </div>

          <div className="label">Retailers ({retailers.length})</div>
          <div className="chip-row">
            <button className="chip" onClick={() => setRetailerSel(new Set(retailers))}>All</button>
            <button className="chip" onClick={() => setRetailerSel(new Set())}>None</button>
          </div>
          <div className="checklist">
            {retailers.map(r => (
              <label key={r} className="checkrow">
                <input type="checkbox" checked={retailerSel.has(r)} onChange={() => toggleFrom(setRetailerSel, r)} />
                <span>{r}</span>
              </label>
            ))}
          </div>

          <div className="label">Location Types ({types.length})</div>
          <div className="chip-row">
            <button className="chip" onClick={() => setTypeSel(new Set(types))}>All</button>
            <button className="chip" onClick={() => setTypeSel(new Set())}>None</button>
          </div>
          <div className="checklist">
            {types.map(t => (
              <label key={t} className="checkrow">
                <input type="checkbox" checked={typeSel.has(t)} onChange={() => toggleFrom(setTypeSel, t)} />
                <span>{t}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">Trip Planner</div>
          <div className="field">
            <div className="label">Home (ZIP or address)</div>
            <div className="home-row">
              <input
                className="input"
                placeholder="e.g., 50638"
                value={homeText}
                onChange={e => setHomeText(e.target.value)}
              />
              <button className="btn" onClick={geocodeHome}>Set</button>
            </div>
            <div className="hint">{home ? `Home: ${home[1].toFixed(5)}, ${home[0].toFixed(5)}` : 'Home not set.'}</div>
          </div>

          <div className="field">
            <div className="label">Stops ({stops.length})</div>
            {stops.length === 0 && <div className="hint">Click map points to add stops.</div>}
            {stops.map((s, i) => (
              <div key={`${s.title}-${i}`} className="stop-row">
                <span>{i + 1}. {s.title}</span>
                <button className="btn ghost" onClick={() => setStops(prev => prev.filter((_, idx) => idx !== i))}>Remove</button>
              </div>
            ))}
          </div>

          <div className="row">
            <button className="btn" onClick={optimize} disabled={!home || stops.length === 0}>Optimize Trip</button>
            <button className="btn ghost" onClick={clearTrip}>Clear Trip</button>
          </div>

          {routeUrl && (
            <div className="field">
              <div className="panel-title">Route Links</div>
              <div className="link-list">
                <a target="_blank" rel="noreferrer" href={routeUrl}>Open in Google Maps</a>
              </div>
            </div>
          )}
        </section>
      </aside>

      {/* Right column (map) */}
      <section className="panel map-shell">
        {filtered && (
          <CertisMap
            token={MAPBOX_TOKEN}
            basemap={basemap}
            data={filtered}
            bbox={fcBbox}
            home={home}
            onPointClick={handleAddStop}
          />
        )}
      </section>
    </main>
  );
}
