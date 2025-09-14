"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import CertisMap from "@/components/CertisMap";
import * as Route from "@/utils/routing";
import { withBasePath } from "@/utils/paths";

// ------------------------------
// Types & helpers
// ------------------------------
type FC = FeatureCollection<Geometry, Record<string, any>>;

function toFC(features: Feature<Geometry, any>[]): FC {
  return { type: "FeatureCollection", features };
}

function getProp<T = string>(
  props: Record<string, any> | undefined,
  keys: string[],
  fallback: T | "" = "" as any
): T | "" {
  if (!props) return fallback;
  for (const k of keys) {
    if (props[k] != null && props[k] !== "") return props[k] as T;
  }
  return fallback;
}

function isKingpin(f: Feature<Geometry, any>): boolean {
  const p = f.properties || {};
  const tag = String(
    getProp(p, ["kingpin", "KINGPIN", "Kingpin", "isKingpin", "IsKingpin", "IsKINGPIN"], "")
  )
    .toLowerCase()
    .trim();
  const typeVal = String(getProp(p, ["type", "Type", "locationType", "LocationType"], "")).toLowerCase();
  return tag === "true" || tag === "1" || typeVal === "kingpin";
}

function splitKingpins(fc: FC): { main: FC; kingpins: FC } {
  const kings: Feature<Geometry, any>[] = [];
  const rest: Feature<Geometry, any>[] = [];
  for (const f of fc.features) (isKingpin(f) ? kings : rest).push(f);
  return { main: toFC(rest), kingpins: toFC(kings) };
}

