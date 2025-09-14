"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Feature, FeatureCollection, GeoJsonProperties } from "geojson";
import { withBasePath } from "@/utils/paths";
import * as Route from "@/utils/routing";

type LngLat = [number, number];

const CertisMap = dynamic(() => import("@/components/CertisMap"), { ssr: false });

/** Narrow utility to ensure a literal FeatureCollection type */
function toFC(features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

/** Split the dataset into { main, kingpins } */
function splitKingpins(fc: FeatureCollection) {
  const main: Feature[] = [];
  const kp: Feature[] = [];
  for (const f of fc.features) {
    const p = (f.properties || {}) as any;
    const isKp =
      String(p.type || p.Type || "").toLowerCase() === "kingpin" ||
      p.kingpin === true ||
      String(p.KINGPIN || "").toLowerCase() === "true";
    (isKp ? kp : main).push(f);
  }
  return { main: toFC(main), kingpins: toFC(kp) };
}

function getProp(p: GeoJsonProperties, keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = (p?.[k] as any) ?? "";
    if (v !== undefined && v !== null && `${v}`.trim() !== "") return `${v}`;
  }
  return fallback;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

type Stop = { name: string; coord: LngLat };

export default function Page() {
  const [rawMain, setRawMain] = useState<FeatureCollection>({ type: "FeatureCollection", features: [] });
  const [rawKingpins, setRawKingpins] = useState<FeatureCollection>({ type: "FeatureCollection", features: [] });

  const [inferredTypeKey, setInferredTypeKey] = useState<string>("type");

  // Filters
  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);

  const [selStates, setSelStates] = useState<Set<string>>(new Set());
  const [selRetailers, setSelRetailers] = useState<Set<string>>(new Set());
  const [selTypes, setSelTypes] = useState<Set<string>>(new Set());
  const [selSuppliers, setSelSuppliers] = useState<Set<string>>(new Set());

  // Map style
  const [mapStyle, setMapStyle] = useState<"hybrid" | "street">("hybrid");

  // Home (ZIP) + trip
  const zipRef = useRef<HTMLInputElement>(null);
  const [home, setHome] = useState<LngLat | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [optimized, setOptimized] = useState<Stop[]>([]);
  const [roundTrip, setRoundTrip] = useState<boolean>(false);

  // Load retailers dataset and derive kingpins
  useEffect(() => {
    (async () => {
      const url = withBasePath("/data/retailers.geojson");
      const res = await fetch(url);
      if (!res.ok) {
        console.warn("Failed to load retailers.geojson");
        return;
      }
      const fc = (await res.json()) as FeatureCollection;
      const { main, kingpins } = splitKingpins(fc);
      setRawMain(main);
      setRawKingpins(kingpins);

      // Infer the "Type" key (type, Type, category, etc.)
      const first = (main.features[0]?.properties || {}) as any;
      const candidateKeys = ["type", "Type", "category", "Category", "Location Type", "LocationType"];
      const hit = candidateKeys.find((k) => first?.[k] !== undefined) || "type";
      setInferredTypeKey(hit);

      // Hydrate filter lists
      const st = uniqueSorted(
        main.features.map((f) => getProp(f.properties, ["state", "State"]))
      );
      const re = uniqueSorted(
        main.features.map((f) => getProp(f.properties, ["retailer", "Retailer"]))
      );
      const ty = uniqueSorted(
        main.features.map((f) => getProp(f.properties, [hit]))
      );

      // Suppliers may be comma-, slash-, or "and" separated
      const sup = uniqueSorted(
        main.features
          .map((f) =>
            getProp(f.properties, ["Supplier", "Suppliers", "Supplier(s)"], "")
          )
          .flatMap((s) =>
            s
              ? `${s}`
                  .replace(/\sand\s/gi, ",")
                  .replace(/\//g, ",")
                  .split(",")
                  .map((x) => x.trim())
              : []
          )
      );

      setStates(st);
      setRetailers(re);
      setTypes(ty);
      setSuppliers(sup);

      setSelStates(new Set(st));
      setSelRetailers(new Set(re));
      setSelTypes(new Set(ty));
      setSelSuppliers(new Set(sup));
    })();
  }, []);

  // Filtered features (main dataset only). Kingpins pass through separately.
  const filteredMain = useMemo<FeatureCollection>(() => {
    if (!rawMain.features.length) return rawMain;
    const ff = rawMain.features.filter((f) => {
      const p = f.properties || {};
      const s = getProp(p, ["state", "State"]);
      const r = getProp(p, ["retailer", "Retailer"]);
      const t = getProp(p, [inferredTypeKey]);
      const supplierRaw = getProp(p, ["Supplier", "Suppliers", "Supplier(s)"]);
      // Any supplier match (OR) – if no suppliers in selection we skip the filter (all)
      const supplierTokens = `${supplierRaw}`
        .replace(/\sand\s/gi, ",")
        .replace(/\//g, ",")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      const stateOk = selStates.size === 0 || selStates.has(s);
      const retailerOk = selRetailers.size === 0 || selRetailers.has(r);
      const typeOk = selTypes.size === 0 || selTypes.has(t);
      const supplierOk =
        selSuppliers.size === 0 ||
        supplierTokens.some((tok) => selSuppliers.has(tok));

      return stateOk && retailerOk && typeOk && supplierOk;
    });
    return toFC(ff);
  }, [rawMain, selStates, selRetailers, selTypes, selSuppliers, inferredTypeKey]);

  const addStop = useCallback(
    (p: GeoJsonProperties, coord: LngLat) => {
      const retailer = getProp(p, ["retailer", "Retailer"], "Stop");
      const city = getProp(p, ["city", "City"]);
      const state = getProp(p, ["state", "State"]);
      const name = [retailer, city, state].filter(Boolean).join(" · ");
      setStops((prev) => [...prev, { name, coord }]);
      setOptimized((prev) => [...prev, { name, coord }]); // until optimize is run
    },
    []
  );

  const clearTrip = useCallback(() => {
    setStops([]);
    setOptimized([]);
  }, []);

  // Simple nearest neighbor + return toggle (kept from your previous utility)
  const optimize = useCallback(() => {
    if (stops.length === 0) {
      setOptimized([]);
      return;
    }
    // nearest neighbor from home if present else first stop
    const origin = home ?? stops[0].coord;
    const remaining = stops.slice();
    const ordered: Stop[] = [];
    let current = origin;

    const dist = (a: LngLat, b: LngLat) => {
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      return Math.sqrt(dx * dx + dy * dy);
    };

    while (remaining.length) {
      let bestIdx = 0;
      let bestD = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = dist(current, remaining[i].coord);
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      }
      const [next] = remaining.splice(bestIdx, 1);
      ordered.push(next);
      current = next.coord;
    }

    if (roundTrip && home) {
      // just append a pseudo-stop back to origin for preview lists
      ordered.push({ name: "Return to start", coord: home });
    }
    setOptimized(ordered);
  }, [stops, home, roundTrip]);

  // Zip → home (Mapbox geocoding if token present; otherwise ignore gracefully)
  const setZip = useCallback(async () => {
    const raw = zipRef.current?.value?.trim();
    if (!raw) return;
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
      if (!token) return;
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        raw
      )}.json?types=postcode&limit=1&access_token=${token}`;
      const res = await fetch(url);
      const j = await res.json();
      const center = j?.features?.[0]?.center;
      if (Array.isArray(center) && center.length === 2) {
        setHome([center[0], center[1]]);
      }
    } catch (e) {
      console.warn("ZIP geocode failed", e);
    }
  }, []);

  // Link builders
  const googleHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin =
      home != null ? `${home[1]},${home[0]}` : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildGoogleMapsLink(origin, optimized.map((s) => s.coord), {
      roundTrip,
    });
  }, [optimized, home, roundTrip]);

  const appleHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin =
      home != null ? `${home[1]},${home[0]}` : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildAppleMapsLink(origin, optimized.map((s) => s.coord), {
      roundTrip,
    });
  }, [optimized, home, roundTrip]);

  const wazeHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin =
      home != null ? `${home[1]},${home[0]}` : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildWazeLink(origin, optimized.map((s) => s.coord), {
      roundTrip,
    });
  }, [optimized, home, roundTrip]);

  // UI helpers
  const toggleAll = (list: string[], setter: (s: Set<string>) => void, on: boolean) => {
    setter(on ? new Set(list) : new Set());
  };
  const toggleOne = (val: string, set: Set<string>, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  };

  return (
    <div
      className="pane-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "360px 1fr",
        gap: 0,
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          background: "var(--sidebar-bg, #0b1620)",
          color: "var(--sidebar-fg, #e5e7eb)",
          padding: "14px 14px 8px",
          overflow: "auto",
        }}
      >
        {/* Brand above ZIP */}
        <div className="flex items-center gap-2 mb-3">
          <img
            src={withBasePath("/certis-logo.png")}
            alt="Certis"
            className="h-7 w-auto pointer-events-none select-none"
            loading="eager"
            style={{ height: 28 }}
          />
          <span className="sr-only">Certis</span>
        </div>

        <h1 className="text-xl font-semibold mb-2">Certis AgRoute Planner</h1>

        {/* Home (ZIP) */}
        <div className="mb-4">
          <div className="text-sm font-semibold mb-1">Home (ZIP)</div>
          <div className="flex gap-2">
            <input
              ref={zipRef}
              placeholder="e.g. 50309"
              className="px-2 py-1 rounded bg-[#0f1c28] border border-[#1f2c38] text-sm"
              style={{ width: 140 }}
            />
            <button
              onClick={setZip}
              className="px-3 py-1 rounded bg-[#f6c32f] text-black text-sm font-semibold"
              title="Set home from ZIP"
            >
              Set
            </button>
          </div>
        </div>

        {/* States */}
        <section className="mb-3">
          <div className="text-sm font-semibold mb-2">
            States ({selStates.size} / {states.length})
          </div>
          <div className="flex gap-2 mb-2">
            <button onClick={() => toggleAll(states, setSelStates, true)} className="chip">All</button>
            <button onClick={() => toggleAll(states, setSelStates, false)} className="chip">None</button>
          </div>
          <div className="checkbox-grid stack">
            {states.map((s) => (
              <label key={s} className="row-check">
                <input
                  type="checkbox"
                  checked={selStates.has(s)}
                  onChange={() => toggleOne(s, selStates, setSelStates)}
                />
                <span>{s}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Retailers (one per row) */}
        <section className="mb-3">
          <div className="text-sm font-semibold mb-2">
            Retailers ({selRetailers.size} / {retailers.length})
          </div>
          <div className="flex gap-2 mb-2">
            <button onClick={() => toggleAll(retailers, setSelRetailers, true)} className="chip">All</button>
            <button onClick={() => toggleAll(retailers, setSelRetailers, false)} className="chip">None</button>
          </div>
          <div className="checkbox-grid stack">
            {retailers.map((r) => (
              <label key={r} className="row-check">
                <input
                  type="checkbox"
                  checked={selRetailers.has(r)}
                  onChange={() => toggleOne(r, selRetailers, setSelRetailers)}
                />
                <span>{r}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Location Types */}
        <section className="mb-3">
          <div className="text-sm font-semibold mb-2">
            Location Types ({selTypes.size} / {types.length})
          </div>
          <div className="flex gap-2 mb-2">
            <button onClick={() => toggleAll(types, setSelTypes, true)} className="chip">All</button>
            <button onClick={() => toggleAll(types, setSelTypes, false)} className="chip">None</button>
          </div>
          <div className="checkbox-grid">
            {types.map((t) => (
              <label key={t} className="row-check">
                <input
                  type="checkbox"
                  checked={selTypes.has(t)}
                  onChange={() => toggleOne(t, selTypes, setSelTypes)}
                />
                <span>{t}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Suppliers */}
        <section className="mb-4">
          <div className="text-sm font-semibold mb-2">
            Suppliers ({selSuppliers.size} / {suppliers.length})
          </div>
          <div className="flex gap-2 mb-2">
            <button onClick={() => toggleAll(suppliers, setSelSuppliers, true)} className="chip">All</button>
            <button onClick={() => toggleAll(suppliers, setSelSuppliers, false)} className="chip">None</button>
          </div>
          <div className="checkbox-grid">
            {suppliers.map((s) => (
              <label key={s} className="row-check">
                <input
                  type="checkbox"
                  checked={selSuppliers.has(s)}
                  onChange={() => toggleOne(s, selSuppliers, setSelSuppliers)}
                />
                <span>{s}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Map style */}
        <section className="mb-4">
          <div className="text-sm font-semibold mb-2">Map Style</div>
          <div className="flex gap-2">
            <button
              className={`chip ${mapStyle === "hybrid" ? "chip-on" : ""}`}
              onClick={() => setMapStyle("hybrid")}
            >
              Hybrid
            </button>
            <button
              className={`chip ${mapStyle === "street" ? "chip-on" : ""}`}
              onClick={() => setMapStyle("street")}
            >
              Street
            </button>
          </div>
        </section>

        {/* Trip */}
        <section className="mb-2">
          <div className="text-sm font-semibold mb-2">Trip Builder</div>
          <div className="text-xs opacity-80 mb-2">Hover to preview, click a point to add to Trip.</div>
          {stops.length > 0 && (
            <ol className="text-xs mb-2 list-decimal pl-4">
              {stops.map((s, i) => (
                <li key={i} className="mb-0.5">{s.name}</li>
              ))}
            </ol>
          )}
          <div className="flex items-center gap-2 mb-2">
            <button onClick={optimize} className="chip action">Optimize</button>
            <button onClick={clearTrip} className="chip">Clear</button>
          </div>
          <label className="inline-flex items-center gap-2 text-xs mb-2">
            <input type="checkbox" checked={roundTrip} onChange={() => setRoundTrip((v) => !v)} />
            <span>Return to start (round trip)</span>
          </label>

          <div className="links text-xs flex flex-col gap-1">
            {googleHref && (
              <a className="link" href={googleHref} target="_blank" rel="noreferrer">Open in Google Maps</a>
            )}
            {appleHref && (
              <a className="link" href={appleHref} target="_blank" rel="noreferrer">Open in Apple Maps</a>
            )}
            {wazeHref && (
              <a className="link" href={wazeHref} target="_blank" rel="noreferrer">Open in Waze</a>
            )}
          </div>

          <div className="text-[11px] opacity-70 mt-2">
            KINGPINs are always visible (separate source) and unaffected by filters.
          </div>
        </section>
      </aside>

      {/* Map */}
      <main style={{ position: "relative" }}>
        <CertisMap
          data={filteredMain}
          kingpins={rawKingpins}
          home={home}
          onPointClick={addStop}
          mapStyle={mapStyle}
        />
      </main>
    </div>
  );
}
