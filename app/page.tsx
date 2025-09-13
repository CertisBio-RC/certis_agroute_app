'use client';

import { useState } from 'react';
import CertisMap from '@/components/CertisMap';

const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH ||
  (process.env.NEXT_PUBLIC_GITHUB_PAGES === 'true' ? '/certis_agroute_app' : '');

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  '';

type Basemap = 'hybrid' | 'streets';
type MarkerStyle = 'dots' | 'logos';

export default function Page() {
  const [basemap, setBasemap] = useState<Basemap>('hybrid');
  const [markerStyle, setMarkerStyle] = useState<MarkerStyle>('dots');

  return (
    <>
      {/* Header */}
      <header className="site-header">
        <div className="brand">
          <img
            src={`${BASE_PATH}/certis-logo.png`}
            alt="Certis Biologicals"
            className="brand-logo"
          />
        </div>
        <nav className="header-nav">
          <a className="btn ghost" href={`${BASE_PATH}/`}>
            Reset Map
          </a>
        </nav>
      </header>

      {/* Main grid */}
      <main className="app-grid">
        {/* Sidebar */}
        <aside className="aside">
          <section className="panel">
            <div className="panel-title">Map Options</div>

            <label className="field">
              <div className="label">Basemap</div>
              <select
                className="select"
                value={basemap}
                onChange={(e) => setBasemap(e.target.value as Basemap)}
              >
                <option value="hybrid">Hybrid</option>
                <option value="streets">Streets</option>
              </select>
            </label>

            <label className="field">
              <div className="label">Markers</div>
              <select
                className="select"
                value={markerStyle}
                onChange={(e) => setMarkerStyle(e.target.value as MarkerStyle)}
              >
                <option value="dots">Colored dots</option>
                <option value="logos">Retailer logos</option>
              </select>
            </label>

            <div className="hint">
              Double-click the map to set <b>Home</b>. Click a point to add a stop.
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">Filters</div>
            <div className="hint">
              Your existing States/Retailers/Types controls can live here; the layout does not
              change their logic. (We kept the data plumbing as-is.)
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">Trip Planner</div>
            <div className="hint">Use the controls on the map to add/remove stops.</div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                // fire a custom event your current Map listens to (optional hook)
                window.dispatchEvent(new CustomEvent('certis:clear-trip'));
              }}
            >
              Clear Trip
            </button>
          </section>
        </aside>

        {/* Map */}
        <section className="map-shell">
          <div className="map-card">
            <CertisMap
              basePath={BASE_PATH}
              token={MAPBOX_TOKEN}
              basemap={basemap}
              markerStyle={markerStyle}
              // The component fetches /data/retailers.geojson internally (unchanged).
            />
          </div>
        </section>
      </main>
    </>
  );
}
