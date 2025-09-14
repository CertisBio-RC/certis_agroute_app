// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

type GJPoint = GeoJSON.Point;
type GJFeature = GeoJSON.Feature<GJPoint, any>;
type GJFC = GeoJSON.FeatureCollection<GJPoint, any>;

// Lazy-load the map (client-only)
const CertisMap = dynamic(() => import("@/components/CertisMap"), { ssr: false });

const USA_BBOX: [number, number, number, number] = [-125, 24, -66.9, 49.5];

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN || "";

function getProp(p: any, name: string) {
  if (!p) return undefined;
  if (p[name] != null) return p[name];
  const k = Object.keys(p).find((k) => k.toLowerCase() === name.toLowerCase());
  return k ? p[k] : undefined;
}

function isKingpin(p: any) {
  const v =
    getProp(p, "kingpin") ??
    getProp(p, "Kingpin") ??
    getProp(p, "isKingpin") ??
    getProp(p, "LocationType") ??
    getProp(p, "Type") ??
    getProp(p, "Category");
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return /king\s*pin/i.test(v) || /kingpin/i.test(v);
  return false;
}

function toBBox(fc: GJFC | null): [number, number, number, number] {
  if (!fc || !fc.features.length) return [...USA_BBOX] as [number, number, number, number];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const f of fc.features) {
    const pt = f.geometry?.coordinates;
    if (!Array.isArray(pt)) continue;
    const [x, y] = pt as [number, number];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!isFinite(minX)) return [...USA_BBOX] as [number, number, number, number];
  // pad a bit
  const padX = Math.max(0.2, (maxX - minX) * 0.08);
  const padY = Math.max(0.2, (maxY - minY) * 0.08);
  return [minX - padX, minY - padY, maxX + padX, maxY + padY];
}

