"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import CertisMap, { CATEGORY_COLOR } from "@/components/CertisMap";
import { withBasePath } from "@/utils/paths";
import * as turf from "@turf/turf";

type Position = [number, number];

type Stop = { name: string; coord: Position };

type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, any>;
type F = GeoJSON.Feature<GeoJSON.Geometry, any>;

const DATA_URL = withBasePath("/data/retailers.geojson");
const KINGPIN_FLAG = "kingpin"; // boolean OR category includes 'Kingpin'

/** Normalize retailer name to a logo file name in /public/icons */
const slug = (s = "") =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const categoryOf = (p: any): string =>
  (p?.category || p?.Category || "").toString();

const isKingpin = (p: any): boolean =>
  Boolean(p?.[KINGPIN_FLAG]) ||
  categoryOf(p).toLowerCase().includes("kingpin");

// simple zip->lnglat using Mapbox geocoder endpoint is avoided (no fetch to web);
// we keep the home as raw text and use best effort city center via turf on data.
async function geoHomeFromZip(zip: string, sample: FC): Promise<Position | null> {
  if (!zip) return null;
  // try to find any point with that zip as seed
  const f = sample.features.find(
    (x) => `${x.properties?.zip || x.properties?.Zip}` === zip
  );
  if (f && f.geometry?.type === "Point") {
    const c = (f.geometry as any).coordinates as Position;
    return [c[0], c[1]];
  }
  return null;
}

// --------------------------- UI Helpers

function CheckboxRow({
  checked,
  onChange,
  dotColor,
  label,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  dotColor?: string;
  label: string;
  title?: string;
}) {
  return (
    <label
      title={title || label}
      className="flex items-center gap-2 py-1 px-2 rounded hover:bg-[#0f1b2b] cursor-pointer"
      style={{ userSelect: "none" }}
    >
      <input
        type="checkbox"
        className="w-4 h-4 accent-emerald-400"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {dotColor && (
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: dotColor,
            display: "inline-block",
            marginRight: 2,
          }}
        />
      )}
      <span>{label}</span>
    </label>
  );
}

// --------------------------- Page

