'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CertisMap, { Basemap } from '@/components/CertisMap';

type GJFC = GeoJSON.FeatureCollection<GeoJSON.Point, any>;

const MAPBOX_TOKEN =
  (process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string) ||
  (process.env.MAPBOX_PUBLIC_TOKEN as string) ||
  '';

/** Detect GH Pages subpath so our data URL works in prod */
function useBasePath(): string {
  if (typeof document === 'undefined') return '';
  const el = document.querySelector('base') as HTMLBaseElement | null;
  if (el?.href) {
    try {
      const u = new URL(el.href);
      return u.pathname.replace(/\/$/, '');
    } catch {}
  }
  const parts = location.pathname.split('/').filter(Boolean);
  return parts.length ? `/${parts[0]}` : '';
}

function bboxOf(fc: GJFC): [number, number, number, number] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const f of fc.features) {
    const c = f.geometry?.coordinates;
    if (!c) continue;
    const [x, y] = c;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  // fallback to CONUS if empty
  if (minX > maxX || minY > maxY) return [-125, 24, -66.9, 49.5];
  return [minX, minY, maxX, maxY];
}

type Stop = { id: string; name: string; coord: [number, number] };

function haversine(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// simple nearest-neighbor orderer
function orderStops(home: [number, number], stops: Stop[], roundtrip: boolean) {
  const remaining = [...stops];
  const ordered: Stop[] = [];
  let cur = home;
  while (remaining.length) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(cur, remaining[i].coord);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const next = remaining.splice(best, 1)[0];
    ordered.push(next);
    cur = next.coord;
  }
  const coords: [number, number][] = [home, ...ordered.map(s => s.coord)];
  if (roundtrip) coords.push(home);
  return { ordered, coords };
}

function routeLineFrom(coords: [number, number][]): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const lines: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    lines.push({
      type: 'Feature',
      properties: { i },
      geometry: { type: 'LineString', coordinates: [coords[i], coords[i + 1]] },
    });
  }
  return { type: 'FeatureCollection', features: lines };
}

function googleLinkFrom(coords: [number, number][]) {
  // Google supports origin + destination + up to 23 waypoints
  // Build one (or more) links chunked accordingly
  const chunks: string[] = [];
  const ORIGIN = coords[0];
  let curStart = 0;
  while (curStart < coords.length - 1) {
    const remaining = coords.length - 1 - curStart;
    const waypointsCap = Math.min(23, Math.max(0, remaining - 1)); // exclude dest
    const end = curStart + 1 + waypointsCap;
    const origin = coords[curStart];
    const dest = coords[end];
    const ways = coords.slice(curStart + 1, end).map(c => `${c[1]},${c[0]}`).join('|');
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('origin', `${origin[1]},${origin[0]}`);
    url.searchParams.set('destination', `${dest[1]},${dest[0]}`);
    url.searchParams.set('travelmode', 'driving');
    if (ways) url.searchParams.set('waypoints', ways);
    chunks.push(url.toString());
    curStart = end;
  }
  return chunks;
}

