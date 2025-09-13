'use client';

import { useMemo, useState } from 'react';
import CertisMap from '@/components/CertisMap';

type LngLat = [number, number];

const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH && process.env.NEXT_PUBLIC_BASE_PATH !== '/'
    ? (process.env.NEXT_PUBLIC_BASE_PATH as string)
    : '/certis_agroute_app';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function Page() {
  // ——— Map UI state (you can wire your richer controls into these) ———
  const [basemap, setBasemap] = useState<'hybrid' | 'streets'>('hybrid');
  const [markerStyle, setMarkerStyle] = useState<'dots' | 'logos'>('dots');

  // Trip state
  const [home, setHome] = useState<LngLat | null>(null);
  const [stops, setStops] = useState<Array<{ title: string; coord: LngLat }>>([]);

  // Data path built by your workflow
  const dataUrl = useMemo(() => `${BASE_PATH}/data/retailers.geojson`, []);

  // Handlers that CertisMap calls
  const onMapDblClick = (lnglat: LngLat) => setHome(lnglat);
  const onPointClick = (lnglat: LngLat, title: string) =>
    setStops((prev) => [...prev, { title, coord: lnglat }]);

  const clearTrip = () => setStops([]);

  return (
    <>
      {/* Sidebar */}
      <aside className="aside">
        <div className="aside-inner space-y-4">
          {/* Map Options */}
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

          {/* Filters shell — replace with your multi-select blocks */}
          <section className="block-card">
            <div className="block-title">Filters</div>
            <p className="help">
              Your existing States/Retailers/Types controls can live here; layout won’t change
              their logic.
            </p>
          </section>

          {/* Trip Planner shell — wire to your optimizer */}
          <section className="block-card">
            <div className="block-title">Trip Planner</div>
            <div className="space-y-2">
              <button className="button w-full" onClick={clearTrip}>
                Clear Trip
              </button>
              <div className="help">
                Home:{' '}
                {home ? `${home[1].toFixed(5)}, ${home[0].toFixed(5)}` : 'unset'}
              </div>
              {stops.length > 0 && (
                <ul className="text-sm space-y-1">
                  {stops.map((s, i) => (
                    <li key={`${s.title}-${i}`} className="truncate">
                      {i + 1}. {s.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </aside>

      {/* Map pane */}
      <section className="map-panel">
        <div className="map-fill">
          <CertisMap
            basePath={BASE_PATH}
            token={MAPBOX_TOKEN}
            basemap={basemap}
            markerStyle={markerStyle}
            dataUrl={dataUrl}          /* component fetches the GeoJSON itself */
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
