"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** -------------------------
 *  Helpers: env + safe props
 *  ------------------------- */
const getBasePath = () =>
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BASE_PATH) || "";

const getToken = () =>
  (typeof process !== "undefined" && (process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN)) || "";

type Feature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, any>;
};
type FC = { type: "FeatureCollection"; features: Feature[] };

// Case-insensitive property getter with common variants
function p(obj: any, keys: string[]) {
  for (const k of keys) {
    if (obj?.[k] != null) return obj[k];
  }
  return undefined;
}
const SKEYS = ["state", "State", "STATE"];
const RKEYS = ["retailer", "Retailer", "RETAILER"];
const CKEYS = ["category", "Category", "CATEGORY"];

function slug(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

/** ---------------------------------
 *  Mapbox (lazy import to avoid SSR)
 *  --------------------------------- */
let mapboxgl: any;

/** ---------------------------------
 *  Page
 *  --------------------------------- */
export default function Page() {
  const BASE_PATH = useMemo(getBasePath, []);
  const MAPBOX_TOKEN = useMemo(getToken, []);
  const mapRef = useRef<any>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);

  // UI state
  const [basemap, setBasemap] = useState<"hybrid" | "streets">("hybrid");
  const [markerStyle, setMarkerStyle] = useState<"logos" | "dots">("logos");

  const [raw, setRaw] = useState<FC | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [stateF, setStateF] = useState<string>("All");
  const [retailerF, setRetailerF] = useState<string>("All");
  const [categoryF, setCategoryF] = useState<string>("All");

  // Data URL (cache-bust)
  const dataUrl = useMemo(() => {
    const v = `v=${Date.now()}`;
    const path = `${BASE_PATH}/data/retailers.geojson`;
    return path.includes("?") ? `${path}&${v}` : `${path}?${v}`;
  }, [BASE_PATH]);

  // Load retailers
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    fetch(dataUrl)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Fetch retailers failed: ${r.status}`);
        const j = (await r.json()) as FC;
        if (!cancelled) setRaw(j);
      })
      .catch((e) => !cancelled && setLoadError(e?.message || "Fetch error"));

    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  // Normalize + filter
  const { filtered, states, retailers, categories } = useMemo(() => {
    const res: FC = { type: "FeatureCollection", features: [] };
    const S = new Set<string>();
    const R = new Set<string>();
    const C = new Set<string>();

    if (raw?.features?.length) {
      for (const f of raw.features) {
        const st = String(p(f.properties, SKEYS) ?? "").trim();
        const rt = String(p(f.properties, RKEYS) ?? "").trim();
        const ct = String(p(f.properties, CKEYS) ?? "").trim();

        if (st) S.add(st);
        if (rt) R.add(rt);
        if (ct) C.add(ct);

        // Apply filters
        if ((stateF === "All" || st === stateF) &&
            (retailerF === "All" || rt === retailerF) &&
            (categoryF === "All" || ct === categoryF)) {
          // Attach a dynamic icon id we can reference later
          const safeRetailer = rt || "Unknown";
          const iconId = `logo-${slug(safeRetailer)}`;
          const props = { ...f.properties, __state: st, __retailer: safeRetailer, __category: ct, __icon: iconId };
          res.features.push({ ...f, properties: props });
        }
      }
    }

    const sorted = (s: Set<string>) => ["All", ...Array.from(s).sort((a, b) => a.localeCompare(b))];

    return {
      filtered: res,
      states: sorted(S),
      retailers: sorted(R),
      categories: sorted(C),
    };
  }, [raw, stateF, retailerF, categoryF]);

  // Build a fast lookup of logo filenames we should try to load
  const logoCandidates = useMemo(() => {
    const set = new Set<string>();
    for (const f of filtered.features) {
      const r = String(p(f.properties, ["__retailer"]) || "");
      if (r) {
        const base = `${BASE_PATH}/icons/${r} Logo`;
        set.add(`${base}.png`);
        set.add(`${base}.jpg`);
      }
    }
    return Array.from(set.values());
  }, [filtered, BASE_PATH]);

  // Initialize / reinitialize map (on basemap or token changes)
  useEffect(() => {
    (async () => {
      const mod = await import("mapbox-gl");
      mapboxgl = mod.default || (mod as any);

      const token = MAPBOX_TOKEN;
      const useToken = !!token;
      if (useToken) mapboxgl.accessToken = token;

      // Remove previous map
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const style = useToken
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
                attribution: '© OpenStreetMap contributors',
              },
            },
            layers: [{ id: "osm", type: "raster", source: "osm" }],
          };

      const map = new mapboxgl.Map({
        container: mapEl.current as HTMLDivElement,
        style,
        center: [-97.5, 41.3],
        zoom: 5,
        cooperativeGestures: true,
      });
      mapRef.current = map;

      // Every time a style loads (initial or after setStyle), (re)add sources/layers
      const ensureLayers = () => {
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

          // Dots (unclustered)
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

          // Logos (unclustered)
          map.addLayer({
            id: "unclustered-logo",
            type: "symbol",
            source: "retailers",
            filter: ["!", ["has", "point_count"]],
            layout: {
              "icon-image": ["get", "__icon"], // string property per feature
              "icon-size": 0.5,
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
            },
          });
        } else {
          (map.getSource("retailers") as any).setData(filtered as any);
        }

        // Toggle which unclustered layer is visible
        map.setLayoutProperty("unclustered-point", "visibility", markerStyle === "dots" ? "visible" : "none");
        map.setLayoutProperty("unclustered-logo", "visibility", markerStyle === "logos" ? "visible" : "none");
      };

      map.on("load", ensureLayers);
      map.on("style.load", ensureLayers);

      // Basic UX
      map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", "unclustered-point", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "unclustered-point", () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", "unclustered-logo", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "unclustered-logo", () => (map.getCanvas().style.cursor = ""));
    })();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [MAPBOX_TOKEN, basemap, markerStyle, filtered]);

  // Keep source data in sync on filter changes (without full map reload)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource?.("retailers");
    if (src) (src as any).setData(filtered as any);

    // Make sure current marker style visibility is honored
    if (map.getLayer?.("unclustered-point")) {
      map.setLayoutProperty("unclustered-point", "visibility", markerStyle === "dots" ? "visible" : "none");
    }
    if (map.getLayer?.("unclustered-logo")) {
      map.setLayoutProperty("unclustered-logo", "visibility", markerStyle === "logos" ? "visible" : "none");
    }
  }, [filtered, markerStyle]);

  // Load retailer logo images (best-effort; fallback is dots)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!logoCandidates.length) return;

    const wantedIds = new Set<string>();
    for (const f of filtered.features) {
      const id = String(p(f.properties, ["__icon"]) || "");
      if (id) wantedIds.add(id);
    }

    const tryLoad = async (id: string, urlPng: string, urlJpg: string) => {
      if (map.hasImage(id)) return;
      // Try PNG, then JPG
      try {
        map.loadImage(urlPng, (err: any, img: any) => {
          if (!err && img) {
            if (!map.hasImage(id)) map.addImage(id, img, { sdf: false });
          } else {
            map.loadImage(urlJpg, (err2: any, img2: any) => {
              if (!err2 && img2) {
                if (!map.hasImage(id)) map.addImage(id, img2, { sdf: false });
              }
              // If both fail: layer just won’t show for that feature; dots remain as fallback if toggled.
            });
          }
        });
      } catch {
        /* ignore */
      }
    };

    // For each icon id we need, compute its URLs from feature retailer property
    for (const f of filtered.features) {
      const r = String(p(f.properties, ["__retailer"]) || "");
      const id = String(p(f.properties, ["__icon"]) || "");
      if (!r || !id) continue;

      const base = `${BASE_PATH}/icons/${r} Logo`;
      const png = `${base}.png`;
      const jpg = `${base}.jpg`;
      tryLoad(id, png, jpg);
    }
  }, [filtered, BASE_PATH, logoCandidates]);

  const countShown = filtered.features.length;

  /** -------------------------
   *  UI
   *  ------------------------- */
  return (
    <div className="w-full h-[100dvh] flex bg-neutral-900 text-neutral-100">
      {/* Side panel */}
      <aside className="w-[340px] max-w-[45vw] p-4 border-r border-neutral-800 overflow-auto">
        {/* Header with Certis logo (BASE_PATH-prefixed) */}
        <div className="flex items-center gap-3 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${BASE_PATH}/certis-logo.png`}
            alt="Certis"
            className="h-6 w-auto object-contain"
          />
          <a href={`${BASE_PATH}/`} className="text-sm opacity-75 hover:opacity-100">
            Home
          </a>
        </div>

        <h1 className="text-2xl font-semibold mb-2">Certis AgRoute Planner</h1>
        <p className="text-xs opacity-70 mb-3">
          Filter retailers and visualize routes. Dbl-click map to set Home (coming back next).
        </p>

        {/* Filters */}
        <div className="rounded-2xl bg-neutral-800 p-3 mb-3">
          <h2 className="text-sm font-semibold mb-2">Filters</h2>

          <label className="text-xs opacity-80">State</label>
          <select
            className="w-full mt-1 mb-2 bg-neutral-900 rounded px-3 py-2 outline-none"
            value={stateF}
            onChange={(e) => setStateF(e.target.value)}
          >
            {states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <label className="text-xs opacity-80">Retailer</label>
          <select
            className="w-full mt-1 mb-2 bg-neutral-900 rounded px-3 py-2 outline-none"
            value={retailerF}
            onChange={(e) => setRetailerF(e.target.value)}
          >
            {retailers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <label className="text-xs opacity-80">Category</label>
          <select
            className="w-full mt-1 mb-2 bg-neutral-900 rounded px-3 py-2 outline-none"
            value={categoryF}
            onChange={(e) => setCategoryF(e.target.value)}
          >
            {categories.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <div className="flex items-center gap-2 mt-2">
            <button
              className="px-3 py-2 rounded bg-sky-600 hover:bg-sky-500"
              onClick={() => {
                setStateF("All"); setRetailerF("All"); setCategoryF("All");
              }}
            >
              Clear Filters
            </button>
            <span className="text-xs opacity-75">{countShown} shown</span>
          </div>
        </div>

        {/* Map options */}
        <div className="rounded-2xl bg-neutral-800 p-3">
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
        </div>
      </aside>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapEl} className="absolute inset-0 rounded-lg overflow-hidden m-4" />
      </div>
    </div>
  );
}
