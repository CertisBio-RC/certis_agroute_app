'use client';

import React, { useMemo, useState } from 'react';
import CertisMap, { Stop } from '@/components/CertisMap';

// --------- env + constants ----------
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''; // "/certis_agroute_app" on Pages
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// Pre-zoom extent over Midwest-ish (lngLat bbox)
const DEFAULT_BBOX: [number, number, number, number] = [-106, 35.5, -84.5, 49];

export default function Page() {
  // These can stay lowercase – CertisMap now normalizes internally
  const [basemap, setBasemap] = useState<'hybrid' | 'streets'>('hybrid');
  const [markerStyle, setMarkerStyle] = useState<'dots' | 'logos'>('dots');

  // Trip planner bits (kept simple here)
  const [home, setHome] = useState<[number, number] | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [route, setRoute] = useState<any | null>(null);

  const dataUrl = useMemo(
    () => `${BASE_PATH}/data/retailers.geojson`,
    []
  );

  const resetMap = () => {
    setHome(null);
    setStops([]);
    setRoute(null);
  };

  return (
    <div className="min-h-screen w-full bg-[#0b1021] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3">
        <img
          src={`${BASE_PATH}/certis-logo.png`}
          alt="Certis Biologicals"
          className="h-10 w-auto"
        />
        <button
          className="text-indigo-300 hover:text-indigo-200 underline underline-offset-4"
          onClick={resetMap}
        >
          Reset Map
        </button>
      </header>

      {/* Body: 2-column */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 px-5 pb-6">
        {/* Left column – controls (kept short here) */}
        <aside className="rounded-xl bg-[#0f172a] p-4 space-y-4">
          <h2 className="text-xl font-semibold">Map Options</h2>

          <div>
            <div className="text-sm mb-1 opacity-80">Basemap</div>
            <div className="flex gap-2">
              <button
                onClick={() => setBasemap('hybrid')}
                className={`px-3 py-1 rounded ${basemap === 'hybrid' ? 'bg-indigo-600' : 'bg-slate-700'}`}
              >
                Hybrid
              </button>
              <button
                onClick={() => setBasemap('streets')}
                className={`px-3 py-1 rounded ${basemap === 'streets' ? 'bg-indigo-600' : 'bg-slate-700'}`}
              >
                Streets
              </button>
            </div>
          </div>

          <div>
            <div className="text-sm mb-1 opacity-80">Markers</div>
            <div className="flex gap-2">
              <button
                onClick={() => setMarkerStyle('dots')}
                className={`px-3 py-1 rounded ${markerStyle === 'dots' ? 'bg-indigo-600' : 'bg-slate-700'}`}
              >
                Colored dots
              </button>
              <button
                onClick={() => setMarkerStyle('logos')}
                className={`px-3 py-1 rounded ${markerStyle === 'logos' ? 'bg-indigo-600' : 'bg-slate-700'}`}
              >
                Logos
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-700/40">
            <p className="text-sm opacity-80">Tip: Double-click the map to set <span className="font-semibold">Home</span>. Click a point to add a <span className="font-semibold">stop</span>.</p>
          </div>
        </aside>

        {/* Right – the map itself */}
        <main className="rounded-xl overflow-hidden min-h-[70vh] lg:min-h-[78vh]">
          <CertisMap
            basePath={BASE_PATH}
            token={MAPBOX_TOKEN}
            basemap={basemap}
            markerStyle={markerStyle}
            dataUrl={dataUrl}
            bbox={DEFAULT_BBOX}
            home={home}
            stops={stops}
            routeGeoJSON={route || undefined}
            onMapDblClick={(lnglat) => setHome(lnglat)}
            onPointClick={(lnglat, title) =>
              setStops((prev) => prev.concat({ title, coords: lnglat }))
            }
            globe={false}
          />
        </main>
      </div>
    </div>
  );
}
