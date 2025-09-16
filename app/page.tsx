"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import type { Feature, FeatureCollection, GeoJsonProperties, Point, Position } from "geojson";
import CertisMap from "@/components/CertisMap";
import { withBasePath } from "@/utils/paths";

/** ---------------------------
 *  Helpers: token + data fetch
 *  --------------------------- */
async function getMapboxToken(): Promise<string> {
  // 1) Prefer env (NEXT_PUBLIC_*)
  if (typeof process !== "undefined" && process.env && process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return String(process.env.NEXT_PUBLIC_MAPBOX_TOKEN).trim();
  }
  // 2) Runtime file fallback at /public/data/token.txt
  const url = withBasePath("/data/token.txt");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load Mapbox token from ${url}`);
  const txt = (await res.text()).trim();
  if (!txt) throw new Error("Empty token.txt");
  return txt;
}

type FC = FeatureCollection;

/** try a list of plausible data files under /public/data */
async function loadMainData(): Promise<FeatureCollection<Point, any>> {
  const candidates = [
    "/data/main.geojson",
    "/data/main.json",
    "/data/retailers.geojson",
    "/data/retailers.json",
  ];
  let lastErr: any = null;

  for (const p of candidates) {
    const url = withBasePath(p);
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const fc = (await r.json()) as FeatureCollection;
      // Normalize to Point-only FeatureCollection
      const pts: Feature<Point, any>[] = [];
      for (const f of fc.features ?? []) {
        if (f && f.geometry && f.geometry.type === "Point") {
          pts.push(f as Feature<Point, any>);
        }
      }
      if (pts.length > 0) {
        return { type: "FeatureCollection", features: pts };
      }
      // If file parsed but had no Point features, keep going
      lastErr = new Error(`No Point features in ${p}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("No dataset found under /public/data");
}

/** ---------------------------
 *  Domain helpers
 *  --------------------------- */
function inferKey(candidates: string[], props: GeoJsonProperties, fallback: string): string {
  const keys = Object.keys(props ?? {}).map((k) => k.toLowerCase());
  for (const c of candidates) {
    const lc = c.toLowerCase();
    if (keys.includes(lc)) return Object.keys(props!).find((k) => k.toLowerCase() === lc)!;
  }
  return fallback;
}

function splitKingpins(
  fc: FeatureCollection<Point, any>,
  typeKeyGuess: string
): { main: FeatureCollection<Point, any>; kingpins: FeatureCollection<Point, any>; typeKey: string } {
  if (!fc || !Array.isArray(fc.features)) {
    return {
      main: { type: "FeatureCollection", features: [] },
      kingpins: { type: "FeatureCollection", features: [] },
      typeKey: typeKeyGuess,
    };
  }

  // Attempt to lock the actual key name we should use for type/category
  const firstProps = fc.features.find((f) => !!f.properties)?.properties ?? {};
  const typeKey = inferKey(
    ["Location Type", "Type", "type", "Category", "category"],
    firstProps,
    typeKeyGuess
  );

  const kings: Feature<Point, any>[] = [];
  const rest: Feature<Point, any>[] = [];
  for (const f of fc.features) {
    const p = (f.properties ?? {}) as any;
    const tag = (p[typeKey] ?? p.Type ?? p.type ?? "").toString().toLowerCase();
    const hasFlag = p.KINGPIN === true || p.kingpin === true;
    if (hasFlag || tag === "kingpin" || tag === "king pin" || tag === "king-pin") kings.push(f);
    else rest.push(f);
  }

  return {
    main: { type: "FeatureCollection", features: rest },
    kingpins: { type: "FeatureCollection", features: kings },
    typeKey,
  };
}

