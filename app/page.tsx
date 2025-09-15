"use client";

import React, { useEffect, useMemo, useState } from "react";
import CertisMap, { SupplierSummary } from "@/components/CertisMap";
import { withBasePath } from "@/utils/paths";

type StyleMode = "hybrid" | "street";

type Stop = { name?: string; coord: [number, number] };

export default function Page() {
  const [styleMode, setStyleMode] = useState<StyleMode>("hybrid");
  const [supplierSummary, setSupplierSummary] = useState<SupplierSummary>({ total: 0, suppliers: {} });
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [zip, setZip] = useState<string>("");

  // keep selected suppliers consistent with what exists
  const supplierList = useMemo(() => {
    const entries = Object.entries(supplierSummary.suppliers);
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return entries;
  }, [supplierSummary]);

  useEffect(() => {
    // remove any selections that no longer exist
    const all = new Set(Object.keys(supplierSummary.suppliers));
    setSelectedSuppliers((prev) => prev.filter((s) => all.has(s)));
  }, [supplierSummary]);

  const toggleSupplier = (name: string) => {
    setSelectedSuppliers((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  };

  const onAddStop = (s: Stop) => {
    setStops((prev) => [...prev, s]);
  };

  const clearStops = () => setStops([]);

  return (
    <main className="app-grid">
      {/* Sidebar */}
      <aside className="sidebar">
        <header className="brand">
          <img
            src={withBasePath("/certis-logo.png")}
            alt="CERTIS"
            style={{ height: 26, width: "auto" }}
          />
          <div className="brand-sub">Retailers • Kingpins • Filters</div>
        </header>

        <section className="card">
          <div className="card-title">Home (ZIP)</div>
          <div className="row">
            <input
              value={zip}
              placeholder="e.g. 50309"
              onChange={(e) => setZip(e.target.value)}
              className="input"
            />
            <button className="btn">Set</button>
          </div>
        </section>

        <section className="card">
          <div className="card-title">Map style</div>
          <label className="radio">
            <input
              type="radio"
              name="style"
              checked={styleMode === "hybrid"}
              onChange={() => setStyleMode("hybrid")}
            />
            <span>Hybrid (default)</span>
          </label>
          <label className="radio">
            <input
              type="radio"
              name="style"
              checked={styleMode === "street"}
              onChange={() => setStyleMode("street")}
            />
            <span>Street</span>
          </label>
        </section>

        <section className="card">
          <div className="card-title">
            Suppliers <span className="muted">({supplierList.length})</span>
          </div>
          {supplierList.length === 0 ? (
            <div className="muted">Loading suppliers…</div>
          ) : (
            <div className="pill-grid">
              {supplierList.map(([name, count]) => (
                <label key={name} className="pill">
                  <input
                    type="checkbox"
                    checked={selectedSuppliers.includes(name)}
                    onChange={() => toggleSupplier(name)}
                  />
                  <span>{name} <span className="muted">({count})</span></span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-title">Trip</div>
          <label className="checkbox">
            <input type="checkbox" defaultChecked />
            <span>Round-trip</span>
          </label>
          <div className="muted" style={{ marginTop: 6 }}>
            Click points on the map to add stops.
          </div>

          <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
            <button className="btn-secondary" onClick={clearStops}>Clear</button>
            <button className="btn-secondary">Open Google</button>
            <button className="btn-secondary">Open Apple</button>
            <button className="btn-secondary">Open Waze</button>
          </div>
        </section>
      </aside>

      {/* Map panel */}
      <section className="map-panel">
        <CertisMap
          styleMode={styleMode}
          selectedSuppliers={selectedSuppliers}
          onAddStop={onAddStop}
          onDataLoaded={setSupplierSummary}
        />
      </section>
    </main>
  );
}
