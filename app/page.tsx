"use client";

import React, { useCallback, useMemo, useState } from "react";
import CertisMap, { CATEGORY_COLOR } from "@/components/CertisMap";
import { withBasePath } from "@/utils/paths";

// very small Stop type for the sidebar
type Stop = { id: string; name?: string; lon: number; lat: number };

// Build Google/Apple/Waze links (simple; no turf/deps)
function toPair(c: [number, number]) {
  return `${c[1]},${c[0]}`; // lat,lng
}
function buildGoogle(origin: [number, number], coords: [number, number][], roundTrip: boolean) {
  const pts = coords.map(toPair);
  const start = toPair(origin);
  const dest = roundTrip ? start : pts.at(-1) ?? start;
  const w = pts.slice(0, roundTrip ? pts.length : Math.max(0, pts.length - 1));
  const wp = w.length ? `&waypoints=${encodeURIComponent(w.join("|"))}` : "";
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(start)}&destination=${encodeURIComponent(dest!)}${wp}`;
}
function buildApple(origin: [number, number], coords: [number, number][], roundTrip: boolean) {
  const pts = coords.map(toPair);
  const start = toPair(origin);
  const dest = roundTrip ? start : pts.at(-1) ?? start;
  const wp = pts.slice(0, roundTrip ? pts.length : Math.max(0, pts.length - 1)).map(encodeURIComponent);
  // Apple supports multiple via daddr with +to: segments
  return `https://maps.apple.com/?saddr=${encodeURIComponent(start)}&daddr=${encodeURIComponent(dest!)}${wp.length ? `+to:${wp.join("+to:")}` : ""}`;
}
function buildWaze(origin: [number, number], coords: [number, number][], roundTrip: boolean) {
  const pts = coords.map(([lng, lat]) => `ll=${lat},${lng}`);
  // Waze has limited waypoints; we’ll send origin + first dest (roundTrip ignored here)
  const first = pts[0] ?? "";
  return `https://www.waze.com/ul?${first}`;
}

export default function Page() {
  // UI state
  const [styleMode, setStyleMode] = useState<"hybrid" | "street">("hybrid");
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [supplierSummary, setSupplierSummary] = useState<{ total: number; bySupplier: Record<string, number> }>({ total: 0, bySupplier: {} });

  // trip
  const [stops, setStops] = useState<Stop[]>([]);
  const [roundTrip, setRoundTrip] = useState(true);
  const hasStops = stops.length > 0;

  const onAddStop = useCallback((s: { name?: string; coord: [number, number]; [k: string]: any }) => {
    const id = `${s.coord[0]},${s.coord[1]}`;
    setStops((prev) => prev.some(p => p.id === id) ? prev : [...prev, { id, name: s.name ?? (s.Retailer ?? "Stop"), lon: s.coord[0], lat: s.coord[1] }]);
  }, []);

  const clearStops = useCallback(() => setStops([]), []);

  const coords = useMemo<[number, number][]>(() => stops.map(s => [s.lon, s.lat]), [stops]);
  const origin = useMemo<[number, number] | null>(() => coords[0] ?? null, [coords]);

  const googleHref = useMemo(() => {
    if (!origin || coords.length === 0) return "";
    return buildGoogle(origin, coords, roundTrip);
  }, [origin, coords, roundTrip]);

  const appleHref = useMemo(() => {
    if (!origin || coords.length === 0) return "";
    return buildApple(origin, coords, roundTrip);
  }, [origin, coords, roundTrip]);

  const wazeHref = useMemo(() => {
    if (!origin || coords.length === 0) return "";
    return buildWaze(origin, coords, roundTrip);
  }, [origin, coords, roundTrip]);

  const allSuppliers = useMemo(() => {
    const list = Object.keys(supplierSummary.bySupplier || {});
    list.sort((a, b) => a.localeCompare(b));
    return list;
  }, [supplierSummary]);

  return (
    <main className="app-grid">
      {/* LEFT: sticky sidebar */}
      <aside className="sidebar">
        <header className="brand-row">
          <img
            src={withBasePath("/certis-logo.png")}
            alt="Certis"
            className="brand"
          />
          <div className="brand-text">
            <div className="brand-title">Route Builder</div>
            <div className="brand-sub">Retailers • Kingpins • Filters</div>
          </div>
        </header>

        {/* Map style */}
        <section className="card">
          <div className="card-title">Map style</div>
          <div className="row">
            <label className="radio">
              <input
                type="radio"
                name="style"
                value="hybrid"
                checked={styleMode === "hybrid"}
                onChange={() => setStyleMode("hybrid")}
              />
              <span>Hybrid (default)</span>
            </label>
            <label className="radio">
              <input
                type="radio"
                name="style"
                value="street"
                checked={styleMode === "street"}
                onChange={() => setStyleMode("street")}
              />
              <span>Street</span>
            </label>
          </div>
        </section>

        {/* Suppliers filter */}
        <section className="card">
          <div className="card-title">
            Suppliers <span className="muted">({allSuppliers.length})</span>
          </div>
          <div className="supplier-list">
            {allSuppliers.map((s) => {
              const checked = selectedSuppliers.includes(s);
              return (
                <label key={s} className="supplier-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setSelectedSuppliers((prev) =>
                        e.target.checked
                          ? [...prev, s]
                          : prev.filter((x) => x !== s)
                      );
                    }}
                  />
                  <span className="dot" style={{ background: CATEGORY_COLOR["Agronomy"] }} />
                  <span className="supplier-name">{s}</span>
                  <span className="count">
                    {supplierSummary.bySupplier?.[s] ?? 0}
                  </span>
                </label>
              );
            })}
            {!allSuppliers.length && (
              <div className="muted">Loading suppliers…</div>
            )}
          </div>
        </section>

        {/* Trip builder */}
        <section className="card">
          <div className="card-title">Trip</div>
          <div className="row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={roundTrip}
                onChange={(e) => setRoundTrip(e.target.checked)}
              />
              <span>Round-trip</span>
            </label>
          </div>

          <div className="stops">
            {stops.map((s) => (
              <div key={s.id} className="stop">
                <div className="stop-dot" />
                <div className="stop-text">
                  <div className="stop-name">{s.name ?? "Stop"}</div>
                  <div className="stop-ll">{s.lat.toFixed(4)}, {s.lon.toFixed(4)}</div>
                </div>
              </div>
            ))}
            {!stops.length && <div className="muted">Click points on the map to add stops.</div>}
          </div>

          <div className="row buttons">
            <button className="btn" disabled={!hasStops} onClick={clearStops}>Clear</button>
            <a className={`btn ${!hasStops ? "disabled" : ""}`} href={hasStops ? googleHref : "#"} target="_blank" rel="noreferrer">Open Google</a>
            <a className={`btn ${!hasStops ? "disabled" : ""}`} href={hasStops ? appleHref : "#"} target="_blank" rel="noreferrer">Open Apple</a>
            <a className={`btn ${!hasStops ? "disabled" : ""}`} href={hasStops ? wazeHref : "#"} target="_blank" rel="noreferrer">Open Waze</a>
          </div>
        </section>
      </aside>

      {/* RIGHT: Map card (no logo overlay in the map) */}
      <section className="map-card">
        <CertisMap
          styleMode={styleMode}
          selectedSuppliers={selectedSuppliers}
          onAddStop={(s) =>
            // Wrap into our Stop shape
            s?.coord
              ? onAddStop(s)
              : null
          }
          onDataLoaded={setSupplierSummary}
        />
      </section>
    </main>
  );
}
