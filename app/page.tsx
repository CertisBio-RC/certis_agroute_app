"use client";

import React, { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { withBasePath } from "@/utils/paths";

const CertisMap = dynamic(() => import("@/components/CertisMap"), { ssr: false });

type Stop = { name?: string; coord: [number, number] };

export default function Page() {
  const [styleMode, setStyleMode] = useState<"hybrid" | "street">("hybrid");
  const [roundTrip, setRoundTrip] = useState(true);
  const [stops, setStops] = useState<Stop[]>([]);
  const [supplierSummary, setSupplierSummary] = useState<{ total: number; suppliers: string[] } | null>(null);

  const onAddStop = useCallback((s: Stop) => {
    setStops((prev) => [...prev, s]);
  }, []);

  const clearStops = useCallback(() => setStops([]), []);

  const openNav = useCallback(
    (kind: "google" | "apple" | "waze") => {
      if (!stops.length) return;
      const pts = roundTrip ? [...stops, stops[0]] : stops;
      const coords = pts.map((p) => `${p.coord[1]},${p.coord[0]}`); // lat,lng for URLs

      if (kind === "google") {
        const url = `https://www.google.com/maps/dir/${coords.join("/")}`;
        window.open(url, "_blank");
      } else if (kind === "apple") {
        const url = `https://maps.apple.com/?daddr=${coords.join("+to:")}`;
        window.open(url, "_blank");
      } else {
        // Waze supports single destination better; use the first or last
        const last = pts[pts.length - 1];
        const url = `https://waze.com/ul?ll=${last.coord[1]},${last.coord[0]}&navigate=yes`;
        window.open(url, "_blank");
      }
    },
    [stops, roundTrip]
  );

  const styleRadios = (
    <div className="card">
      <div className="card-title">Map style</div>
      <label className="row">
        <input type="radio" checked={styleMode === "hybrid"} onChange={() => setStyleMode("hybrid")} />
        <span>Hybrid (default)</span>
      </label>
      <label className="row">
        <input type="radio" checked={styleMode === "street"} onChange={() => setStyleMode("street")} />
        <span>Street</span>
      </label>
    </div>
  );

  const suppliersPanel = (
    <div className="card">
      <div className="card-title">
        Suppliers ({supplierSummary?.total ?? 0})
      </div>
      <div className="text-sm opacity-75">
        {supplierSummary ? (
          supplierSummary.suppliers.length ? (
            <div className="grid grid-cols-1 gap-y-1 max-h-48 overflow-auto pr-1">
              {supplierSummary.suppliers.map((s) => (
                <div key={s} className="truncate">{s}</div>
              ))}
            </div>
          ) : (
            "No suppliers found in /public/data."
          )
        ) : (
          "Loading suppliers..."
        )}
      </div>
    </div>
  );

  const tripPanel = (
    <div className="card">
      <div className="card-title">Trip</div>
      <label className="row">
        <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />
        <span>Round-trip</span>
      </label>
      <div className="text-sm opacity-75 mb-2">Click points on the map to add stops.</div>
      <div className="flex gap-2 flex-wrap">
        <button className="btn" onClick={clearStops}>Clear</button>
        <button className="btn" onClick={() => openNav("google")}>Open Google</button>
        <button className="btn" onClick={() => openNav("apple")}>Open Apple</button>
        <button className="btn" onClick={() => openNav("waze")}>Open Waze</button>
      </div>
    </div>
  );

  return (
    <main className="page">
      <aside className="sidebar">
        <div className="logo-row">
          <img src={withBasePath("/certis-logo.png")} alt="Certis" height={28} />
          <div className="logo-caption">Retailers • Kingpins • Filters</div>
        </div>

        {styleRadios}
        {suppliersPanel}
        {tripPanel}
      </aside>

      <section className="map-shell">
        <CertisMap
          styleMode={styleMode}
          onAddStop={onAddStop}
          onDataLoaded={setSupplierSummary}
        />
      </section>
    </main>
  );
}
