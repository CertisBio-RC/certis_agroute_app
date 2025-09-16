'use client';

import React, { useMemo, useState } from 'react';
import { withBasePath } from '@/utils/paths';

type StyleMode = 'hybrid' | 'street';

const ALL_CATEGORIES = [
  'Agronomy',
  'Agronomy/Grain',
  'Distribution',
  'Grain',
  'Grain/Feed',
  'Kingpin',
  'Office/Service',
] as const;

export default function Page() {
  const [styleMode, setStyleMode] = useState<StyleMode>('hybrid');

  const [cats, setCats] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const c of ALL_CATEGORIES) init[c] = true;
    return init;
  });

  const allOn = useMemo(() => Object.values(cats).every(Boolean), [cats]);
  const anyOn = useMemo(() => Object.values(cats).some(Boolean), [cats]);

  const toggle = (c: string, v?: boolean) =>
    setCats((prev) => ({ ...prev, [c]: v ?? !prev[c] }));

  const setAll = (v: boolean) =>
    setCats((prev) => {
      const next: Record<string, boolean> = {};
      for (const k of Object.keys(prev)) next[k] = v;
      return next;
    });

  return (
    <main className="page-shell">
      {/* Left sticky column */}
      <aside className="left-col">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img
              src={withBasePath('/certis-logo.png')}
              alt="CERTIS"
              style={{ height: 20, opacity: 0.95 }}
            />
          </div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>Route Builder • Layout baseline</div>
        </div>

        <div className="card">
          <div className="card-title">Map style</div>
          <label className="radio">
            <input
              type="radio"
              checked={styleMode === 'hybrid'}
              onChange={() => setStyleMode('hybrid')}
            />
            <span>Hybrid (default)</span>
          </label>
          <label className="radio">
            <input
              type="radio"
              checked={styleMode === 'street'}
              onChange={() => setStyleMode('street')}
            />
            <span>Street</span>
          </label>
        </div>

        <div className="card">
          <div className="card-title">Location Types</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button className="btn sm" onClick={() => setAll(true)} disabled={allOn}>
              All
            </button>
            <button className="btn sm" onClick={() => setAll(false)} disabled={!anyOn}>
              None
            </button>
          </div>

          <div className="cat-grid">
            {ALL_CATEGORIES.map((c) => (
              <label key={c} className="check">
                <input
                  type="checkbox"
                  checked={!!cats[c]}
                  onChange={(e) => toggle(c, e.currentTarget.checked)}
                />
                <span className="dot" style={{ background: CATEGORY_COLORS[c] ?? '#8b949e' }} />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Trip</div>
          <div className="text-muted">Round-trip • Click points on the map to add stops.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn sm">Clear</button>
            <button className="btn sm">Open Google</button>
            <button className="btn sm">Open Apple</button>
            <button className="btn sm">Open Waze</button>
          </div>
        </div>
      </aside>

      {/* Right map column */}
      <section className="right-col">
        <div className="map-frame">
          <CertisMap styleMode={styleMode} categories={cats} />
        </div>
      </section>

      {/* light styles only for this page (keeps your global CSS stable) */}
      <style jsx>{`
        .page-shell {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 18px;
          padding: 18px;
        }
        .left-col {
          position: sticky;
          top: 16px;
          height: fit-content;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .right-col {
          min-height: calc(100vh - 32px);
        }
        .map-frame {
          height: calc(100vh - 50px);
          border: 1px solid #1b2a41;
          border-radius: 14px;
          overflow: hidden;
          background: #0b1220;
        }
        .card {
          background: #0f1928;
          border: 1px solid #1b2a41;
          border-radius: 14px;
          padding: 14px;
        }
        .card-title {
          font-weight: 700;
          margin-bottom: 10px;
        }
        .radio,
        .check {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 6px 0;
        }
        .check .dot {
          width: 10px;
          height: 10px;
          border-radius: 9999px;
          border: 1px solid #0b1220;
          display: inline-block;
        }
        .btn {
          background: #0f1928;
          border: 1px solid #22324b;
          color: #cfe3ff;
          border-radius: 8px;
          padding: 8px 12px;
        }
        .btn.sm {
          padding: 6px 10px;
          font-size: 0.9rem;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .text-muted {
          opacity: 0.8;
        }
        .cat-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 4px;
        }
        @media (max-width: 1100px) {
          .page-shell {
            grid-template-columns: 1fr;
          }
          .left-col {
            position: static;
          }
          .map-frame {
            height: 70vh;
          }
        }
      `}</style>
    </main>
  );
}
// --- Shared category palette for UI + map ---
export const CATEGORY_COLORS: Record<string, string> = {
  'Agronomy': '#22c55e',        // green
  'Agronomy/Grain': '#a855f7',  // purple
  'Distribution': '#06b6d4',    // cyan/teal
  'Grain': '#eab308',           // amber
  'Grain/Feed': '#b45309',      // brown
  'Kingpin': '#ef4444',         // red (special)
  'Office/Service': '#3b82f6',  // blue
};
// Convenience single-lookup (kept for legacy callers)
export const CATEGORY_COLOR = (c: string) => CATEGORY_COLORS[c] ?? '#9ca3af';
