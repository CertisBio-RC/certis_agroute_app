'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useMemo, useState } from 'react';

const CertisMap = dynamic(() => import('@/components/CertisMap'), { ssr: false });

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
  process.env.MAPBOX_PUBLIC_TOKEN ||
  '';

export default function Page() {
  // Minimal local state the map already expects
  const [basemap, setBasemap] = useState<'hybrid' | 'streets'>('hybrid');
  const [markerStyle, setMarkerStyle] = useState<'dots' | 'logos'>('dots');

  // Data URL (served from /public/data under Pages sub-path)
  const dataUrl = useMemo(() => `${BASE_PATH}/data/retailers.geojson`, []);

  // No-op handlers (your CertisMap implements full behavior)
  const [home, setHome] = useState<[number, number] | null>(null);
  const [stops, setStops] = useState<Array<{ title: string; coord: [number, number] }>>([]);

  const handleMapDblClick = (lnglat: [number, number]) => setHome(lnglat);
  const handlePointClick = (lnglat: [number, number], title: string) =>
    setStops((s) => [...s, { title, coord: lnglat }]);

  return (
    <div id="app-root">
      {/* Header */}
      <header className="header">
        <div className="flex items-center gap-3">
          <Image
            className="logo"
            src={`${BASE_PATH}/certis-logo.png`}
            width={180}
            height={40}
            alt="Certis Biologicals"
            priority
            unoptimized
          />
        </div>

        {/* Reset Map (far right) */}
        <a
          href={`${BASE_PATH}/?v=now`}
          className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-1.5 text-sm hover:bg-zinc-800"
        >
          Reset Map
        </a>
      </header>

      {/* Two-column layout */}
      <div className="flex">
        {/* Left rail */}
        <aside className="left-rail">
          <h1 className="text-2xl font-semibold mb-3">Certis AgRoute Planner</h1>

          <div className="left-card">
            <div className="mb-3 text-sm text-zinc-300">
              Filter retailers and plan optimized trips. Double-click map to set{' '}
              <span className="font-semibold">Home</span>. Click a point to{' '}
              <span className="font-semibold">add stop</span>.
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-zinc-400">Basemap</label>
              <select
                value={basemap}
                onChange={(e) => setBasemap(e.target.value as any)}
                className="col-span-1 rounded-lg border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-sm"
              >
                <option value="hybrid">Hybrid</option>
                <option value="streets">Streets</option>
              </select>

              <label className="text-xs text-zinc-400">Markers</label>
              <select
                value={markerStyle}
                onChange={(e) => setMarkerStyle(e.target.value as any)}
                className="col-span-1 rounded-lg border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-sm"
              >
                <option value="dots">Colored dots</option>
                <option value="logos">Retailer logos</option>
              </select>
            </div>
          </div>

          {/* Your trip planner / filters remain inside the map component you already have */}
          <div className="text-xs text-zinc-500">
            Token detected: {MAPBOX_TOKEN ? 'yes' : 'no'}
            <br />
            Data path: {dataUrl}
          </div>
        </aside>

        {/* Map area */}
        <main className="main-map">
          <div className="map-wrap">
            <div className="map-box">
              <CertisMap
                basePath={BASE_PATH}
                token={MAPBOX_TOKEN}
                basemap={basemap}
                markerStyle={markerStyle}
                // CertisMap fetches the FeatureCollection from dataUrl internally, or
                // if yours expects inline data, you can modify CertisMap accordingly.
                data={{ type: 'FeatureCollection', features: [] } as any}
                bbox={[-125, 24, -66, 50]}
                home={(home || undefined) as any}
                stops={stops as any}
                routeGeoJSON={undefined}
                onMapDblClick={handleMapDblClick as any}
                onPointClick={handlePointClick as any}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
