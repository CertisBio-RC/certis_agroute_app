'use client';

import { useMemo, useState } from 'react';
import CertisMap from '@/components/CertisMap';

const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH && process.env.NEXT_PUBLIC_BASE_PATH !== '/'
    ? process.env.NEXT_PUBLIC_BASE_PATH!
    : '/certis_agroute_app';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

type LngLat = [number, number];

export default function Page() {
  // --- UI state (keep simple; your existing advanced filters can replace these) ---
  const [basemap, setBasemap] = useState<'hybrid' | 'streets'>('hybrid');
  const [markerStyle, setMarkerStyle] = useState<'dots' | 'logos'>('dots');

  // Trip state (wire up to your optimizer if you already have one)
  const [home, setHome] = useState<LngLat | null>(null);
  const [stops, setStops] = useState<Array<{ title: string; coord: LngLat }>>([]);

  // Data path (your workflow builds this)
  const dataUrl = useMemo(
    () => `${BASE_PATH}/data/retailers.geojson`,
    []
  );

  // Handlers
  const onMapDblClick = (lnglat: LngLat) => setHome(lnglat);
  const onPointClick = (lnglat: LngLat, title: string) =>
    setStops((prev) => [...prev, { title, coord: lnglat }]);

  const clearTrip = () => {
    setStops([]);
  };

  return (
    <>
      {/* Sidebar */}
      <aside className="aside">
        <div className="aside-inner space-y-4">
          <section className="block-card">
            <div className="block-title">Map Options</div>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="select col-span-2"
                value={basemap}
                onChange={(e) => setBasemap(e.target.value as 'hybrid' | 'streets')}
              >
                <option value="hybrid">Hybrid</option>
                <option value="streets">Streets</option>
              </select>

              <select
                className="select col-span-2"
                value={markerStyle}
                onChange={(e) => setMarkerStyle(e.target.value as 'dots' | 'logos')}
              >
                <option value="dots">Colored dots</option>
                <option value="logos">Retailer logos</option>
              </select>
            </div>
            <p className="mt-2 help">
              Double-click the map to set <span className="font-medium">Home</span>. Click a
              point to add a <span className="font-medium">stop</span>.
            </p>
          </section>

          {/* Replace with your full multi-select blocks (States, Retailers, Location Types) */}
          <section className="block-card">
            <div className="block-title">Filters</div>
            <p className="help">
              Your existing filter UI goes here. The layout won’t affect your current logic.
            </p>
          </section>

          {/* Trip Planner shell (wire up to your optimizer) */}
          <section className="block-card">
            <div className="block-title">Trip Planner</div>
            <div className="space-y-2">
              <button className="button w-full" onClick={clearTrip}>
                Clear Trip
              </button>
              <div className="help">
                Home: {home ? `${home[1].toFixed(5)}, ${home[0].toFixed(5)}` : 'unset'}
              </div>
              {stops.length > 0 && (
                <ul className="text-sm space-y-1">
                  {stops.map((s, i) => (
                    <li key={i} className="truncate">
                      {i + 1}. {s.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </aside>

      {/* Map */}
      <section className="map-panel">
        <div className="map-fill">
          <CertisMap
            basePath={BASE_PATH}
            token={MAPBOX_TOKEN}
            basemap={basemap}          {/* lower-case supported in your component */}
            markerStyle={markerStyle}  {/* 'dots' | 'logos' */}
            dataUrl={dataUrl}          {/* component fetches FeatureCollection */}
            home={home as any}
            stops={stops as any}
            routeGeoJSON={null as any}
            onMapDblClick={onMapDblClick}
            onPointClick={onPointClick}
          />
        </div>
      </section>
    </>
  );
}
