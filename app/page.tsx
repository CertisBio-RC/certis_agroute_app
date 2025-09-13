"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type {
  Geometry,
  Feature as GFeature,
  FeatureCollection as GFC,
  BBox,
} from "geojson";

type Feature = GFeature<Geometry, any>;
type FC = GFC<Geometry, any>;

const CertisMap = dynamic(() => import("@/components/CertisMap"), {
  ssr: false,
});

const BASE_PATH =
  (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "") || "";

type Basemap = "Hybrid" | "Satellite" | "Streets";
type MarkerStyle = "Colored dots" | "Retailer logos";

type Stop = { coord: [number, number]; title?: string };

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function featHasCoords(f: Feature) {
  return !!(
    f.geometry &&
    f.geometry.type === "Point" &&
    Array.isArray((f.geometry as any).coordinates) &&
    (f.geometry as any).coordinates.length >= 2
  );
}

function computeBBox(fc: FC | null): BBox | null {
  if (!fc) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const f of fc.features) {
    if (featHasCoords(f)) {
      const [x, y] = (f.geometry as any).coordinates as [number, number];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return isFinite(minX)
    ? [minX, minY, maxX, maxY]
    : null;
}

export default function Page() {
  const [raw, setRaw] = useState<FC | null>(null);

  // Filters
  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);

  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [retailerFilter, setRetailerFilter] = useState<string[]>([]);
  const [catFilter, setCatFilter] = useState<string[]>([]);

  // Map options
  const [basemap, setBasemap] = useState<Basemap>("Hybrid");
  const [markerStyle, setMarkerStyle] =
    useState<MarkerStyle>("Colored dots");
  const [projection, setProjection] =
    useState<"mercator" | "globe">("mercator");

  // Trip
  const [home, setHome] = useState<[number, number] | null>(null);
  const [homeInput, setHomeInput] = useState("");
  const [stops, setStops] = useState<Stop[]>([]);

  // Load data
  useEffect(() => {
    const url = `${BASE_PATH}/data/retailers.geojson`;
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((fc: FC) => {
        // drop invalid rows
        const clean: FC = {
          type: "FeatureCollection",
          features: fc.features.filter((f) => featHasCoords(f)),
        };
        setRaw(clean);

        const s = uniq(
          clean.features.map((f) => (f.properties?.State || "").toString())
        ).filter(Boolean);
        const r = uniq(
          clean.features.map((f) => (f.properties?.Retailer || "").toString())
        ).filter(Boolean);
        const c = uniq(
          clean.features.map((f) => (f.properties?.Category || "").toString())
        ).filter(Boolean);

        setStates(s.sort());
        setRetailers(r.sort());
        setCats(c.sort());
        setStateFilter(s); // default show all
        setRetailerFilter(r);
        setCatFilter(c);
      })
      .catch((err) => console.error("load retailers.geojson failed:", err));
  }, []);

  const filtered: FC = useMemo(() => {
    if (!raw) return { type: "FeatureCollection", features: [] };
    const okS = new Set(stateFilter);
    const okR = new Set(retailerFilter);
    const okC = new Set(catFilter);
    const feats = raw.features.filter((f) => {
      const p: any = f.properties || {};
      return okS.has(String(p.State || "")) &&
        okR.has(String(p.Retailer || "")) &&
        okC.has(String(p.Category || ""));
    });
    return { type: "FeatureCollection", features: feats };
  }, [raw, stateFilter, retailerFilter, catFilter]);

  const fcBbox = useMemo(() => computeBBox(filtered), [filtered]);

  // Reset Map button (clears filters + trip)
  function resetAll() {
    if (states.length) setStateFilter(states);
    if (retailers.length) setRetailerFilter(retailers);
    if (cats.length) setCatFilter(cats);
    setHome(null);
    setHomeInput("");
    setStops([]);
  }

  function toggleValue(list: string[], val: string, set: (v: string[]) => void) {
    set(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
  }

  return (
    <main className="w-screen h-screen overflow-hidden bg-[#0b1220] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <img
            src={`${BASE_PATH}/certis-logo.png`}
            alt="Certis"
            className="h-10 w-auto"
          />
          <h1 className="text-2xl font-semibold">Certis AgRoute Planner</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              setProjection((p) => (p === "globe" ? "mercator" : "globe"))
            }
            className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20"
            title="Toggle projection"
          >
            {projection === "globe" ? "Globe" : "Flat"}
          </button>
          <button
            onClick={resetAll}
            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700"
            title="Reset filters and trip"
          >
            Reset Map
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-[380px_minmax(0,1fr)] h-[calc(100vh-64px)]">
        {/* Left panel */}
        <div className="overflow-y-auto p-4 space-y-6">
          {/* States */}
          <section className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">States</div>
              <div className="text-sm opacity-70">
                {stateFilter.length} of {states.length}
              </div>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20"
                onClick={() => setStateFilter(states)}
              >
                All
              </button>
              <button
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20"
                onClick={() => setStateFilter([])}
              >
                None
              </button>
            </div>
            <div className="space-y-2">
              {states.map((s) => (
                <label key={s} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={stateFilter.includes(s)}
                    onChange={() =>
                      toggleValue(stateFilter, s, setStateFilter)
                    }
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Retailers */}
          <section className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Retailers</div>
              <div className="text-sm opacity-70">
                {retailerFilter.length} of {retailers.length}
              </div>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20"
                onClick={() => setRetailerFilter(retailers)}
              >
                All
              </button>
              <button
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20"
                onClick={() => setRetailerFilter([])}
              >
                None
              </button>
            </div>
            <div className="max-h-56 overflow-auto space-y-2 pr-1">
              {retailers.map((r) => (
                <label key={r} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={retailerFilter.includes(r)}
                    onChange={() =>
                      toggleValue(retailerFilter, r, setRetailerFilter)
                    }
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Categories */}
          <section className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Location Types</div>
              <div className="text-sm opacity-70">
                {catFilter.length} of {cats.length}
              </div>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20"
                onClick={() => setCatFilter(cats)}
              >
                All
              </button>
              <button
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20"
                onClick={() => setCatFilter([])}
              >
                None
              </button>
            </div>
            <div className="space-y-2">
              {cats.map((c) => (
                <label key={c} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={catFilter.includes(c)}
                    onChange={() => toggleValue(catFilter, c, setCatFilter)}
                  />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Map options */}
          <section className="bg-white/5 rounded-xl p-4">
            <div className="text-lg font-semibold mb-3">Map Options</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label>Basemap</label>
                <select
                  className="bg-white/10 rounded px-2 py-1"
                  value={basemap}
                  onChange={(e) => setBasemap(e.target.value as Basemap)}
                >
                  <option>Hybrid</option>
                  <option>Satellite</option>
                  <option>Streets</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label>Markers</label>
                <select
                  className="bg-white/10 rounded px-2 py-1"
                  value={markerStyle}
                  onChange={(e) =>
                    setMarkerStyle(e.target.value as MarkerStyle)
                  }
                >
                  <option>Colored dots</option>
                  <option>Retailer logos</option>
                </select>
              </div>
            </div>
          </section>

          {/* Trip Planner (hooks up to map click via onAddStop) */}
          <section className="bg-white/5 rounded-xl p-4">
            <div className="text-lg font-semibold mb-3">Trip Planner</div>
            <div className="flex items-center gap-2 mb-2">
              <input
                className="flex-1 bg-white/10 rounded px-3 py-2"
                placeholder="ZIP or address (e.g., 50638)"
                value={homeInput}
                onChange={(e) => setHomeInput(e.target.value)}
              />
              <button
                className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  // let the user type a "lng,lat" pair OR a ZIP/address
                  const t = homeInput.trim();
                  const m = t.match(
                    /^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/
                  );
                  if (m) {
                    setHome([parseFloat(m[1]), parseFloat(m[3])]);
                    return;
                  }
                  // Else leave to double-click on map in CertisMap (not implemented here)
                  alert(
                    "For now, enter coordinates as 'lng,lat' or double-click map to set Home."
                  );
                }}
              >
                Set
              </button>
            </div>

            <div className="text-sm opacity-70 mb-2">
              Stops (click map points to add):
            </div>
            <div className="space-y-2 max-h-48 overflow-auto pr-1">
              {stops.map((s, i) => (
                <div
                  key={`${s.coord.join(",")}-${i}`}
                  className="flex items-center justify-between bg-white/10 rounded px-3 py-2"
                >
                  <div>
                    <div className="font-semibold">{s.title || `Stop ${i + 1}`}</div>
                    <div className="opacity-70 text-xs">
                      {s.coord[0].toFixed(5)}, {s.coord[1].toFixed(5)}
                    </div>
                  </div>
                  <button
                    className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-sm"
                    onClick={() =>
                      setStops(stops.filter((_, idx) => idx !== i))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                className="px-3 py-2 rounded bg-indigo-600/80 hover:bg-indigo-600"
                onClick={() => {
                  if (!home || stops.length < 1) {
                    alert("Set Home and add at least one stop.");
                    return;
                  }
                  alert(
                    "Route optimization links are created on the results pane in your working branch. (Kept hooks; server call omitted here.)"
                  );
                }}
              >
                Optimize Trip
              </button>
              <button
                className="px-3 py-2 rounded bg-white/10 hover:bg-white/20"
                onClick={() => setStops([])}
              >
                Clear Trip
              </button>
            </div>
          </section>
        </div>

        {/* Map */}
        <div className="relative">
          <CertisMap
            basemap={basemap}
            markerStyle={markerStyle}
            projection={projection}
            data={filtered}
            bbox={fcBbox as any}
            home={home}
            stops={stops}
            onAddStop={(f) => {
              const p: any = f.properties || {};
              const coord = ((f.geometry as any)
                .coordinates || []) as [number, number];
              if (coord?.length >= 2) {
                setStops((cur) => [
                  ...cur,
                  {
                    coord: [coord[0], coord[1]],
                    title:
                      p.Name ||
                      `${p.Retailer || ""}`.trim() ||
                      "Stop",
                  },
                ]);
              }
            }}
          />
        </div>
      </div>
    </main>
  );
}
