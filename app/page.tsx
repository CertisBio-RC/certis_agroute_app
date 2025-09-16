'use client';

import React, { useMemo, useState } from 'react';
import CertisMap, {
  CATEGORY_COLORS,
  CATEGORY_COLOR,
  type StyleMode,
} from '@/components/CertisMap';

const ALL_CATEGORIES = Object.keys(CATEGORY_COLORS).filter((k) => k !== 'Kingpin');

export default function Page() {
  const [styleMode, setStyleMode] = useState<StyleMode>('hybrid');

  // start with all categories ON
  const [cats, setCats] = useState<Record<string, boolean>>(
    ALL_CATEGORIES.reduce((m, c) => {
      m[c] = true;
      return m;
    }, {} as Record<string, boolean>)
  );

  const selectedCount = useMemo(
    () => Object.values(cats).filter(Boolean).length,
    [cats]
  );

  return (
    <main className="pane-grid">
      {/* LEFT: sticky controls */}
      <aside className="left-col">
        <div className="card">
          <div className="card-header">
            <img
              src="/certis-logo.png"
              alt="Certis"
              style={{ height: 36, objectFit: 'contain' }}
            />
          </div>

          {/* Map style */}
          <div className="card-section">
            <div className="section-title">Map Style</div>
            <div className="row">
              <label className="row-inline">
                <input
                  type="radio"
                  name="styleMode"
                  checked={styleMode === 'hybrid'}
                  onChange={() => setStyleMode('hybrid')}
                />
                <span>Hybrid (default)</span>
              </label>
              <label className="row-inline" style={{ marginLeft: 16 }}>
                <input
                  type="radio"
                  name="styleMode"
                  checked={styleMode === 'street'}
                  onChange={() => setStyleMode('street')}
                />
                <span>Street</span>
              </label>
            </div>
          </div>

          {/* Category filters */}
          <div className="card-section">
            <div className="section-title">Categories</div>
            <div className="hint">
              Showing {selectedCount} of {ALL_CATEGORIES.length}
            </div>
            <div className="checklist">
              {ALL_CATEGORIES.map((c) => (
                <label key={c} className="check-item">
                  <input
                    type="checkbox"
                    checked={!!cats[c]}
                    onChange={(e) =>
                      setCats((prev) => ({ ...prev, [c]: e.target.checked }))
                    }
                  />
                  <span className="dot" style={{ background: CATEGORY_COLOR(c) }} />
                  <span className="check-label">{c}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* RIGHT: map frame */}
      <section className="right-col">
        <div className="map-frame">
          <CertisMap styleMode={styleMode} categories={cats} />
        </div>
      </section>
    </main>
  );
}
