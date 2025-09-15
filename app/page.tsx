// app/page.tsx
"use client";

import React, { useCallback, useMemo, useState } from "react";
import CertisMap from "@/components/CertisMap";
import { withBasePath } from "@/utils/paths";

type Stop = { id: string; name: string; lon: number; lat: number };
type SupplierSummary = { total: number; suppliers: Array<{ name: string; count: number }> };

const ASSET_VER = "v=3"; // cache-bust for logo

export default function Page() {
  const [zip, setZip] = useState("");
  const [styleMode, setStyleMode] = useState<"hybrid" | "street">("hybrid");
  const [roundTrip, setRoundTrip] = useState(true);
  const [stops, setStops] = useState<Stop[]>([]);

  // Supplier filter state
  const [supplierSummary, setSupplierSummary] = useState<SupplierSummary>({ total: 0, suppliers: [] });
  const [supplierSearch, setSupplierSearch] = useState("");
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]); // empty = all

  const onAddStop = useCallback((s: Stop) => {
    setStops((prev) => (prev.find((p) => p.id === s.id) ? prev : [...prev, s]));
  }, []);
  const clearStops = useCallback(() => setStops([]), []);
  const undoStop = useCallback(() => setStops((prev) => prev.slice(0, -1)), []);

  const routeLinks = useMemo(() => {
    if (stops.length < 2) return { google: "", apple: "", waze: "" };
    const coords = stops.map((s) => `${s.lat},${s.lon}`);
    const origin = coords[0];
    const destination = roundTrip ? coords[0] : coords[coords.length - 1];
    const waypoints = coords.slice(1, -1).join("|");
    const google = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}`;
    const apple  = `https://maps.apple.com/?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(destination)}${waypoints ? `&dirflg=d&addr=${encodeURIComponent(waypoints)}` : ""}`;
    const waze   = `https://waze.com/ul?ll=${encodeURIComponent(destination)}&from=${encodeURIComponent(origin)}`;
    return { google, apple, waze };
  }, [stops, roundTrip]);

  const visibleSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    const list = supplierSummary.suppliers;
    if (!q) return list;
    return list.filter((s) => s.name.toLowerCase().includes(q));
  }, [supplierSearch, supplierSummary]);

  const toggleSupplier = (name: string) => {
    setSelectedSuppliers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };
  const clearSuppliers = () => setSelectedSuppliers([]);

  return (
    <main className="h-screen grid grid-cols-[360px_1fr] gap-4 p-2">
      <aside className="sticky top-2 self-start h-[calc(100vh-1rem)] overflow-auto px-3 py-3 rounded-2xl bg-[#0c1624] border border-[#1b2a41]">
        {/* CERTIS logo (correct file name) */}
        <div className="flex items-center justify-between mb-3">
          <img
            src={withBasePath(`certis-logo.png?${ASSET_VER}`)}
            alt="CERTIS"
            className="h-6 w-auto"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        </div>

        {/* MINI-CARDS */}
        <section className="panel-card">
          <h2 className="panel-title">Home (ZIP)</h2>
          <div className="flex gap-2">
            <input
              className="panel-input"
              placeholder="e.g., 50309"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
            <button className="btn-primary">Set</button>
          </div>
        </section>

        <section className="panel-card">
          <h2 className="panel-title">Map Style</h2>
          <div className="flex flex-col gap-2">
            <label className="panel-check">
              <input type="radio" name="style" checked={styleMode === "hybrid"} onChange={() => setStyleMode("hybrid")} />
              <span>Hybrid</span>
            </label>
            <label className="panel-check">
              <input type="radio" name="style" checked={styleMode === "street"} onChange={() => setStyleMode("street")} />
              <span>Street</span>
            </label>
          </div>
        </section>

        <section className="panel-card">
          <h2 className="panel-title">Location Types</h2>
          {/* legend only (filters will expand) */}
          <ul className="space-y-1 text-sm opacity-90">
            <li><span className="dot dot-blue" /> Agronomy</li>
            <li><span className="dot dot-sky" /> Agronomy/Grain</li>
            <li><span className="dot dot-orange" /> Distribution</li>
            <li><span className="dot dot-magenta" /> Grain</li>
            <li><span className="dot dot-violet" /> Grain/Feed</li>
            <li><span className="dot dot-red" /> Kingpin</li>
            <li><span className="dot dot-yellow" /> Office/Service</li>
          </ul>
        </section>

        {/* NEW: Suppliers filter (search + counts) */}
        <section className="panel-card">
          <h2 className="panel-title">Suppliers ({supplierSummary.suppliers.length || 0})</h2>
          <input
            className="panel-input mb-2"
            placeholder="Search suppliers…"
            value={supplierSearch}
            onChange={(e) => setSupplierSearch(e.target.value)}
          />
          <div style={{ maxHeight: 200, overflow: "auto", borderRadius: 8, border: "1px solid #1b2a41", padding: 6 }}>
            {visibleSuppliers.length === 0 && (
              <div className="text-sm opacity-70">No matches.</div>
            )}
            {visibleSuppliers.map((s) => (
              <label key={s.name} className="panel-check" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  <input
                    type="checkbox"
                    checked={selectedSuppliers.includes(s.name)}
                    onChange={() => toggleSupplier(s.name)}
                    style={{ marginRight: 8 }}
                  />
                  {s.name}
                </span>
                <span style={{ opacity: 0.75, fontSize: 12 }}>{s.count}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button className="btn-muted" onClick={clearSuppliers} disabled={selectedSuppliers.length === 0}>Clear</button>
          </div>
          <div className="text-xs opacity-70 mt-1">
            Tip: leave all unchecked to show all suppliers.
          </div>
        </section>

        {/* Trip Builder */}
        <section className="panel-card">
          <h2 className="panel-title">Trip Builder</h2>
          <p className="text-xs mb-2 opacity-80">Hover to preview, click to add a stop.</p>

          <label className="panel-check mb-2">
            <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />
            <span>Round trip</span>
          </label>

          <div className="space-y-1 mb-3">
            {stops.map((s, i) => (
              <div key={s.id} className="text-sm truncate">{i + 1}. {s.name}</div>
            ))}
            {stops.length === 0 && <div className="text-sm opacity-70">No stops yet.</div>}
          </div>

          <div className="flex gap-2">
            <button className="btn-muted" onClick={undoStop} disabled={stops.length === 0}>Undo</button>
            <button className="btn-muted" onClick={clearStops} disabled={stops.length === 0}>Clear</button>
          </div>

          <div className="mt-3 flex flex-col gap-1 text-sm">
            <a className={`link ${routeLinks.google ? "" : "pointer-events-none opacity-40"}`} href={routeLinks.google || "#"} target="_blank" rel="noreferrer">Open in Google Maps</a>
            <a className={`link ${routeLinks.apple ? "" : "pointer-events-none opacity-40"}`} href={routeLinks.apple || "#"} target="_blank" rel="noreferrer">Open in Apple Maps</a>
            <a className={`link ${routeLinks.waze ? "" : "pointer-events-none opacity-40"}`} href={routeLinks.waze || "#"} target="_blank" rel="noreferrer">Open in Waze</a>
          </div>
        </section>
      </aside>

      {/* Map pane */}
      <section className="rounded-2xl overflow-hidden border border-[#1b2a41]">
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
