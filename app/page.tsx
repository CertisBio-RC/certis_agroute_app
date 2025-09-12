"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ===== ENV HELPERS ===== */
const getBasePath = () =>
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BASE_PATH) || "";
const getToken = () =>
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
      process.env.MAPBOX_PUBLIC_TOKEN)) ||
  "";

/* ===== TYPES ===== */
type Feature = {
  type: "Feature";
  geometry: { type: string; coordinates?: any };
  properties: Record<string, any>;
};
type FC = { type: "FeatureCollection"; features: Feature[] };

const SKEYS = ["state", "State", "STATE"];
const RKEYS = ["retailer", "Retailer", "RETAILER"];
const CKEYS = ["category", "Category", "CATEGORY"];

const gp = (obj: any, keys: string[]) => {
  for (const k of keys) if (obj && obj[k] != null) return obj[k];
  return undefined;
};
const slug = (s: string) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

/* ===== SANITIZERS ===== */
function isValidLngLat(coords: any): coords is [number, number] {
  return (
    Array.isArray(coords) &&
    coords.length === 2 &&
    Number.isFinite(coords[0]) &&
    Number.isFinite(coords[1]) &&
    coords[0] >= -180 &&
    coords[0] <= 180 &&
    coords[1] >= -90 &&
    coords[1] <= 90
  );
}

/* ===== Mapbox (lazy) ===== */
let mapboxgl: any;