export default function Page() {
  // raw data
  const [raw, setRaw] = useState<FC | null>(null);
  const [rawKing, setRawKing] = useState<FC>({ type: "FeatureCollection", features: [] });
  const [rawMain, setRawMain] = useState<FC>({ type: "FeatureCollection", features: [] });

  // filters
  const [selectedStates, setSelectedStates] = useState<Record<string, boolean>>({});
  const [selectedRetailers, setSelectedRetailers] = useState<Record<string, boolean>>({});
  const [selectedCats, setSelectedCats] = useState<Record<string, boolean>>({});
  const [selectedSuppliers, setSelectedSuppliers] = useState<Record<string, boolean>>({});

  // map style
  const [mapStyle, setMapStyle] = useState<"hybrid" | "street">("hybrid");

  // home and trip builder
  const [zip, setZip] = useState("");
  const [home, setHome] = useState<Position | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [roundTrip, setRoundTrip] = useState(true);

  // load data once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(DATA_URL);
      const fc = (await res.json()) as FC;

      if (cancelled) return;
      setRaw(fc);

      // split kingpins
      const mainFeats: F[] = [];
      const kingFeats: F[] = [];
      for (const f of fc.features) {
        if (isKingpin(f.properties)) kingFeats.push(f);
        else mainFeats.push(f);
      }
      setRawKing({ type: "FeatureCollection", features: kingFeats });
      setRawMain({ type: "FeatureCollection", features: mainFeats });

      // seed filter lists
      const states = new Set<string>();
      const retailers = new Set<string>();
      const cats = new Set<string>();
      const suppliers = new Set<string>();
      for (const f of fc.features) {
        states.add((f.properties?.state || f.properties?.State || "").toString());
        retailers.add((f.properties?.retailer || f.properties?.Retailer || "").toString());
        const c = categoryOf(f.properties);
        if (c) cats.add(c);
        const sup = (f.properties?.Suppliers || f.properties?.suppliers || "")
          .toString()
          .split(/[;,]/)
          .map((s: string) => s.trim())
          .filter(Boolean);
        sup.forEach((s: string) => suppliers.add(s));
      }
      const allTrue = (arr: Iterable<string>) =>
        Array.from(arr).reduce((acc: Record<string, boolean>, k) => {
          acc[k] = true;
          return acc;
        }, {});
      setSelectedStates(allTrue(states));
      setSelectedRetailers(allTrue(retailers));
      setSelectedCats(allTrue(cats));
      setSelectedSuppliers(allTrue(suppliers));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // filtered collections
  const filteredMain: FC = useMemo(() => {
    if (!rawMain) return { type: "FeatureCollection", features: [] };
    const feats = rawMain.features.filter((f) => {
      const p = f.properties || {};
      const st = (p.state || p.State || "").toString();
      const r = (p.retailer || p.Retailer || "").toString();
      const cat = categoryOf(p);
      const supList: string[] = (p.Suppliers || p.suppliers || "")
        .toString()
        .split(/[;,]/)
        .map((s: string) => s.trim())
        .filter(Boolean);

      const stOk = !st || selectedStates[st];
      const rOk = !r || selectedRetailers[r];
      const cOk = !cat || selectedCats[cat];
      const supOk = supList.length === 0 || supList.some((s) => selectedSuppliers[s]);

      return stOk && rOk && cOk && supOk;
    });
    return { type: "FeatureCollection", features: feats };
  }, [rawMain, selectedStates, selectedRetailers, selectedCats, selectedSuppliers]);

  // on map click
  const addStop = useCallback(
    (props: any, ll: mapboxgl.LngLat) => {
      const name = props?.name || props?.Name || props?.retailer || "Stop";
      setStops((s) => [...s, { name, coord: [ll.lng, ll.lat] }]);
    },
    []
  );

  // optimize route (greedy TSP-ish)
  const optimized = useMemo(() => {
    if (stops.length < 2) return stops;
    const pts = stops.slice();
    // seed with home or first stop
    const start: Position | null = home ?? pts[0]?.coord ?? null;
    if (!start) return pts;
    const remaining = pts.map((s) => s.coord);
    const used: boolean[] = Array(remaining.length).fill(false);

    const order: number[] = [];
    // if we seeded with first stop, mark it used
    let cur = start;
    for (let step = 0; step < remaining.length; step++) {
      // find nearest unused
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        if (used[i]) continue;
        const d = turf.distance(
          turf.point(cur as any),
          turf.point(remaining[i] as any),
          { units: "kilometers" }
        );
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      used[best] = true;
      order.push(best);
      cur = remaining[best];
    }

    const ordered = order.map((i) => stops[i]);
    return ordered;
  }, [stops, home]);

  // open in external maps
  const asGoogleLink = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin = (home ?? optimized[0]?.coord) as Position | undefined;
    if (!origin) return "";
    const waypoints = optimized.map((s) => s.coord);
    const parts = [origin, ...waypoints];
    const url =
      "https://www.google.com/maps/dir/" +
      parts.map((p) => `${p[1]},${p[0]}`).join("/") +
      (roundTrip ? `/${origin[1]},${origin[0]}` : "");
    return url;
  }, [optimized, home, roundTrip]);

  // set home from zip quickly using nearby points
  const onSetZip = useCallback(async () => {
    if (!raw) return;
    const pos = await geoHomeFromZip(zip.trim(), raw);
    setHome(pos);
  }, [zip, raw]);

  // --------------- unique lists for filters
  const stateList = useMemo(() => Object.keys(selectedStates).sort(), [selectedStates]);
  const retailerList = useMemo(
    () => Object.keys(selectedRetailers).sort((a, b) => a.localeCompare(b)),
    [selectedRetailers]
  );
  const catList = useMemo(() => Object.keys(selectedCats).sort(), [selectedCats]);
  const supplierList = useMemo(
    () => Object.keys(selectedSuppliers).sort((a, b) => a.localeCompare(b)),
    [selectedSuppliers]
  );

  return (
    <div className="min-h-screen bg-[#0b1220] text-neutral-100">
      <div className="max-w-[1300px] mx-auto py-6 px-4">
        <div className="text-sm mb-3">
          <img
            src="/certis-logo.png"
            alt="CERTIS"
            style={{ height: 26, objectFit: "contain" }}
          />
        </div>

        <div className="grid grid-cols-[360px,1fr] gap-4 items-start">
          {/* LEFT CARD */}
          <section className="bg-[#0e1626] rounded-xl p-4 border border-[#ffffff14]">
            {/* Home */}
            <div className="mb-4">
              <div className="font-semibold text-lg mb-2">Home (ZIP)</div>
              <div className="flex gap-2">
                <input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="e.g. 50309"
                  className="w-full rounded bg-[#0b1323] px-3 py-2 border border-[#ffffff16] outline-0"
                />
                <button
                  onClick={onSetZip}
                  className="px-3 py-2 rounded bg-[#2563EB] hover:bg-[#1D4ED8]"
                >
                  Set
                </button>
              </div>
            </div>

            {/* Style */}
            <div className="border-t border-[#ffffff14] my-4" />
            <div className="mb-2 font-semibold">Map Style</div>
            <div className="flex items-center gap-6 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={mapStyle === "hybrid"}
                  onChange={() => setMapStyle("hybrid")}
                />
                Hybrid
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={mapStyle === "street"}
                  onChange={() => setMapStyle("street")}
                />
                Street
              </label>
            </div>

            {/* States */}
            <div className="border-t border-[#ffffff14] my-4" />
            <div className="font-semibold mb-2">
              States ({Object.values(selectedStates).filter(Boolean).length}/
              {stateList.length})
            </div>
            <div className="space-y-1 max-h-48 overflow-auto pr-2">
              {stateList.map((st) => (
                <CheckboxRow
                  key={st}
                  checked={!!selectedStates[st]}
                  onChange={(v) =>
                    setSelectedStates((m) => ({ ...m, [st]: v }))
                  }
                  label={st}
                />
              ))}
            </div>

            {/* Retailers */}
            <div className="border-t border-[#ffffff14] my-4" />
            <div className="font-semibold mb-2">
              Retailers (
              {Object.values(selectedRetailers).filter(Boolean).length}/
              {retailerList.length})
            </div>
            <div className="space-y-1 max-h-48 overflow-auto pr-2">
              {retailerList.map((r) => (
                <CheckboxRow
                  key={r}
                  checked={!!selectedRetailers[r]}
                  onChange={(v) =>
                    setSelectedRetailers((m) => ({ ...m, [r]: v }))
                  }
                  label={r}
                />
              ))}
            </div>

            {/* Categories (with colored dot) */}
            <div className="border-t border-[#ffffff14] my-4" />
            <div className="font-semibold mb-2">
              Location Types (
              {Object.values(selectedCats).filter(Boolean).length}/
              {catList.length})
            </div>
            <div className="space-y-1 max-h-40 overflow-auto pr-2">
              {catList.map((c) => (
                <CheckboxRow
                  key={c}
                  checked={!!selectedCats[c]}
                  onChange={(v) => setSelectedCats((m) => ({ ...m, [c]: v }))}
                  label={c}
                  dotColor={CATEGORY_COLOR[c] ?? CATEGORY_COLOR[""]}
                />
              ))}
            </div>

            {/* Suppliers */}
            <div className="border-t border-[#ffffff14] my-4" />
            <div className="font-semibold mb-2">
              Suppliers (
              {Object.values(selectedSuppliers).filter(Boolean).length}/
              {supplierList.length})
            </div>
            <div className="space-y-1 max-h-40 overflow-auto pr-2">
              {supplierList.map((s) => (
                <CheckboxRow
                  key={s}
                  checked={!!selectedSuppliers[s]}
                  onChange={(v) =>
                    setSelectedSuppliers((m) => ({ ...m, [s]: v }))
                  }
                  label={s}
                />
              ))}
            </div>

            {/* Trip builder */}
            <div className="border-t border-[#ffffff14] my-4" />
            <div className="font-semibold text-lg mb-2">Trip Builder</div>
            <div className="text-xs opacity-80 mb-2">
              Hover to preview, click to add a stop.
            </div>
            <ol className="list-decimal ml-5 text-sm space-y-1 max-h-40 overflow-auto pr-2">
              {stops.map((s, i) => (
                <li key={i}>{s.name}</li>
              ))}
            </ol>
            <div className="flex items-center gap-3 mt-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={roundTrip}
                  onChange={(e) => setRoundTrip(e.target.checked)}
                />
                Round trip
              </label>
              <button
                onClick={() => setStops([])}
                className="text-sm px-2 py-1 rounded bg-[#1f2937] hover:bg-[#111827]"
              >
                Clear
              </button>
              {asGoogleLink && (
                <a
                  href={asGoogleLink}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-sm text-emerald-300 hover:text-emerald-200 underline"
                >
                  Open in Google Maps
                </a>
              )}
            </div>
          </section>

          {/* MAP */}
          <main>
            <div className="mb-2">
              <img
                src="/certis-logo.png"
                alt="CERTIS"
                style={{
                  position: "absolute",
                  zIndex: 2,
                  margin: "8px 0 0 10px",
                  height: 20,
                  filter: "drop-shadow(0 1px 2px rgba(0,0,0,.6))",
                  pointerEvents: "none",
                }}
              />
            </div>
            <CertisMap
              main={(filteredMain as unknown as import("geojson").FeatureCollection<import("geojson").Point, any>)}
              kingpins={rawKing}
              home={home}
              onPointClick={addStop}
              mapStyle={mapStyle}
            />
          </main>
        </div>
      </div>
    </div>
  );
}