function uniqueSorted(arr: (string | number | undefined | null)[]): string[] {
  return Array.from(
    new Set(
      arr
        .map((x) => (x == null ? "" : String(x).trim()))
        .filter((s) => s.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
}

/** parse a suppliers string like "Acme; Foo, Bar | Baz" → ["Acme","Foo","Bar","Baz"] */
function parseSuppliers(raw: any): string[] {
  if (raw == null) return [];
  return String(raw)
    .split(/[,;|]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** ---------------------------
 *  UI types
 *  --------------------------- */
type Stop = { name: string; coord: [number, number] };

export default function Page() {
  // Runtime state
  const [token, setToken] = useState<string>("");
  const [raw, setRaw] = useState<FeatureCollection<Point, any> | null>(null);
  const [main, setMain] = useState<FeatureCollection<Point, any>>({
    type: "FeatureCollection",
    features: [],
  });
  const [kingpins, setKingpins] = useState<FeatureCollection<Point, any>>({
    type: "FeatureCollection",
    features: [],
  });

  const [typeKey, setTypeKey] = useState<string>("Type");
  const [retailerKey, setRetailerKey] = useState<string>("Retailer");
  const [stateKey, setStateKey] = useState<string>("State");
  const [supplierKey, setSupplierKey] = useState<string>("Suppliers");

  const [states, setStates] = useState<string[]>([]);
  const [retailers, setRetailers] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);

  const [selectedStates, setSelectedStates] = useState<Record<string, boolean>>({});
  const [selectedRetailers, setSelectedRetailers] = useState<Record<string, boolean>>({});
  const [selectedTypes, setSelectedTypes] = useState<Record<string, boolean>>({});
  const [selectedSuppliers, setSelectedSuppliers] = useState<Record<string, boolean>>({});

  const [styleMode, setStyleMode] = useState<"hybrid" | "street">("hybrid");
  const [home, setHome] = useState<Position | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);

  /** Load token + data once */
  useEffect(() => {
    (async () => {
      const t = await getMapboxToken();
      setToken(t);

      const data = await loadMainData();
      setRaw(data);

      // infer keys from first feature
      const firstProps = data.features.find((f) => f.properties)?.properties ?? {};
      setRetailerKey(
        inferKey(["Retailer", "retailer", "Name", "name"], firstProps, retailerKey)
      );
      const sk = inferKey(["State", "state", "ST", "st"], firstProps, stateKey);
      setStateKey(sk);
      const tk = inferKey(
        ["Location Type", "Type", "type", "Category", "category"],
        firstProps,
        typeKey
      );
      setTypeKey(tk);
      setSupplierKey(inferKey(["Suppliers", "Supplier", "suppliers"], firstProps, supplierKey));

      // split kingpins
      const { main, kingpins } = splitKingpins(data, tk);
      setMain(main);
      setKingpins(kingpins);

      // hydrate filter lists
      const allStates = uniqueSorted(main.features.map((f) => f.properties?.[sk]));
      const allRetailers = uniqueSorted(main.features.map((f) => f.properties?.[retailerKey]));
      const allTypes = uniqueSorted(main.features.map((f) => f.properties?.[tk]));
      // suppliers aggregated from all rows
      const supList = uniqueSorted(
        main.features.flatMap((f) => parseSuppliers(f.properties?.[supplierKey]))
      );

      setStates(allStates);
      setRetailers(allRetailers);
      setTypes(allTypes);
      setSuppliers(supList);

      // select all by default
      setSelectedStates(Object.fromEntries(allStates.map((s) => [s, true])));
      setSelectedRetailers(Object.fromEntries(allRetailers.map((s) => [s, true])));
      setSelectedTypes(Object.fromEntries(allTypes.map((s) => [s, true])));
      setSelectedSuppliers(Object.fromEntries(supList.map((s) => [s, true])));
    })().catch((e) => {
      console.error(e);
      alert("Failed to load token or data. Check /public/data/* and token.txt.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Filter main points by all selections */
  const filteredMain = useMemo<FeatureCollection<Point, any>>(() => {
    if (!main || !Array.isArray(main.features)) return { type: "FeatureCollection", features: [] };

    const hasStates = Object.values(selectedStates).some(Boolean);
    const hasRetailers = Object.values(selectedRetailers).some(Boolean);
    const hasTypes = Object.values(selectedTypes).some(Boolean);
    const hasSup = Object.values(selectedSuppliers).some(Boolean);

    const features = main.features.filter((f) => {
      const p = (f.properties ?? {}) as any;

      // state
      if (hasStates) {
        const sval = String(p[stateKey] ?? "").trim();
        if (!selectedStates[sval]) return false;
      }
      // retailer
      if (hasRetailers) {
        const rval = String(p[retailerKey] ?? "").trim();
        if (!selectedRetailers[rval]) return false;
      }
      // type
      if (hasTypes) {
        const tval = String(p[typeKey] ?? "").trim();
        if (!selectedTypes[tval]) return false;
      }
      // suppliers (ANY match)
      if (hasSup) {
        const rowSuppliers = parseSuppliers(p[supplierKey]);
        if (!rowSuppliers.some((s) => selectedSuppliers[s])) return false;
      }
      return true;
    });

    return { type: "FeatureCollection", features };
  }, [
    main,
    selectedStates,
    selectedRetailers,
    selectedTypes,
    selectedSuppliers,
    stateKey,
    retailerKey,
    typeKey,
    supplierKey,
  ]);

  /** Add a stop from map click */
  const addStop = useCallback(
    (props: any, ll: mapboxgl.LngLat) => {
      const nameParts: string[] = [];
      if (props?.[retailerKey]) nameParts.push(String(props[retailerKey]));
      if (props?.City) nameParts.push(String(props.City));
      if (props?.[stateKey]) nameParts.push(String(props[stateKey]));
      const name = nameParts.join(" • ") || "Stop";
      setStops((arr) => [...arr, { name, coord: [ll.lng, ll.lat] }]);
    },
    [retailerKey, stateKey]
  );

  /** Clear trip */
  const clearTrip = useCallback(() => setStops([]), []);

  /** Basic ZIP→home setter (client-only demo; replace with real geocoder if needed) */
  const setHomeFromZip = useCallback(async (zip: string) => {
    zip = (zip || "").trim();
    if (!zip) return;
    try {
      // Lightweight: ask Mapbox geocoding if token available
      const t = token;
      if (!t) throw new Error("no token yet");
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        zip
      )}.json?types=postcode&limit=1&access_token=${t}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`geocode failed: ${res.status}`);
      const j = await res.json();
      const c = j?.features?.[0]?.center;
      if (Array.isArray(c) && c.length >= 2) setHome([Number(c[0]), Number(c[1])]);
      else alert("ZIP not found.");
    } catch (e) {
      console.warn(e);
      alert("ZIP geocoding failed.");
    }
  }, [token]);

  /** Little checkbox component */
  const CheckRow: React.FC<{
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    dotColor?: string;
  }> = ({ checked, onChange, label, dotColor }) => (
    <label className="flex items-center justify-between py-1 cursor-pointer select-none">
      <span className="flex items-center gap-2">
        {dotColor ? (
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: dotColor }} />
        ) : null}
        <span>{label}</span>
      </span>
      <input
        type="checkbox"
        className="h-4 w-4 accent-blue-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );

  // simple palette for the side legend (map has its own safe expression)
  const typeColors = useMemo<Record<string, string>>(() => {
    const base: Record<string, string> = {
      Kingpin: "#ef4444", // red (kingpins handled separately anyway)
      Distributor: "#22c55e",
      Retailer: "#60a5fa",
      Dealer: "#a78bfa",
      Branch: "#f59e0b",
      Warehouse: "#f97316",
      Office: "#84cc16",
      Other: "#94a3b8",
    };
    // fill any missing types with a pleasant blue
    const out: Record<string, string> = { ...base };
    for (const t of types) if (!out[t]) out[t] = "#60a5fa";
    return out;
  }, [types]);

  return (
    <div className="pane-grid">
      {/* LEFT SIDEBAR */}
      <aside className="pane-left">
        <div className="card">
          <div className="card-header">
            <img src={withBasePath("/certis-logo.png")} alt="Certis" style={{ height: 32 }} />
          </div>
          <div className="card-body">
            <div className="mb-3">
              <div className="text-sm font-medium opacity-80 mb-1">Base Map</div>
              <div className="flex gap-2">
                <button
                  className={`chip ${styleMode === "hybrid" ? "chip-active" : ""}`}
                  onClick={() => setStyleMode("hybrid")}
                >
                  Hybrid
                </button>
                <button
                  className={`chip ${styleMode === "street" ? "chip-active" : ""}`}
                  onClick={() => setStyleMode("street")}
                >
                  Street
                </button>
              </div>
            </div>

            <div className="mb-3">
              <div className="text-sm font-medium opacity-80 mb-1">Home (ZIP)</div>
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="ZIP (e.g., 21114)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = (e.target as HTMLInputElement).value;
                      setHomeFromZip(v);
                    }
                  }}
                />
                <button
                  className="btn"
                  onClick={() => {
                    const el = document.querySelector<HTMLInputElement>("input[placeholder^='ZIP']");
                    if (el?.value) setHomeFromZip(el.value);
                  }}
                >
                  Set
                </button>
              </div>
            </div>

            <div className="mb-3">
              <div className="text-sm font-medium opacity-80 mb-1">Types</div>
              <div className="divide-y divide-[#203246] rounded-lg border border-[#203246]">
                {types.map((t) => (
                  <CheckRow
                    key={t}
                    checked={!!selectedTypes[t]}
                    onChange={(v) => setSelectedTypes((m) => ({ ...m, [t]: v }))}
                    label={t}
                    dotColor={typeColors[t]}
                  />
                ))}
              </div>
            </div>

            <div className="mb-3">
              <div className="text-sm font-medium opacity-80 mb-1">States</div>
              <div className="divide-y divide-[#203246] rounded-lg border border-[#203246] max-h-48 overflow-auto pr-1">
                {states.map((t) => (
                  <CheckRow
                    key={t}
                    checked={!!selectedStates[t]}
                    onChange={(v) => setSelectedStates((m) => ({ ...m, [t]: v }))}
                    label={t}
                  />
                ))}
              </div>
            </div>

            <div className="mb-3">
              <div className="text-sm font-medium opacity-80 mb-1">Retailers</div>
              <div className="divide-y divide-[#203246] rounded-lg border border-[#203246] max-h-48 overflow-auto pr-1">
                {retailers.map((t) => (
                  <CheckRow
                    key={t}
                    checked={!!selectedRetailers[t]}
                    onChange={(v) => setSelectedRetailers((m) => ({ ...m, [t]: v }))}
                    label={t}
                  />
                ))}
              </div>
            </div>

            <div className="mb-3">
              <div className="text-sm font-medium opacity-80 mb-1">Suppliers</div>
              <div className="divide-y divide-[#203246] rounded-lg border border-[#203246] max-h-48 overflow-auto pr-1">
                {suppliers.map((t) => (
                  <CheckRow
                    key={t}
                    checked={!!selectedSuppliers[t]}
                    onChange={(v) => setSelectedSuppliers((m) => ({ ...m, [t]: v }))}
                    label={t}
                  />
                ))}
              </div>
            </div>

            <div className="mb-3">
              <div className="text-sm font-medium opacity-80 mb-1">Trip</div>
              <div className="space-y-1">
                {stops.length === 0 ? (
                  <div className="text-xs opacity-70">Click points on the map to add stops.</div>
                ) : (
                  stops.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="truncate">{s.name}</span>
                      <button
                        className="text-xs opacity-70 hover:opacity-100"
                        onClick={() =>
                          setStops((arr) => arr.filter((_, idx) => idx !== i))
                        }
                      >
                        remove
                      </button>
                    </div>
                  ))
                )}
                {stops.length > 0 && (
                  <button className="btn w-full" onClick={clearTrip}>
                    Clear trip
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* MAP SIDE */}
      <section className="pane-right">
        <div className="card" style={{ height: "100%" }}>
          <div className="card-header flex items-center justify-between">
            <div className="font-medium opacity-80">Retailer Map</div>
            <div className="text-xs opacity-70">
              {filteredMain.features.length} / {main.features.length} visible
              {kingpins.features.length > 0 ? ` • ${kingpins.features.length} KINGPINs` : ""}
            </div>
          </div>
          <div className="card-body" style={{ height: "calc(100% - 56px)", padding: 0 }}>
            <div style={{ height: "100%", width: "100%" }}>
              <CertisMap
                token={token}
                main={filteredMain}
                kingpins={kingpins}
                home={home}
                typeKey={typeKey}
                mapStyle={styleMode}
                onPointClick={addStop}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