export default function Page() {
  const BASE_PATH = useMemo(getBasePath, []);
  const MAPBOX_TOKEN = useMemo(getToken, []);

  /* ---------- UI STATE ---------- */
  const [basemap, setBasemap] = useState<"hybrid" | "streets">("hybrid");
  const [markerStyle, setMarkerStyle] = useState<"dots" | "logos">("dots"); // default to dots
  const [stateF, setStateF] = useState("All");
  const [retailerF, setRetailerF] = useState("All");
  const [categoryF, setCategoryF] = useState("All");

  /* ---------- DATA ---------- */
  const [raw, setRaw] = useState<FC | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dataUrl = useMemo(() => {
    const v = `v=${Date.now()}`; // GH Pages cache-buster
    const path = `${BASE_PATH}/data/retailers.geojson`;
    return path.includes("?") ? `${path}&${v}` : `${path}?${v}`;
  }, [BASE_PATH]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetch(dataUrl)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Retailers fetch failed: ${r.status}`);
        const j = (await r.json()) as FC;
        if (!cancelled) setRaw(j);
      })
      .catch((e) => !cancelled && setLoadError(e?.message || "Fetch error"));
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  // Normalize + sanitize + filter + option lists + bbox
  const { filtered, states, retailers, categories, bbox, skipped } = useMemo(() => {
    const out: FC = { type: "FeatureCollection", features: [] };
    const S = new Set<string>(), R = new Set<string>(), C = new Set<string>();
    const bb = { minX: 180, minY: 90, maxX: -180, maxY: -90 };
    let skipped = 0;

    for (const f of raw?.features ?? []) {
      if (!f || !f.geometry || f.geometry.type !== "Point" || !isValidLngLat(f.geometry.coordinates)) {
        skipped++;
        continue;
      }

      const st = String(gp(f.properties, SKEYS) ?? "").trim();
      const rt = String(gp(f.properties, RKEYS) ?? "").trim();
      const ct = String(gp(f.properties, CKEYS) ?? "").trim();

      if (st) S.add(st);
      if (rt) R.add(rt);
      if (ct) C.add(ct);

      if (
        (stateF === "All" || st === stateF) &&
        (retailerF === "All" || rt === retailerF) &&
        (categoryF === "All" || ct === categoryF)
      ) {
        const iconId = `logo-${slug(rt || "unknown")}`;
        const [x, y] = f.geometry.coordinates as [number, number];

        out.features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [x, y] },
          properties: {
            ...f.properties,
            __state: st,
            __retailer: rt || "Unknown",
            __category: ct,
            __icon: iconId,
          },
        });

        if (x < bb.minX) bb.minX = x;
        if (y < bb.minY) bb.minY = y;
        if (x > bb.maxX) bb.maxX = x;
        if (y > bb.maxY) bb.maxY = y;
      }
    }

    const sorted = (s: Set<string>) => ["All", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
    const bbox =
      out.features.length > 0
        ? ([bb.minX, bb.minY, bb.maxX, bb.maxY] as [number, number, number, number])
        : null;

    return {
      filtered: out,
      states: sorted(S),
      retailers: sorted(R),
      categories: sorted(C),
      bbox,
      skipped,
    };
  }, [raw, stateF, retailerF, categoryF]);

  /* ---------- MAP ---------- */
  const mapRef = useRef<any>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);

  // Helper: ensure source + layers exist, or update them safely
  const ensureLayers = (map: any) => {
    // Lock projection to FLAT
    try {
      if (map.getProjection?.().name !== "mercator") map.setProjection?.("mercator");
    } catch {}

    if (!map.getSource("retailers")) {
      map.addSource("retailers", {
        type: "geojson",
        data: filtered as any,
        cluster: true,
        clusterRadius: 40,
        clusterMaxZoom: 11,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "retailers",
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": ["step", ["get", "point_count"], 14, 25, 20, 100, 28],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-color": ["step", ["get", "point_count"], "#5B8DEF", 25, "#3FB07C", 100, "#F28B2E"],
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "retailers",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "retailers",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-color": "#1C7CFF",
        },
      });

      map.addLayer({
        id: "unclustered-logo",
        type: "symbol",
        source: "retailers",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": ["get", "__icon"],
          "icon-size": 0.5,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "visibility": "none", // hidden unless markerStyle === 'logos'
        },
      });

      // Cursor UX
      const p = () => (map.getCanvas().style.cursor = "pointer");
      const d = () => (map.getCanvas().style.cursor = "");
      map.on("mouseenter", "clusters", p);
      map.on("mouseleave", "clusters", d);
      map.on("mouseenter", "unclustered-point", p);
      map.on("mouseleave", "unclustered-point", d);
      map.on("mouseenter", "unclustered-logo", p);
      map.on("mouseleave", "unclustered-logo", d);
    } else {
      (map.getSource("retailers") as any).setData(filtered as any);
    }

    // Toggle unclustered visibility
    map.setLayoutProperty("unclustered-point", "visibility", markerStyle === "dots" ? "visible" : "none");
    map.setLayoutProperty("unclustered-logo", "visibility", markerStyle === "logos" ? "visible" : "none");
  };

  // Create / recreate map when style inputs change
  useEffect(() => {
    (async () => {
      const mod = await import("mapbox-gl");
      mapboxgl = mod.default || (mod as any);
      const hasToken = !!MAPBOX_TOKEN;
      if (hasToken) mapboxgl.accessToken = MAPBOX_TOKEN;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const style = hasToken
        ? basemap === "hybrid"
          ? "mapbox://styles/mapbox/satellite-streets-v12"
          : "mapbox://styles/mapbox/streets-v12"
        : {
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: [
                  "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
                ],
                tileSize: 256,
                attribution: "© OpenStreetMap contributors",
              },
            },
            layers: [{ id: "osm", type: "raster", source: "osm" }],
          };

      const map = new mapboxgl.Map({
        container: mapEl.current as HTMLDivElement,
        style,
        center: [-96.7, 41.5],
        zoom: 5,
        cooperativeGestures: true,
        attributionControl: true,
        projection: "mercator",
      });
      mapRef.current = map;

      map.on("load", () => {
        ensureLayers(map);
        if (bbox) {
          map.fitBounds(
            [
              [bbox[0], bbox[1]],
              [bbox[2], bbox[3]],
            ],
            { padding: 40, duration: 0 }
          );
        }
      });
      map.on("style.load", () => ensureLayers(map));
    })();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [MAPBOX_TOKEN, basemap, markerStyle]); // filtered handled below

  // Update source and visibility on data/style toggles without recreating the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    ensureLayers(map);
  }, [filtered, markerStyle]);

  // Load retailer logos only when needed (png → jpg fallback)
  useEffect(() => {
    if (markerStyle !== "logos") return;
    const map = mapRef.current;
    if (!map) return;

    for (const f of filtered.features) {
      const r = String(gp(f.properties, ["__retailer"]) || "");
      const id = String(gp(f.properties, ["__icon"]) || "");
      if (!r || !id || map.hasImage(id)) continue;

      const base = `${BASE_PATH}/icons/${r} Logo`;
      const tryAdd = (url: string, next?: () => void) =>
        map.loadImage(url, (err: any, img: any) => {
          if (!err && img) {
            if (!map.hasImage(id)) map.addImage(id, img, { sdf: false });
          } else if (next) next();
        });
      tryAdd(`${base}.png`, () => tryAdd(`${base}.jpg`));
    }
  }, [filtered, markerStyle, BASE_PATH]);

  const shown = filtered.features.length;

  /* =======================
     LOCKED 2-COLUMN GRID
     ======================= */
  return (
    <div
      className="h-[100dvh] grid bg-neutral-900 text-neutral-100"
      style={{ gridTemplateColumns: "360px 1fr" }}
    >
      {/* LEFT: SIDEBAR */}
      <aside className="h-full min-h-0 overflow-auto border-r border-neutral-800 p-4">
        {/* Header with BASE_PATH-prefixed logo (with jpg fallback) */}
        <div className="flex items-center gap-3 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${BASE_PATH}/certis-logo.png?v=4`}
            alt="Certis"
            className="h-6 w-auto object-contain"
            onError={(e) => {
              const t = e.currentTarget as HTMLImageElement;
              if (!t.dataset.fb) {
                t.dataset.fb = "1";
                t.src = `${BASE_PATH}/certis-logo.jpg?v=4`;
              }
            }}
          />
          <a href={`${BASE_PATH}/`} className="text-sm opacity-75 hover:opacity-100">
            Home
          </a>
        </div>

        <h1 className="text-2xl font-semibold mb-1">Certis AgRoute Planner</h1>
        <p className="text-xs opacity-70 mb-4">
          Filter retailers and visualize routes. Dbl-click map to set Home.
        </p>

        {/* FILTERS */}
        <section className="rounded-2xl bg-neutral-800 p-3 mb-4">
          <h2 className="text-sm font-semibold mb-2">Filters</h2>

          <label className="text-xs opacity-80">State</label>
          <select
            className="w-full mt-1 mb-2 bg-neutral-900 rounded px-3 py-2 outline-none"
            value={stateF}
            onChange={(e) => setStateF(e.target.value)}
          >
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <label className="text-xs opacity-80">Retailer</label>
          <select
            className="w-full mt-1 mb-2 bg-neutral-900 rounded px-3 py-2 outline-none"
            value={retailerF}
            onChange={(e) => setRetailerF(e.target.value)}
          >
            {retailers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <label className="text-xs opacity-80">Category</label>
          <select
            className="w-full mt-1 mb-2 bg-neutral-900 rounded px-3 py-2 outline-none"
            value={categoryF}
            onChange={(e) => setCategoryF(e.target.value)}
          >
            {categories.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 mt-1">
            <button
              className="px-3 py-2 rounded bg-sky-600 hover:bg-sky-500"
              onClick={() => {
                setStateF("All");
                setRetailerF("All");
                setCategoryF("All");
              }}
            >
              Clear Filters
            </button>
            <span className="text-xs opacity-75">{shown} shown</span>
            {skipped > 0 && (
              <span className="text-[11px] opacity-60">({skipped} skipped: invalid geometry)</span>
            )}
          </div>
        </section>

        {/* MAP OPTIONS */}
        <section className="rounded-2xl bg-neutral-800 p-3">
          <h2 className="text-sm font-semibold mb-2">Map Options</h2>

          <label className="text-xs opacity-80">Basemap</label>
          <select
            className="w-full mt-1 mb-2 bg-neutral-900 rounded px-3 py-2 outline-none"
            value={basemap}
            onChange={(e) => setBasemap(e.target.value as any)}
            disabled={!MAPBOX_TOKEN}
            title={MAPBOX_TOKEN ? "" : "Mapbox token missing — using OSM fallback"}
          >
            <option value="hybrid">Hybrid</option>
            <option value="streets">Streets</option>
          </select>

          <label className="text-xs opacity-80">Markers</label>
          <select
            className="w-full mt-1 bg-neutral-900 rounded px-3 py-2 outline-none"
            value={markerStyle}
            onChange={(e) => setMarkerStyle(e.target.value as any)}
          >
            <option value="dots">Colored dots</option>
            <option value="logos">Retailer logos</option>
          </select>

          <p className="text-[11px] opacity-60 mt-3">
            Token detected: <b>{MAPBOX_TOKEN ? "yes" : "no (OSM fallback)"}</b>
            <br />
            Data path: <code>{BASE_PATH}/data/retailers.geojson</code>
          </p>

          {loadError && <p className="text-xs text-red-400 mt-2">Error: {loadError}</p>}
        </section>
      </aside>

      {/* RIGHT: MAP */}
      <main className="relative h-full min-h-0">
        <div ref={mapEl} className="absolute inset-0 rounded-xl overflow-hidden" />
      </main>
    </div>
  );
}