export default function Page() {
  const [basemap, setBasemap] = useState<"Hybrid" | "Streets">("Hybrid");

  // Raw data
  const [fc, setFc] = useState<GJFC | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters (sets of selected keys)
  const [stateSet, setStateSet] = useState<Set<string>>(new Set());
  const [retailerSet, setRetailerSet] = useState<Set<string>>(new Set());
  const [typeSet, setTypeSet] = useState<Set<string>>(new Set());

  // Load GeoJSON
  useEffect(() => {
    let aborted = false;

    const load = async () => {
      setLoading(true);
      try {
        const base =
          process.env.NEXT_PUBLIC_BASE_PATH ||
          process.env.NEXT_PUBLIC_ASSET_PREFIX ||
          "";
        // Adjust path if your data is elsewhere
        const url = `${base}/data/retailers.geojson`;
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json()) as GJFC;
        if (aborted) return;

        setFc(json);

        // initialize filter sets to "all selected"
        const ss = new Set<string>();
        const rs = new Set<string>();
        const ts = new Set<string>();

        json.features.forEach((f) => {
          const p = f.properties || {};
          const st = getProp(p, "State");
          if (st) ss.add(String(st));
          const r = getProp(p, "Retailer") ?? getProp(p, "Company");
          if (r) rs.add(String(r));
          const t =
            getProp(p, "LocationType") ??
            getProp(p, "Category") ??
            getProp(p, "Type");
          if (t) ts.add(String(t));
        });
        setStateSet(ss);
        setRetailerSet(rs);
        setTypeSet(ts);
      } catch (e) {
        console.error("Failed to load GeoJSON", e);
      } finally {
        if (!aborted) setLoading(false);
      }
    };

    load();
    return () => {
      aborted = true;
    };
  }, []);

  const allStates = useMemo(() => {
    if (!fc) return [];
    const s = new Set<string>();
    fc.features.forEach((f) => {
      const st = getProp(f.properties, "State");
      if (st) s.add(String(st));
    });
    return Array.from(s).sort();
  }, [fc]);

  const allRetailers = useMemo(() => {
    if (!fc) return [];
    const s = new Set<string>();
    fc.features.forEach((f) => {
      const r = getProp(f.properties, "Retailer") ?? getProp(f.properties, "Company");
      if (r) s.add(String(r));
    });
    return Array.from(s).sort();
  }, [fc]);

  const allTypes = useMemo(() => {
    if (!fc) return [];
    const s = new Set<string>();
    fc.features.forEach((f) => {
      const t =
        getProp(f.properties, "LocationType") ??
        getProp(f.properties, "Category") ??
        getProp(f.properties, "Type");
      if (t) s.add(String(t));
    });
    return Array.from(s).sort();
  }, [fc]);

  // Apply filters
  const filtered = useMemo<GJFC | null>(() => {
    if (!fc) return null;
    const feats = fc.features.filter((f) => {
      const p = f.properties || {};
      const st = String(getProp(p, "State") ?? "");
      const r = String(
        getProp(p, "Retailer") ?? getProp(p, "Company") ?? ""
      );
      const t = String(
        getProp(p, "LocationType") ?? getProp(p, "Category") ?? getProp(p, "Type") ?? ""
      );
      const okState = stateSet.size ? stateSet.has(st) : true;
      const okRetailer = retailerSet.size ? retailerSet.has(r) : true;
      const okType = typeSet.size ? typeSet.has(t) : true;
      return okState && okRetailer && okType;
    });
    return { type: "FeatureCollection", features: feats } as GJFC;
  }, [fc, stateSet, retailerSet, typeSet]);

  const filteredBBox = useMemo<[number, number, number, number]>(() => {
    return toBBox(filtered);
  }, [filtered]);

  // Reset all filters
  const resetFilters = () => {
    if (!fc) return;
    const ss = new Set<string>(allStates);
    const rs = new Set<string>(allRetailers);
    const ts = new Set<string>(allTypes);
    setStateSet(ss);
    setRetailerSet(rs);
    setTypeSet(ts);
  };

  const clearFilters = () => {
    setStateSet(new Set());
    setRetailerSet(new Set());
    setTypeSet(new Set());
  };

  // Reset map (reload to base)
  const resetMap = () => {
    // Simple: reload page; or you can clear hash and local states if needed
    window.location.href = (process.env.NEXT_PUBLIC_BASE_PATH || "") + "/";
  };

  return (
    <main>
      {/* Sticky controls bar */}
      <div className="controls-bar">
        <div className="controls-left">
          <div className="field">
            <div className="label">Basemap</div>
            <select
              className="select"
              value={basemap}
              onChange={(e) => setBasemap(e.target.value as "Hybrid" | "Streets")}
            >
              <option>Hybrid</option>
              <option>Streets</option>
            </select>
          </div>
        </div>
        <div className="controls-right">
          <button className="btn ghost" onClick={resetFilters}>
            Reset Filters
          </button>
          <button className="btn ghost" onClick={resetMap}>
            Reset Map
          </button>
        </div>
      </div>

      <div className="app-grid">
        {/* Sidebar */}
        <aside className="aside">
          {/* Filters */}
          <section className="panel">
            <div className="panel-title">Filters</div>

            {/* States */}
            <div className="field">
              <div className="label">States ({allStates.length})</div>
              <div className="chip-row">
                <button className="chip" onClick={() => setStateSet(new Set(allStates))}>
                  All
                </button>
                <button className="chip" onClick={() => setStateSet(new Set())}>
                  None
                </button>
              </div>
              <div className="checklist">
                {allStates.map((st) => {
                  const checked = stateSet.has(st);
                  return (
                    <label key={st} className="checklist-item">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(stateSet);
                          if (e.target.checked) next.add(st);
                          else next.delete(st);
                          setStateSet(next);
                        }}
                      />
                      <span>{st}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Retailers */}
            <div className="field">
              <div className="label">Retailers ({allRetailers.length})</div>
              <div className="chip-row">
                <button className="chip" onClick={() => setRetailerSet(new Set(allRetailers))}>
                  All
                </button>
                <button className="chip" onClick={() => setRetailerSet(new Set())}>
                  None
                </button>
              </div>
              <div className="checklist">
                {allRetailers.map((r) => {
                  const checked = retailerSet.has(r);
                  return (
                    <label key={r} className="checklist-item">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(retailerSet);
                          if (e.target.checked) next.add(r);
                          else next.delete(r);
                          setRetailerSet(next);
                        }}
                      />
                      <span>{r}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Location Types */}
            <div className="field">
              <div className="label">Location Types ({allTypes.length})</div>
              <div className="chip-row">
                <button className="chip" onClick={() => setTypeSet(new Set(allTypes))}>
                  All
                </button>
                <button className="chip" onClick={() => setTypeSet(new Set())}>
                  None
                </button>
              </div>
              <div className="checklist">
                {allTypes.map((t) => {
                  const checked = typeSet.has(t);
                  return (
                    <label key={t} className="checklist-item">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(typeSet);
                          if (e.target.checked) next.add(t);
                          else next.delete(t);
                          setTypeSet(next);
                        }}
                      />
                      <span>{t}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </section>
        </aside>

        {/* Map */}
        <div className="map-shell">
          {!loading && filtered && (
            <CertisMap
              token={MAPBOX_TOKEN}
              basemap={basemap}
              data={filtered}
              bbox={filteredBBox}
            />
          )}
        </div>
      </div>
    </main>
  );
}
