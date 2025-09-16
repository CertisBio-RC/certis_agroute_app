'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl, { Map as MapboxMap } from 'mapbox-gl';
import { withBasePath } from '@/utils/paths';

/**
 * Two-column layout baseline with a working Mapbox map.
 * - Left column: fixed sidebar (header + basic controls)
 * - Right column: full-height map panel
 * - No in-map Certis logo; only sidebar header logo.
 * - Token is fetched at runtime from /data/token.txt (Option A).
 */

type StyleMode = 'hybrid' | 'street';

const STYLE_URLS: Record<StyleMode, string> = {
  hybrid:
    'mapbox://styles/mapbox/satellite-streets-v12',
  street:
    'mapbox://styles/mapbox/streets-v12',
};

async function getMapboxToken(): Promise<string | null> {
  // 1) env during static render (if set in GH action) – harmless fallback
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  }

  // 2) runtime file (Option A): /data/token.txt
  try {
    const res = await fetch(withBasePath('/data/token.txt'), { cache: 'no-store' });
    if (res.ok) {
      const txt = (await res.text()).trim();
      if (txt) return txt;
    }
  } catch {
    // ignore and fall through
  }

  return null;
}

export default function Page() {
  const mapRef = useRef<MapboxMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [styleMode, setStyleMode] = useState<StyleMode>('hybrid');
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  // Create / update map
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBooting(true);
      setBootError(null);

      const token = await getMapboxToken();
      if (!token) {
        setBootError('Missing Mapbox token. Provide /public/data/token.txt or NEXT_PUBLIC_MAPBOX_TOKEN.');
        setBooting(false);
        return;
      }

      // Apply token
      (mapboxgl as any).accessToken = token;

      // If map exists and only style changes, swap style cleanly
      if (mapRef.current && containerRef.current) {
        const m = mapRef.current;
        const nextStyle = STYLE_URLS[styleMode];
        // Guard against style.load races
        try {
          m.setStyle(nextStyle);
          m.once('style.load', () => {
            try {
              m.setProjection({ name: 'mercator' as any }); // lock mercator
            } catch {}
          });
        } catch (e) {
          // If setStyle failed (edge case), fall back to full rebuild
          try { m.remove(); } catch {}
          mapRef.current = null;
        }
      }

      // If no map, build it fresh
      if (!mapRef.current && containerRef.current) {
        try {
          const m = new mapboxgl.Map({
            container: containerRef.current,
            style: STYLE_URLS[styleMode],
            center: [-95.5, 39.8], // CONUS-ish
            zoom: 3.3,
            attributionControl: true,
            preserveDrawingBuffer: false,
            dragRotate: false,
            pitchWithRotate: false,
            cooperativeGestures: true,
          });
          mapRef.current = m;

          m.once('style.load', () => {
            try {
              m.setProjection({ name: 'mercator' as any });
            } catch {}
          });

          m.addControl(new mapboxgl.NavigationControl({ showZoom: true, showCompass: false }), 'bottom-right');
        } catch (e: any) {
          if (!cancelled) {
            setBootError(e?.message || 'Failed to initialize map.');
          }
        }
      }

      if (!cancelled) setBooting(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [styleMode]);

  return (
    <main className="page-shell">
      {/* LEFT: sticky sidebar */}
      <aside className="sidebar">
        <header className="brand">
          <img src={withBasePath('/certis-logo.png')} alt="CERTIS" />
          <div className="brand-meta">Route Builder • Layout baseline</div>
        </header>

        <section className="panel">
          <h2>Map style</h2>
          <div className="radio-row">
            <label className="radio">
              <input
                type="radio"
                name="mapstyle"
                checked={styleMode === 'hybrid'}
                onChange={() => setStyleMode('hybrid')}
              />
              <span>Hybrid (default)</span>
            </label>
            <label className="radio">
              <input
                type="radio"
                name="mapstyle"
                checked={styleMode === 'street'}
                onChange={() => setStyleMode('street')}
              />
              <span>Street</span>
            </label>
          </div>
        </section>

        <section className="panel">
          <h2>Controls (placeholder)</h2>
          <ul className="bullets">
            <li>Filters</li>
            <li>Trip options</li>
          </ul>
        </section>
      </aside>

      {/* RIGHT: full-height map panel */}
      <section className="content">
        <div className="content-inner">
          <div className="map-card">
            <div className="map-frame">
              <div ref={containerRef} className="map-canvas" />
              {booting && (
                <div className="map-overlay">Loading map…</div>
              )}
              {bootError && (
                <div className="map-overlay error">
                  {bootError}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
