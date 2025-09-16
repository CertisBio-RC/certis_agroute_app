'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import CertisMap, { CategoryKey, CATEGORY_COLORS, SupplierSummary } from '@/components/CertisMap';
import { withBasePath } from '@/utils/paths';

type StyleMode = 'hybrid' | 'street';

const CATEGORY_ORDER: CategoryKey[] = [
  'Agronomy',
  'Agronomy/Grain',
  'Distribution',
  'Grain',
  'Grain/Feed',
  'Kingpin',
  'Office/Service',
];

export default function Page() {
  // map style
  const [styleMode, setStyleMode] = useState<StyleMode>('hybrid');

  // category filters
  const [selectedCats, setSelectedCats] = useState<Record<CategoryKey, boolean>>({
    'Agronomy': true,
    'Agronomy/Grain': true,
    'Distribution': true,
    'Grain': true,
    'Grain/Feed': true,
    'Kingpin': true,
    'Office/Service': true,
  });

  // summary from map once data loads
  const [summary, setSummary] = useState<SupplierSummary>({
    total: 0,
    byCategory: {
      'Agronomy': 0,
      'Agronomy/Grain': 0,
      'Distribution': 0,
      'Grain': 0,
      'Grain/Feed': 0,
      'Kingpin': 0,
      'Office/Service': 0,
    },
  });

  const toggleCat = useCallback((c: CategoryKey, value?: boolean) => {
    setSelectedCats((prev) => ({ ...prev, [c]: value ?? !prev[c] }));
  }, []);

  const allOn = useMemo(() => CATEGORY_ORDER.every((c) => selectedCats[c]), [selectedCats]);
  const anyOn = useMemo(() => CATEGORY_ORDER.some((c) => selectedCats[c]), [selectedCats]);

  const setAll = useCallback((v: boolean) => {
    const next = { ...selectedCats };
    CATEGORY_ORDER.forEach((c) => (next[c] = v));
    setSelectedCats(next);
  }, [selectedCats]);

  const onAddStop = useCallback((_stop: { name?: string; coord: [number, number] }) => {
    // Hook left intentionally simple (no UI change). Keeps layout stable.
    // You can wire this into your "Trip Builder" panel later.
    // console.log('Add stop:', _stop);
  }, []);

  return (
    <div className="page-shell">
      {/* Left column (sticky) */}
      <aside className="sidebar-col">
        {/* Header card */}
        <div className="card">
          <div className="card-title flex items-center justify-between">
            <img src={withBasePath('/certis-logo.png')} alt="CERTIS" style={{ height: 22 }} />
            <span className="text-sm opacity-70">Route Builder • Layout baseline</span>
          </div>
        </div>

        {/* Map style */}
        <div className="card">
          <div className="card-title">Map style</div>
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="style"
                checked={styleMode === 'hybrid'}
                onChange={() => setStyleMode('hybrid')}
              />
              <span>Hybrid (default)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="style"
                checked={styleMode === 'street'}
                onChange={() => setStyleMode('street')}
              />
              <span>Street</span>
            </label>
          </div>
        </div>

        {/* Suppliers (summary loaded from map) */}
        <div className="card">
          <div className="card-title">Suppliers ({summary.total})</div>
          <div className="space-y-2 text-sm">
            {CATEGORY_ORDER.map((c) => (
              <div key={c} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span
                    title={c}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 6,
                      display: 'inline-block',
                      backgroundColor: CATEGORY_COLORS[c],
                      boxShadow: '0 0 0 1px rgba(0,0,0,.35) inset',
                    }}
                  />
                  {c}
                </span>
                <span className="opacity-70">{summary.byCategory[c] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Location Types (filters) */}
        <div className="card">
          <div className="card-title flex items-center justify-between">
            <span>Location Types</span>
            <div className="flex items-center gap-2">
              <button
                className="btn btn-sm"
                onClick={() => setAll(true)}
                disabled={allOn}
                title="Select all"
              >
                All
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setAll(false)}
                disabled={!anyOn}
                title="Deselect all"
              >
                None
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {CATEGORY_ORDER.map((c) => (
              <label key={c} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedCats[c]}
                  onChange={(e) => toggleCat(c, e.target.checked)}
                />
                <span
                  title={c}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 6,
                    display: 'inline-block',
                    backgroundColor: CATEGORY_COLORS[c],
                    boxShadow: '0 0 0 1px rgba(0,0,0,.35) inset',
                  }}
                />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Placeholder for Trip options (layout only) */}
        <div className="card">
          <div className="card-title">Trip</div>
          <div className="text-sm opacity-80">Round-trip • Click points on the map to add stops.</div>
          <div className="flex gap-2 mt-3">
            <button className="btn btn-sm">Clear</button>
            <button className="btn btn-sm">Open Google</button>
            <button className="btn btn-sm">Open Apple</button>
            <button className="btn btn-sm">Open Waze</button>
          </div>
        </div>
      </aside>

      {/* Right column (map) */}
      <main className="map-col">
        <section className="card p-0 overflow-hidden">
          <CertisMap
            styleMode={styleMode}
            selectedCategories={selectedCats}
            onAddStop={onAddStop}
            onDataLoaded={setSummary}
          />
        </section>
      </main>
    </div>
  );
}