function inferKeysFromFirst(features: Feature<Geometry, any>[]) {
  // try to detect common keys (case-insensitive variants)
  const sample = (features.find((f) => f.properties) || { properties: {} }).properties || {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(sample, k);
  const stateKey = has("state")
    ? "state"
    : has("State")
    ? "State"
    : has("STATE")
    ? "STATE"
    : "state";
  const retailerKey = has("retailer")
    ? "retailer"
    : has("Retailer")
    ? "Retailer"
    : "retailer";
  const typeKey = has("type") ? "type" : has("Type") ? "Type" : "type";
  const suppliersKey = has("Supplier(s)")
    ? "Supplier(s)"
    : has("Suppliers")
    ? "Suppliers"
    : has("suppliers")
    ? "suppliers"
    : "Supplier(s)";
  return { stateKey, retailerKey, typeKey, suppliersKey };
}

async function fetchFirst(paths: string[]): Promise<FC | null> {
  for (const p of paths) {
    try {
      const r = await fetch(p, { cache: "no-store" });
      if (!r.ok) continue;
      const json = await r.json();
      if (json && json.type === "FeatureCollection" && Array.isArray(json.features)) {
        return json as FC;
      }
    } catch {}
  }
  return null;
}

// ------------------------------
// Page
// ------------------------------
export default function Page() {
  // data
  const [rawMain, setRawMain] = useState<FC | null>(null);
  const [rawKingpins, setRawKingpins] = useState<FC>(toFC([]));

  // inferred property keys
  const [keys, setKeys] = useState({
    stateKey: "state",
    retailerKey: "retailer",
    typeKey: "type",
    suppliersKey: "Supplier(s)",
  });

  // filter options & selections
  const [allStates, setAllStates] = useState<string[]>([]);
  const [allRetailers, setAllRetailers] = useState<string[]>([]);
  const [allTypes, setAllTypes] = useState<string[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<string[]>([]);

  const [selStates, setSelStates] = useState<Set<string>>(new Set());
  const [selRetailers, setSelRetailers] = useState<Set<string>>(new Set());
  const [selTypes, setSelTypes] = useState<Set<string>>(new Set());
  const [selSuppliers, setSelSuppliers] = useState<Set<string>>(new Set());

  // UI bits
  const [mapStyle, setMapStyle] = useState<"hybrid" | "street">("hybrid");
  const [zip, setZip] = useState("");
  const [home, setHome] = useState<Position | null>(null);
  const [roundTrip, setRoundTrip] = useState(true);

  type Stop = { name: string; coord: [number, number] };
  const [stops, setStops] = useState<Stop[]>([]);
  const [optimized, setOptimized] = useState<Stop[]>([]);

  // ------------------------------
  // Load dataset (robust path fallback)
  // ------------------------------
  useEffect(() => {
    (async () => {
      const candidates = [
        "/data/retailers.geojson",
        "/retailers.geojson",
        "/data/retailers.json",
        "/retailers.json",
        "/data/data.geojson",
        "/data/data.json",
      ].map(withBasePath);

      const fc = await fetchFirst(candidates);
      if (!fc) {
        console.warn("No dataset found at", candidates);
        setRawMain(toFC([]));
        setRawKingpins(toFC([]));
        return;
      }
      const { main, kingpins } = splitKingpins(fc);
      setRawMain(main);
      setRawKingpins(kingpins);

      const inferred = inferKeysFromFirst(main.features);
      setKeys(inferred);

      // hydrate filter options
      const states = new Set<string>();
      const retailers = new Set<string>();
      const types = new Set<string>();
      const suppliers = new Set<string>();

      for (const f of main.features) {
        const p = f.properties || {};
        const s = getProp<string>(p, [inferred.stateKey], "");
        const r = getProp<string>(p, [inferred.retailerKey], "");
        const t = getProp<string>(p, [inferred.typeKey], "");
        const sup = getProp<string>(p, [inferred.suppliersKey], "");
        if (s) states.add(s);
        if (r) retailers.add(r);
        if (t) types.add(t);
        if (sup) {
          // suppliers may be semi-colon or comma separated
          sup
            .split(/[;,]/g)
            .map((x) => x.trim())
            .filter(Boolean)
            .forEach((x) => suppliers.add(x));
        }
      }

      const sortAsc = (a: string, b: string) => a.localeCompare(b);
      const st = Array.from(states).sort(sortAsc);
      const rt = Array.from(retailers).sort(sortAsc);
      const tt = Array.from(types).sort(sortAsc);
      const sp = Array.from(suppliers).sort(sortAsc);

      setAllStates(st);
      setAllRetailers(rt);
      setAllTypes(tt);
      setAllSuppliers(sp);

      // default select all
      setSelStates(new Set(st));
      setSelRetailers(new Set(rt));
      setSelTypes(new Set(tt));
      setSelSuppliers(new Set(sp));
    })();
  }, []);

  // ------------------------------
  // Filtering
  // ------------------------------
  const filteredFc: FC = useMemo(() => {
    if (!rawMain) return toFC([]);
    const { stateKey, retailerKey, typeKey, suppliersKey } = keys;

    const keep = (f: Feature<Geometry, any>) => {
      const p = f.properties || {};
      const s = String(getProp(p, [stateKey], "") || "");
      const r = String(getProp(p, [retailerKey], "") || "");
      const t = String(getProp(p, [typeKey], "") || "");
      const supRaw = String(getProp(p, [suppliersKey], "") || "");
      const supList = supRaw
        ? supRaw
            .split(/[;,]/g)
            .map((x) => x.trim())
            .filter(Boolean)
        : [];

      if (!selStates.has(s)) return false;
      if (!selRetailers.has(r)) return false;
      if (!selTypes.has(t)) return false;
      if (selSuppliers.size > 0) {
        if (supList.length === 0) return false;
        // at least one supplier selected must be present
        let ok = false;
        for (const su of supList) if (selSuppliers.has(su)) { ok = true; break; }
        if (!ok) return false;
      }
      return true;
    };

    return toFC(rawMain.features.filter(keep));
  }, [rawMain, keys, selStates, selRetailers, selTypes, selSuppliers]);

  // ------------------------------
  // ZIP -> home geocode (Mapbox)
  // ------------------------------
  const geocodeZip = useCallback(async () => {
    const z = zip.trim();
    if (!z) return;
    const token =
      process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
      (typeof window !== "undefined" ? localStorage.getItem("MAPBOX_TOKEN") || "" : "");
    if (!token) {
      console.warn("No Mapbox token; cannot geocode ZIP");
      return;
    }
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        z
      )}.json?types=postcode&limit=1&access_token=${token}`;
      const r = await fetch(url);
      const j = await r.json();
      const c = j?.features?.[0]?.center;
      if (Array.isArray(c) && c.length >= 2) {
        setHome([Number(c[0]), Number(c[1])]);
      } else {
        console.warn("ZIP not found");
      }
    } catch (e) {
      console.warn("Geocode failed", e);
    }
  }, [zip]);

  // ------------------------------
  // Trip building & optimization
  // ------------------------------
  const addStop = useCallback((props: any, coord: mapboxgl.LngLat) => {
    const name =
      props?.retailer ?? props?.Retailer ?? props?.name ?? props?.Name ?? "Location";
    const stop: Stop = { name: String(name), coord: [coord.lng, coord.lat] };
    setStops((prev) => [...prev, stop]);
  }, []);

  const clearStops = useCallback(() => {
    setStops([]);
    setOptimized([]);
  }, []);

  // Nearest-neighbor + 2-opt (fast, decent)
  const optimize = useCallback(() => {
    const pts = [...stops];
    if (pts.length <= 2) {
      setOptimized(pts);
      return;
    }

    // seed origin: home if set, otherwise first stop
    const origin: [number, number] | null = home ?? pts[0]?.coord ?? null;
    if (!origin) {
      setOptimized(pts);
      return;
    }

    const dist = (a: [number, number], b: [number, number]) => {
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      return Math.hypot(dx, dy);
    };

    // nearest neighbor order starting at origin
    const remaining = pts.slice();
    const ordered: Stop[] = [];
    let current = origin;
    while (remaining.length) {
      let bestIdx = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < remaining.length; i++) {
        const d = dist(current, remaining[i].coord);
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      ordered.push(next);
      current = next.coord;
    }

    // 2-opt improvement
    const twoOpt = (arr: Stop[]) => {
      const n = arr.length;
      if (n < 4) return arr;
      let improved = true;
      const pathDist = (list: Stop[]) => {
        let d = 0;
        let prev = origin;
        for (const s of list) {
          d += dist(prev!, s.coord);
          prev = s.coord;
        }
        if (roundTrip && origin) d += dist(prev!, origin);
        return d;
      };

      let best = arr.slice();
      let bestScore = pathDist(best);

      while (improved) {
        improved = false;
        for (let i = 0; i < n - 1; i++) {
          for (let k = i + 1; k < n; k++) {
            const candidate = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
            const score = pathDist(candidate);
            if (score + 1e-9 < bestScore) {
              best = candidate;
              bestScore = score;
              improved = true;
            }
          }
        }
      }
      return best;
    };

    setOptimized(twoOpt(ordered));
  }, [stops, home, roundTrip]);

  // Links
  const googleHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin = home ? `${home[1]},${home[0]}` : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildGoogleMapsLink(origin, optimized.map((s) => s.coord), { roundTrip });
  }, [optimized, home, roundTrip]);

  const appleHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin = home ? `${home[1]},${home[0]}` : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildAppleMapsLink(origin, optimized.map((s) => s.coord), { roundTrip });
  }, [optimized, home, roundTrip]);

  const wazeHref = useMemo(() => {
    if (optimized.length === 0) return "";
    const origin = home ? `${home[1]},${home[0]}` : `${optimized[0].coord[1]},${optimized[0].coord[0]}`;
    return Route.buildWazeLink(origin, optimized.map((s) => s.coord), { roundTrip });
  }, [optimized, home, roundTrip]);

  // ------------------------------
  // UI helpers
  // ------------------------------
  const toggleInSet = (val: string, set: Set<string>, setState: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setState(next);
  };

  // ------------------------------
  // Render
  // ------------------------------
  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: "340px 1fr",
        gap: "12px",
        height: "100dvh",
        padding: "12px",
        boxSizing: "border-box",
        background: "#0b1620",
        color: "#e6edf3",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 0,
        }}
      >
        {/* CERTIS logo above ZIP */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img
            src={withBasePath("/certis-logo.png")}
            alt="CERTIS"
            style={{ height: 28, width: "auto", filter: "drop-shadow(0 1px 1px rgba(0,0,0,.6))" }}
          />
        </div>

        {/* ZIP + Home */}
        <div
          style={{
            background: "#0f2230",
            border: "1px solid #0f3140",
            borderRadius: 10,
            padding: 10,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Home (ZIP)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="e.g. 60601"
              inputMode="numeric"
              style={{
                flex: 1,
                background: "#07141d",
                border: "1px solid #103040",
                color: "#e6edf3",
                padding: "6px 8px",
                borderRadius: 8,
              }}
            />
            <button
              onClick={geocodeZip}
              style={{
                background: "#1a91ff",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "6px 10px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Set
            </button>
          </div>
        </div>

        {/* Filters */}
        <div
          style={{
            background: "#0f2230",
            border: "1px solid #0f3140",
            borderRadius: 10,
            padding: 10,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 700 }}>Map Style</div>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                checked={mapStyle === "hybrid"}
                onChange={() => setMapStyle("hybrid")}
              />
              Hybrid
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                checked={mapStyle === "street"}
                onChange={() => setMapStyle("street")}
              />
              Street
            </label>
          </div>

          <hr style={{ border: "none", borderTop: "1px solid #0f3140", margin: "8px 0" }} />

          <div style={{ fontWeight: 700 }}>States ({selStates.size}/{allStates.length})</div>
          <div style={{ display: "grid", gap: 6 }}>
            {allStates.map((s) => (
              <label key={s} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={selStates.has(s)}
                  onChange={() => toggleInSet(s, selStates, setSelStates)}
                />
                <span>{s}</span>
              </label>
            ))}
          </div>

          <div style={{ fontWeight: 700, marginTop: 8 }}>
            Retailers ({selRetailers.size}/{allRetailers.length})
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {allRetailers.map((r) => (
              <label key={r} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={selRetailers.has(r)}
                  onChange={() => toggleInSet(r, selRetailers, setSelRetailers)}
                />
                <span>{r}</span>
              </label>
            ))}
          </div>

          <div style={{ fontWeight: 700, marginTop: 8 }}>
            Location Types ({selTypes.size}/{allTypes.length})
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {allTypes.map((t) => (
              <label key={t} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={selTypes.has(t)}
                  onChange={() => toggleInSet(t, selTypes, setSelTypes)}
                />
                <span>{t}</span>
              </label>
            ))}
          </div>

          <div style={{ fontWeight: 700, marginTop: 8 }}>
            Suppliers ({selSuppliers.size}/{allSuppliers.length})
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {allSuppliers.map((sp) => (
              <label key={sp} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={selSuppliers.has(sp)}
                  onChange={() => toggleInSet(sp, selSuppliers, setSelSuppliers)}
                />
                <span>{sp}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Trip builder */}
        <div
          style={{
            background: "#0f2230",
            border: "1px solid #0f3140",
            borderRadius: 10,
            padding: 10,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 700 }}>Trip</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={optimize}
              style={{
                background: "#23c38e",
                color: "#03161d",
                border: "none",
                borderRadius: 8,
                padding: "6px 10px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Optimize
            </button>
            <button
              onClick={clearStops}
              style={{
                background: "transparent",
                color: "#e6edf3",
                border: "1px solid #33515f",
                borderRadius: 8,
                padding: "6px 10px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
            <label style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={roundTrip}
                onChange={(e) => setRoundTrip(e.target.checked)}
              />
              Round trip
            </label>
          </div>
          <div
            style={{
              maxHeight: 150,
              overflow: "auto",
              background: "#081721",
              border: "1px solid #0f3140",
              borderRadius: 8,
              padding: 8,
            }}
          >
            {stops.length === 0 ? (
              <div style={{ opacity: 0.7 }}>Click points on the map to add stops…</div>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 16 }}>
                {stops.map((s, i) => (
                  <li key={`${s.name}-${i}`}>{s.name}</li>
                ))}
              </ol>
            )}
          </div>
          {optimized.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href={googleHref}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "#fff",
                  color: "#0b1620",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Open in Google
              </a>
              <a
                href={appleHref}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "#000",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Open in Apple
              </a>
              <a
                href={wazeHref}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "#33ccff",
                  color: "#002431",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Open in Waze
              </a>
            </div>
          )}
        </div>
      </aside>

      {/* Map card */}
      <section
        style={{
          background: "#0f2230",
          border: "1px solid #0f3140",
          borderRadius: 10,
          minHeight: 0,
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", inset: 10, borderRadius: 8, overflow: "hidden" }}>
          <CertisMap
            data={filteredFc}
            kingpins={rawKingpins}
            home={home}
            // legacy two-arg signature — matches CertisMap
            onPointClick={addStop as any}
            mapStyle={mapStyle}
          />
        </div>
      </section>
    </main>
  );
}
