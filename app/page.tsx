'use client';

import React, { useMemo, useState } from 'react';
import CertisMap, { CATEGORY_COLOR, StopLike } from '@/components/CertisMap';

type StyleMode = 'hybrid' | 'street';
const ALL_CATEGORIES = Object.keys(CATEGORY_COLOR);

export default function Page() {
  const [styleMode, setStyleMode] = useState<StyleMode>('hybrid');
  const [roundTrip, setRoundTrip] = useState(true);
  const [selectedCats, setSelectedCats] = useState<Record<string, boolean>>(
    () => Object.fromEntries(ALL_CATEGORIES.map((c) => [c, true]))
  );
  const [stops, setStops] = useState<StopLike[]>([]);
  const [supplierCount, setSupplierCount] = useState(0);

  const activeCategories = useMemo(
    () => ALL_CATEGORIES.filter((c) => selectedCats[c]),
    [selectedCats]
  );

  function addStop(s: StopLike) {
    setStops((prev) => [...prev, s]);
  }
  function clearStops() {
    setStops([]);
  }

  return (
    <main className="px-4 md:px-6 py-4 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      {/* Left column (sticky cards) */}
      <aside className="space-y-4">
        <section className="rounded-2xl p-4 border border-[#1b2a41] bg-[#0b1623]">
          <div className="text-xs uppercase tracking-wide opacity-75 mb-1">Route Builder</div>
          <div className="text-[11px] opacity-60 mb-4">Retailers • Kingpins • Filters</div>

          <div className="rounded-xl p-3 border border-[#1b2a41] mb-3">
            <div className="font-medium mb-2">Map style</div>
            <div className="flex items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="style"
                  checked={styleMode === 'hybrid'}
                  onChange={() => setStyleMode('hybrid')}
                />
                <span>Hybrid (default)</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
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

          <div className="rounded-xl p-3 border border-[#1b2a41] mb-3">
            <div className="font-medium mb-2">Suppliers ({supplierCount})</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 text-sm">
              {ALL_CATEGORIES.map((c) => (
                <label key={c} className="inline-flex items-center gap-2 cursor-pointer">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: CATEGORY_COLOR[c] || '#999' }}
                    aria-hidden
                  />
                  <input
                    type="checkbox"
                    checked={!!selectedCats[c]}
                    onChange={(e) =>
                      setSelectedCats((m) => ({ ...m, [c]: e.currentTarget.checked }))
                    }
                  />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-3 border border-[#1b2a41]">
            <div className="font-medium mb-2">Trip</div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={roundTrip}
                onChange={(e) => setRoundTrip(e.currentTarget.checked)}
              />
              <span>Round-trip</span>
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="px-3 py-1.5 rounded-md text-sm border border-slate-600/60"
                onClick={clearStops}
              >
                Clear
              </button>
              {/* You can wire Open Google/Apple/Waze as needed later */}
            </div>
            {stops.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm opacity-90">
                {stops.map((s, i) => (
                  <li key={`${s.name}-${i}`}>
                    {i + 1}. {s.name} — {s.coord[1].toFixed(3)},{' '}
                    {s.coord[0].toFixed(3)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </aside>

      {/* Right column (map frame) */}
      <section className="rounded-2xl p-3 border border-[#1b2a41] bg-[#0b1623]">
        <CertisMap
          styleMode={styleMode}
          categories={activeCategories}
          onAddStop={addStop}
          onDataLoaded={(s) => setSupplierCount(s.count)}
        />
      </section>
    </main>
  );
}
