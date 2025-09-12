"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ========= Helpers ========= */
const getBasePath = () =>
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BASE_PATH) || "";

const getToken = () =>
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
      process.env.MAPBOX_PUBLIC_TOKEN)) ||
  "";

/* ========= Types ========= */
type Feature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, any>;
};
type FC = { type: "FeatureCollection"; features: Feature[] };

const SKEYS = ["state", "State", "STATE"];
const RKEYS = ["retailer", "Retailer", "RETAILER"];
const CKEYS = ["category", "Category", "CATEGORY"];

const getProp = (obj: any, keys: string[]) => {
  for (const k of keys) if (obj?.[k] != null) return obj[k];
  return undefined;
};
const slug = (s: string) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

/* ========= Mapbox (lazy) ========= */
let mapboxgl: any;

/* ========= Page ========= */
export default function Page() {
  const BASE_PATH = useMemo(getBasePath, []);
  const MAPBOX_TOKEN = useMemo(getToken, []);

  const mapRef = useRef<any>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);

  // UI state
  const [basemap, setBasemap] = useState<"hybrid" | "streets">("hybrid");
  const [markerStyle, setMarkerStyle] = useState<"logos" | "dots">("logos");

  // Filters
  const [stateF, setStateF] = useState("All");
  const [retailerF, setRetailerF] = useState("All");
  const [categoryF, setCategoryF] = useState("All");

  // Data
  const [raw, setRaw] = useState<FC | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dataUrl = useMemo(() => {
    const v = `v=${Date.now()}`;
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

  // Normalize + filter + options
  const { filtered, states, retailers, categories } = useMemo(() => {
    const out: FC = { type: "FeatureCollection", features: [] };
    const S = new Set<string>();
    const R = new Set<string>();
    const C = new Set<string>();

    if (raw?.features?.length) {
      for (const f of raw.features) {
        const st = String(getProp(f.properties, SKEYS) ?? "").trim();
        const rt = String(getProp(f.properties, RKEYS) ?? "").trim();
        const ct = String(getProp(f.properties, CKEYS) ?? "").trim();

        if (st) S.add(st);
        if (rt) R.add(rt);
        if (ct) C.add(ct);

        if (
          (stateF === "All" || st === stateF) &&
          (retailerF === "All" || rt === retailerF) &&
          (categoryF === "All" || ct === categoryF)
        ) {
          const iconId = `logo-${slug(rt || "unknown")}`;
          out.features.push({
            ...f,
            properties: {
              ...f.properties,
              __state: st,
              __retailer: rt || "Unknown",
              __category: ct,
              __icon: iconId,
            },
          });
        }
      }
    }

    const sorted = (s: Set<string>) => ["All", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
    return {
      filtered: out,
      states: sorted(S),
      retailers: sorted(R),
      categories: sorted(C),
    };
  }, [raw, stateF, retailerF, categoryF]);

  // Init / re-init map on style inputs
  useEffect(() => {
    (async () => {
      const mod = await import("mapbox-gl");
      mapboxgl = mod.default || (mod as any);

      const hasToken = !!MAPBOX_TOKEN;
      if (hasToken) mapboxgl.accessToken = MAPBOX_TOKEN;

      // Remove any previous instance
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
      });
      mapRef.current = map;

      const addOrUpdateLayers = () => {
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
            },
          });

          // basic UX
          map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
          map.on("mouseenter", "unclustered-point", () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "unclustered-point", () => (map.getCanvas().style.cursor = ""));
          map.on("mouseenter", "unclustered-logo", () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "unclustered-logo", () => (map.getCanvas().style.cursor = ""));
        } else {
          (map.getSource("retailers") as any).setData(filtered as any);
        }

        // honor marker style choice
        map.setLayoutProperty("unclustered-point", "visibility", markerStyle === "dots" ? "visible" : "none");
        map.setLayoutProperty("unclustered-logo", "visibility", markerStyle === "logos" ? "visible" : "none");
      };

      map.on("load", addOrUpdateLayers);
      map.on("style.load", addOrUpdateLayers);
    })();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [MAPBOX_TOKEN, basemap, markerStyle, filtered]);

  // Keep source up to date when filters change (without recreating map)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource?.("retailers");
    if (src) (src as any).setData(filtered as any);
  }, [filtered]);

  // Load retailer logo images into the style (png → jpg fallback)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const added = new Set<string>();

    for (const f of filtered.features) {
      const retailer = String(getProp(f.properties, ["__retailer"]) || "");
      const iconId = String(getProp(f.properties, ["__icon"]) || "");
      if (!retailer || !iconId || added.has(iconId) || map.hasImage(iconId)) continue;

      const base = `${BASE_PATH}/icons/${retailer} Logo`;
      const tryAdd = (url: string, next?: () => void) => {
        map.loadImage(url, (err: any, img: any) => {
          if (!err && img) {
            if (!map.hasImage(iconId)) map.addImage(iconId, img, { sdf: false });
            added.add(iconId);
          } else if (next) {
            next();
          }
        });
      };
      tryAdd(`${base}.png`, () => tryAdd(`${base}.jpg`));
    }
  }, [filtered, BASE_PATH]);

  const shown = filtered.features.length;

  /* ========= GRID LAYOUT (locked) =========
     Two columns: 360px sidebar + flexible map.
     Using inline gridTemplateColumns to avoid Tailwind config drift.  */
  return (
    <div
      className="h-[100dvh] grid bg-neutral-900 text-neutral-100"
      style={{ gridTemplateColumns: "360px 1fr" }}
    >
      {/* ========== LEFT: Sidebar ========== */}
      <aside className="h-full overflow-auto border-r border-neutral-800 p-4">
        {/* Header with logo (BASE_PATH-prefixed) + robust fallback */}
        <div className="flex items-center gap-3 mb-4">
          {/* plain <img> with onError JPG fallback so a missing PNG won’t blank */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${BASE_PATH}/certis-logo.png`}
            alt="Certis"
            className="h-6 w-auto object-contain"
            onError={(e) => {
              const t = e.currentTarget as HTMLImageElement;
              if (!t.dataset.fallback) {
                t.dataset.fallback = "1";
                t.src = `${BASE_PATH}/certis-logo.jpg`;
              }
            }}
          />
          <a href={`${BASE_PATH}/`} className="text-sm opacity-75 hover:opacity-100">
            Home
          </a>
        </div>

        <h1 className="text-2xl font-semibold mb-1">Certis AgRoute Planner</h1>
        <p className="text-xs opacity-70 mb-4">
          Filter retailers and visualize routes. Dbl-click map to set Home (coming back next).
        </p>

        {/* Filters card */}
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
          </div>
        </section>

        {/* Map options card */}
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
            <option value="logos">Retailer logos</option>
            <option value="dots">Colored dots</option>
          </select>

          <p className="text-[11px] opacity-60 mt-3">
            Token detected: <b>{MAPBOX_TOKEN ? "yes" : "no (OSM fallback)"}</b>
            <br />
            Data path: <code>{BASE_PATH}/data/retailers.geojson</code>
          </p>

          {loadError && <p className="text-xs text-red-400 mt-2">Error: {loadError}</p>}
        </section>
      </aside>

      {/* ========== RIGHT: Map ========== */}
      <main className="h-full">
        {/* Fill the grid cell; rounded container with no overlap on sidebar */}
        <div ref={mapEl} className="w-full h-full rounded-xl overflow-hidden" />
      </main>
    </div>
  );
}