export default function Page() {
  const BASE_PATH = useBasePath();

  const [basemap, setBasemap] = useState<Basemap>('Hybrid');
  const [markerStyle] = useState<'Colored dots'>('Colored dots'); // logos removed

  const [fc, setFc] = useState<GJFC>({ type: 'FeatureCollection', features: [] });
  const [filtered, setFiltered] = useState<GJFC>(fc);

  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);

  const [stateSel, setStateSel] = useState<Set<string>>(new Set());
  const [retSel, setRetSel] = useState<Set<string>>(new Set());
  const [catSel, setCatSel] = useState<Set<string>>(new Set());

  const [home, setHome] = useState<[number, number] | null>(null);
  const [homeInput, setHomeInput] = useState('');
  const [stops, setStops] = useState<Stop[]>([]);
  const [roundtrip, setRoundtrip] = useState(true);
  const [route, setRoute] = useState<GeoJSON.FeatureCollection<GeoJSON.LineString> | undefined>(undefined);
  const [googleLinks, setGoogleLinks] = useState<string[]>([]);

  // Load data once
  useEffect(() => {
    const url = `${BASE_PATH}/data/retailers.geojson`;
    fetch(url)
      .then(r => r.json())
      .then((gj: GJFC) => {
        setFc(gj);
        setFiltered(gj);
        const st = new Set<string>();
        const re = new Set<string>();
        const ct = new Set<string>();
        for (const f of gj.features) {
          const p = f.properties || {};
          if (p.State) st.add(p.State);
          if (p.Retailer) re.add(p.Retailer);
          if (p.Category) ct.add(p.Category);
        }
        setStates([...st].sort());
        setRetailers([...re].sort());
        setCats([...ct].sort());
        setStateSel(new Set(st));
        setRetSel(new Set(re));
        setCatSel(new Set(ct));
      })
      .catch(console.error);
  }, [BASE_PATH]);

  // Apply filters
  useEffect(() => {
    const ff: GJFC = { type: 'FeatureCollection', features: [] };
    for (const f of fc.features) {
      const p = f.properties || {};
      if (stateSel.size && !stateSel.has(p.State)) continue;
      if (retSel.size && !retSel.has(p.Retailer)) continue;
      if (catSel.size && !catSel.has(p.Category)) continue;
      ff.features.push(f);
    }
    setFiltered(ff);
  }, [fc, stateSel, retSel, catSel]);

  const filteredBBox = useMemo(() => bboxOf(filtered), [filtered]);

  // Handlers from the map
  const onMapDblClick = (lnglat: [number, number]) => {
    setHome(lnglat);
  };
  const onPointClick = (lnglat: [number, number], title: string) => {
    // prevent dup if last added is same spot
    const id = `${lnglat[0].toFixed(5)},${lnglat[1].toFixed(5)}`;
    if (stops.some(s => s.id === id)) return;
    setStops(prev => [...prev, { id, name: title, coord: lnglat }]);
  };

  // Geocode or parse the "Home" entry
  async function setHomeFromInput() {
    const raw = homeInput.trim();
    // lat,lng
    const m = raw.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      setHome([lng, lat]);
      return;
    }
    if (!MAPBOX_TOKEN) {
      alert('Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local to geocode addresses, or enter "lat,lng".');
      return;
    }
    const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(raw)}.json`);
    url.searchParams.set('access_token', MAPBOX_TOKEN);
    url.searchParams.set('limit', '1');
    const res = await fetch(url.toString());
    const gj = await res.json();
    const f = gj.features?.[0];
    if (f?.center) {
      setHome([f.center[0], f.center[1]]);
    } else {
      alert('Address not found.');
    }
  }

  function clearTrip() {
    setStops([]);
    setRoute(undefined);
    setGoogleLinks([]);
  }

  function optimizeTrip() {
    if (!home) {
      alert('Set Home first (double-click map or enter address/ZIP).');
      return;
    }
    if (!stops.length) {
      alert('Click map points to add stops.');
      return;
    }
    const { coords } = orderStops(home, stops, roundtrip);
    setRoute(routeLineFrom(coords));
    setGoogleLinks(googleLinkFrom(coords));
  }

  const toggleAll = (kind: 'state' | 'ret' | 'cat', on: boolean) => {
    const setFn = kind === 'state' ? setStateSel : kind === 'ret' ? setRetSel : setCatSel;
    const src = kind === 'state' ? states : kind === 'ret' ? retailers : cats;
    setFn(on ? new Set(src) : new Set());
  };

  /** checkbox builder */
  const List = ({
    items,
    sel,
    setSel,
    label,
  }: {
    items: string[];
    sel: Set<string>;
    setSel: (s: Set<string>) => void;
    label: string;
  }) => (
    <div className="panel">
      <div className="panel-title">{label} <span className="muted">({items.length})</span></div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button className="btn ghost" onClick={() => setSel(new Set(items))}>All</button>
        <button className="btn ghost" onClick={() => setSel(new Set())}>None</button>
      </div>
      <div className="checklist">
        {items.map(v => {
          const checked = sel.has(v);
          return (
            <label key={v} className="row">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const n = new Set(sel);
                  if (e.target.checked) n.add(v); else n.delete(v);
                  setSel(n);
                }}
              />
              <span>{v}</span>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Header */}
      <header className="site-header">
        <img src={`${useBasePath()}/certis-logo.png`} className="brand-logo" alt="Certis Biologicals" />
        <nav className="header-nav">
          <button className="btn ghost" onClick={() => { setStateSel(new Set(states)); setRetSel(new Set(retailers)); setCatSel(new Set(cats)); }}>
            Reset Filters
          </button>
          <button className="btn" onClick={() => { clearTrip(); setHome(null); }}>
            Reset Map
          </button>
        </nav>
      </header>

      {/* Grid */}
      <main className="app-grid">
        {/* Sidebar */}
        <aside className="aside">
          <div className="panel">
            <div className="panel-title">Map Options</div>
            <div className="field">
              <div className="label">Basemap</div>
              <select className="select" value={basemap} onChange={(e) => setBasemap(e.target.value as Basemap)}>
                <option>Hybrid</option>
                <option>Streets</option>
              </select>
            </div>

            <div className="hint">Double-click the map to set <b>Home</b>. Click a point to add a stop.</div>
          </div>

          <List items={states} sel={stateSel} setSel={setStateSel} label="States" />
          <List items={retailers} sel={retSel} setSel={setRetSel} label="Retailers" />
          <List items={cats} sel={catSel} setSel={setCatSel} label="Location Types" />

          <div className="panel">
            <div className="panel-title">Trip Planner</div>

            <div className="field">
              <div className="label">Home (address or <code>lat,lng</code>)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" placeholder="e.g., 50638 or 41.5,-97.2" value={homeInput} onChange={(e) => setHomeInput(e.target.value)} />
                <button className="btn" onClick={setHomeFromInput}>Set</button>
              </div>
              <div className="hint">Home: {home ? `${home[1].toFixed(4)}, ${home[0].toFixed(4)}` : 'unset'}</div>
            </div>

            <div className="field">
              <div className="label">Stops (click map points to add)</div>
              <div className="checklist">
                {stops.map((s, i) => (
                  <div key={s.id} className="row">
                    <span>{i + 1}. {s.name}</span>
                    <button className="btn ghost" onClick={() => setStops(prev => prev.filter(x => x.id !== s.id))}>Remove</button>
                  </div>
                ))}
                {!stops.length && <div className="muted">No stops yet.</div>}
              </div>
            </div>

            <div className="field">
              <label className="row">
                <input type="checkbox" checked={roundtrip} onChange={(e) => setRoundtrip(e.target.checked)} />
                <span>Roundtrip</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={optimizeTrip}>Optimize Trip</button>
              <button className="btn ghost" onClick={clearTrip}>Clear Trip</button>
            </div>

            {!!googleLinks.length && (
              <div className="field">
                <div className="label">Open in Google Maps</div>
                <ol className="link-list">
                  {googleLinks.map((u, i) => (
                    <li key={i}><a href={u} target="_blank">Leg {i + 1}</a></li>
                  ))}
                </ol>
                <div className="hint">Google caps directions at 25 points per link; long trips are split into multiple legs automatically.</div>
              </div>
            )}
          </div>
        </aside>

        {/* Map column */}
        <div className="map-shell">
          {filtered.features.length > 0 && (
            <CertisMap
              token={MAPBOX_TOKEN}
              basemap={basemap}
              data={filtered}
              bbox={[...filteredBBox] as [number, number, number, number]}
              route={route}
              onMapDblClick={onMapDblClick}
              onPointClick={onPointClick}
            />
          )}
        </div>
      </main>
    </>
  );
}
