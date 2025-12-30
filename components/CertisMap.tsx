"use client";

// ============================================================================
// 💠 CERTIS AGROUTE DATABASE — GOLD (K15-safe + Kingpin intent restored + Mobile hitboxes)
//   • Satellite-streets-v12 + Mercator (Bailey Rule)
//   • Retailers filtered by: State ∩ Retailer ∩ Category ∩ Supplier
//   • Regional HQ filtered ONLY by State (Bailey HQ rule)
//   • Kingpins always visible overlay (not filtered)
//   • Applies ~100m offset to Kingpins (lng + 0.0013) like K10
//   • Kingpin icon is SVG → Canvas → Mapbox image (Chrome-proof), fallback to /icons/kingpin.png
//   • ✅ Mobile usability: invisible “hitbox” layers for easier tapping
//   • ✅ Loop guards: init once, sources/layers once, route abort/debounce
//
//   ✅ Category normalization (canonical 5):
//     - Agronomy, Grain/Feed, C-Store/Service/Energy, Distribution, Regional HQ
//     - Grain OR Feed => Grain/Feed
//     - Any hybrid containing Agronomy => Agronomy
//
//   ✅ Kingpin sizing fix:
//     - Reduce raster bake size (64px) + use real DPR (clamped) so icon-size is predictable
//     - Tighten icon-size curve for zoom 5–9
// ============================================================================

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { MAPBOX_TOKEN } from "../utils/token";

type StopKind = "retailer" | "hq" | "kingpin";

export type Stop = {
  id: string;
  kind: StopKind;
  label: string;
  retailer?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  category?: string;
  suppliers?: string;

  email?: string;
  phoneOffice?: string;
  phoneCell?: string;

  coords: [number, number]; // [lng, lat]
};

export type CategoryCount = {
  category: string;
  count: number;
};

export type RetailerNetworkSummaryRow = {
  retailer: string;
  totalLocations: number;
  agronomyLocations: number;
  states: string[];
  categoryCounts: CategoryCount[];
};

type Feature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, any>;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

type Props = {
  selectedStates: string[];
  selectedRetailers: string[];
  selectedCategories: string[];
  selectedSuppliers: string[];
  homeCoords: [number, number] | null;

  tripStops: Stop[];
  zoomToStop: Stop | null;

  onStatesLoaded: (states: string[]) => void;
  onRetailersLoaded: (retailers: string[]) => void;
  onCategoriesLoaded: (categories: string[]) => void;
  onSuppliersLoaded: (suppliers: string[]) => void;

  onAllStopsLoaded: (stops: Stop[]) => void;
  onAddStop: (stop: Stop) => void;

  onRetailerNetworkSummaryLoaded?: (rows: RetailerNetworkSummaryRow[]) => void;
};

const STYLE_URL = "mapbox://styles/mapbox/satellite-streets-v12";
const DEFAULT_CENTER: [number, number] = [-93.5, 41.5];
const DEFAULT_ZOOM = 5;

const SRC_RETAILERS = "retailers";
const SRC_KINGPINS = "kingpins";
const SRC_ROUTE = "trip-route-src";

const LYR_RETAILERS = "retailers-circle";
const LYR_HQ = "corp-hq-circle";
const LYR_KINGPINS = "kingpin-symbol";
const LYR_ROUTE = "trip-route";

const LYR_RETAILERS_HIT = "retailers-hitbox";
const LYR_HQ_HIT = "hq-hitbox";
const LYR_KINGPINS_HIT = "kingpin-hitbox";

const KINGPIN_OFFSET_LNG = 0.0013;

// Canonical categories
const CAT_AGRONOMY = "Agronomy";
const CAT_GRAINFEED = "Grain/Feed";
const CAT_CSTORE = "C-Store/Service/Energy";
const CAT_DISTRIBUTION = "Distribution";
const CAT_HQ = "Regional HQ";

const CANONICAL_CATEGORIES = [CAT_AGRONOMY, CAT_GRAINFEED, CAT_CSTORE, CAT_DISTRIBUTION, CAT_HQ];

function s(v: any) {
  return String(v ?? "").trim();
}

function uniqSorted(list: string[]) {
  return Array.from(new Set(list.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function splitMulti(raw: any) {
  const str = s(raw);
  if (!str) return [];
  return str
    .split(/[;,|]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function isRegionalOrCorporateHQ(category: string) {
  const c = s(category).toLowerCase();
  if (!c) return false;
  const hasHQ = c.includes("hq");
  const corp = c.includes("corporate");
  const regional = c.includes("regional");
  return (hasHQ && (corp || regional)) || c === "hq";
}

function makeId(kind: StopKind, coords: [number, number], p: Record<string, any>) {
  const retailer = s(p.Retailer);
  const name = s(p.Name);
  const st = s(p.State);
  const zip = s(p.Zip);
  return `${kind}:${retailer}|${name}|${st}|${zip}|${coords[0].toFixed(6)},${coords[1].toFixed(6)}`;
}

function safeDomId(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

function normalizeCategory(rawCategory: any): string {
  const raw = s(rawCategory);
  const low = raw.toLowerCase();
  if (!low) return "";

  if (isRegionalOrCorporateHQ(raw)) return CAT_HQ;
  if (low.includes("agronomy")) return CAT_AGRONOMY;

  const hasGrain = low.includes("grain");
  const hasFeed = low.includes("feed");
  if (hasGrain || hasFeed) return CAT_GRAINFEED;

  if (low.includes("c-store") || low.includes("c store") || low.includes("service") || low.includes("energy")) {
    return CAT_CSTORE;
  }

  if (low.includes("distribution")) return CAT_DISTRIBUTION;

  return "";
}

// ===============================
// Kingpin SVG → Canvas utilities
// ===============================

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function svgBlobUrl(svg: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  return URL.createObjectURL(blob);
}

async function rasterizeSvgToMapboxImage(svg: string, sizePx: number, pixelRatio: number) {
  const w = Math.max(8, Math.round(sizePx * pixelRatio));
  const h = Math.max(8, Math.round(sizePx * pixelRatio));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context not available");
  ctx.imageSmoothingEnabled = true;

  // ✅ IMPORTANT: do NOT use `new Image()` here (can conflict in TS environments).
  const img: HTMLImageElement = document.createElement("img");
  img.decoding = "async";

  const blobUrl = svgBlobUrl(svg);
  img.src = blobUrl;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("SVG image load failed"));
  }).finally(() => {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {}
  });

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);

  // Mapbox accepts {width,height,data} for addImage
  return {
    width: w,
    height: h,
    data: imageData.data,
  };
}

function loadMapboxImage(map: mapboxgl.Map, url: string) {
  return new Promise<any>((resolve, reject) => {
    map.loadImage(url, (err, img) => {
      if (err || !img) return reject(err || new Error("loadImage failed"));
      resolve(img);
    });
  });
}

// Inline legend icon (avoids Chrome weirdness with data-url <Image> rendering)
function LegendKingpinIcon(props: { svg: string }) {
  return (
    <span
      className="inline-flex items-center justify-center h-4 w-4"
      aria-hidden="true"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: props.svg }}
      style={{ lineHeight: 0 }}
    />
  );
}

export default function CertisMap(props: Props) {
  const {
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers,
    homeCoords,
    tripStops,
    zoomToStop,
    onStatesLoaded,
    onRetailersLoaded,
    onCategoriesLoaded,
    onSuppliersLoaded,
    onAllStopsLoaded,
    onAddStop,
    onRetailerNetworkSummaryLoaded,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const retailersRef = useRef<FeatureCollection | null>(null);
  const kingpinsRef = useRef<FeatureCollection | null>(null);

  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const directionsAbortRef = useRef<AbortController | null>(null);
  const routeDebounceRef = useRef<number | null>(null);
  const lastRouteKeyRef = useRef<string>("");

  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const lastNetworkSummaryKeyRef = useRef<string>("");

  const basePath = useMemo(() => {
    const bp = (process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app").trim();
    return bp || "/certis_agroute_app";
  }, []);

  const token = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
    return env || (MAPBOX_TOKEN || "").trim();
  }, []);

  // ✅ Versioned Mapbox image id to dodge stale caches
  const KINGPIN_ICON_VERSION = "K15";
  const KINGPIN_ICON_ID = useMemo(() => `kingpin-icon-${KINGPIN_ICON_VERSION}`, []);

  // ✅ Your intended star look (these now match legend + map)
  const KINGPIN_SHAPE = useMemo<"circle" | "star">(() => "star", []);
  const KINGPIN_FILL = "#3b82f6"; // bright blue (matches the legend you’re happy with)
  const KINGPIN_STROKE = "#0b1220"; // dark outline
  const KINGPIN_STROKE_W = 8; // reduced from 10 to keep outline consistent + not “fatter” than legend

  const KINGPIN_SVG = useMemo(() => {
    if (KINGPIN_SHAPE === "circle") {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r="44" fill="${KINGPIN_FILL}" stroke="${KINGPIN_STROKE}" stroke-width="${KINGPIN_STROKE_W}"/>
        </svg>
      `.trim();
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 128 128">
        <path
          d="M64 14
             L78.6 47.5
             L115 52.2
             L88 75.1
             L96.1 110
             L64 92
             L31.9 110
             L40 75.1
             L13 52.2
             L49.4 47.5
             Z"
          fill="${KINGPIN_FILL}"
          stroke="${KINGPIN_STROKE}"
          stroke-width="${KINGPIN_STROKE_W}"
          stroke-linejoin="round"
        />
      </svg>
    `.trim();
  }, [KINGPIN_SHAPE, KINGPIN_FILL, KINGPIN_STROKE, KINGPIN_STROKE_W]);

  // Kept for debugging / optional uses (not required for legend anymore)
  const KINGPIN_ICON_DATA_URL = useMemo(() => svgDataUrl(KINGPIN_SVG), [KINGPIN_SVG]);

  useEffect(() => {
    if (!mapboxgl.accessToken) mapboxgl.accessToken = token;
  }, [token]);

  // INIT MAP (once)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      projection: { name: "mercator" },
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");

    // Keep the map sized correctly
    try {
      resizeObsRef.current = new ResizeObserver(() => {
        const m = mapRef.current;
        if (!m) return;
        requestAnimationFrame(() => {
          try {
            m.resize();
          } catch {}
        });
      });
      resizeObsRef.current.observe(containerRef.current);
    } catch {}

    const handleViewportResize = () => {
      const m = mapRef.current;
      if (!m) return;
      window.setTimeout(() => {
        try {
          m.resize();
        } catch {}
      }, 60);
    };

    window.addEventListener("resize", handleViewportResize, { passive: true });
    window.addEventListener("orientationchange", handleViewportResize, { passive: true } as any);

    // ✅ Predictable kingpin sizing: smaller bake + real DPR (clamped)
    const KINGPIN_BAKE_PX = 64; // was effectively 96*2; too big
    const getClampedDpr = () => {
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      // clamp avoids Chrome/Windows oddities & keeps icon-size consistent
      return Math.max(1, Math.min(2, dpr));
    };

    const ensureKingpinIcon = async () => {
      const m = mapRef.current;
      if (!m) return;
      if (m.hasImage(KINGPIN_ICON_ID)) return;

      // 1) Primary: SVG → Canvas → addImage (Chrome-safe)
      try {
        const img = await rasterizeSvgToMapboxImage(KINGPIN_SVG, KINGPIN_BAKE_PX, getClampedDpr());
        m.addImage(KINGPIN_ICON_ID, img as any);
        return;
      } catch (e) {
        console.warn("[CertisMap] SVG→Canvas kingpin icon failed; falling back to PNG.", e);
      }

      // 2) Fallback: PNG
      try {
        const pngUrl = `${basePath}/icons/kingpin.png?v=${encodeURIComponent(KINGPIN_ICON_VERSION)}`;
        const png = await loadMapboxImage(m, pngUrl);
        m.addImage(KINGPIN_ICON_ID, png, { sdf: false } as any);
      } catch (e) {
        console.error("[CertisMap] PNG fallback kingpin icon also failed:", e);
      }
    };

    map.on("load", async () => {
      // Sources
      if (!map.getSource(SRC_RETAILERS)) {
        map.addSource(SRC_RETAILERS, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getSource(SRC_KINGPINS)) {
        map.addSource(SRC_KINGPINS, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getSource(SRC_ROUTE)) {
        map.addSource(SRC_ROUTE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }

      // Retailers
      if (!map.getLayer(LYR_RETAILERS)) {
        map.addLayer({
          id: LYR_RETAILERS,
          type: "circle",
          source: SRC_RETAILERS,
          paint: {
            "circle-radius": 4,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#111827",
            "circle-color": [
              "case",
              ["==", ["get", "Category"], CAT_AGRONOMY],
              "#22c55e",
              ["==", ["get", "Category"], CAT_GRAINFEED],
              "#f97316",
              ["==", ["get", "Category"], CAT_CSTORE],
              "#0ea5e9",
              ["==", ["get", "Category"], CAT_DISTRIBUTION],
              "#a855f7",
              "#f9fafb",
            ],
          },
        });
      }

      // Retailers hitbox (mobile)
      if (!map.getLayer(LYR_RETAILERS_HIT)) {
        map.addLayer({
          id: LYR_RETAILERS_HIT,
          type: "circle",
          source: SRC_RETAILERS,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 10, 5, 14, 7, 18, 10, 20],
            "circle-color": "#000000",
            "circle-opacity": 0.001,
            "circle-stroke-width": 0,
          },
        });
      }

      // HQ (slightly smaller than before but still very visible)
      if (!map.getLayer(LYR_HQ)) {
        map.addLayer({
          id: LYR_HQ,
          type: "circle",
          source: SRC_RETAILERS,
          filter: ["==", ["get", "Category"], CAT_HQ],
          paint: {
            "circle-radius": 5, // was 6
            "circle-color": "#ff0000",
            "circle-stroke-color": "#facc15",
            "circle-stroke-width": 2,
          },
        });
      }

      // HQ hitbox
      if (!map.getLayer(LYR_HQ_HIT)) {
        map.addLayer({
          id: LYR_HQ_HIT,
          type: "circle",
          source: SRC_RETAILERS,
          filter: ["==", ["get", "Category"], CAT_HQ],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 12, 5, 16, 7, 20, 10, 22],
            "circle-color": "#000000",
            "circle-opacity": 0.001,
            "circle-stroke-width": 0,
          },
        });
      }

      // Kingpin icon + layers
      await ensureKingpinIcon();

      if (!map.getLayer(LYR_KINGPINS)) {
        map.addLayer({
          id: LYR_KINGPINS,
          type: "symbol",
          source: SRC_KINGPINS,
          layout: {
            "icon-image": KINGPIN_ICON_ID,

            // ✅ Tuned sizing (fixes “giant stars” at typical working zooms)
            // With a smaller baked icon, these become predictable.
            "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.10, 5, 0.14, 7, 0.18, 9, 0.22, 12, 0.26],

            "icon-anchor": "center",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
      }

      // ✅ BIGGER / MORE FORGIVING kingpin hitbox (tap/click)
      if (!map.getLayer(LYR_KINGPINS_HIT)) {
        map.addLayer({
          id: LYR_KINGPINS_HIT,
          type: "circle",
          source: SRC_KINGPINS,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 24, 5, 28, 7, 32, 10, 36, 12, 40],
            "circle-color": "#000000",
            "circle-opacity": 0.001,
            "circle-stroke-width": 0,
          },
        });
      }

      // Route
      if (!map.getLayer(LYR_ROUTE)) {
        map.addLayer({
          id: LYR_ROUTE,
          type: "line",
          source: SRC_ROUTE,
          paint: {
            "line-color": "#facc15",
            "line-width": 4,
            "line-opacity": 0.95,
          },
        });
      }

      await loadData();
      applyFilters();
      updateHomeMarker();
      await updateRoute(true);

      const setPointer = () => (map.getCanvas().style.cursor = "pointer");
      const clearPointer = () => (map.getCanvas().style.cursor = "");

      [LYR_RETAILERS, LYR_HQ, LYR_KINGPINS, LYR_RETAILERS_HIT, LYR_HQ_HIT, LYR_KINGPINS_HIT].forEach((lyr) => {
        map.on("mouseenter", lyr, setPointer);
        map.on("mouseleave", lyr, clearPointer);
      });

      // Click handlers: hitboxes first
      map.on("click", LYR_RETAILERS_HIT, (e) => handleRetailerClick(e));
      map.on("click", LYR_HQ_HIT, (e) => handleRetailerClick(e));
      map.on("click", LYR_KINGPINS_HIT, (e) => handleKingpinClick(e));

      // Still allow direct clicks on visible layers
      map.on("click", LYR_RETAILERS, (e) => handleRetailerClick(e));
      map.on("click", LYR_HQ, (e) => handleRetailerClick(e));
      map.on("click", LYR_KINGPINS, (e) => handleKingpinClick(e));

      requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {}
      });
    });

    return () => {
      try {
        directionsAbortRef.current?.abort();
      } catch {}
      directionsAbortRef.current = null;

      if (routeDebounceRef.current) {
        window.clearTimeout(routeDebounceRef.current);
        routeDebounceRef.current = null;
      }

      try {
        resizeObsRef.current?.disconnect();
      } catch {}
      resizeObsRef.current = null;

      window.removeEventListener("resize", handleViewportResize as any);
      window.removeEventListener("orientationchange", handleViewportResize as any);

      try {
        map.remove();
      } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, token, KINGPIN_ICON_ID, KINGPIN_SVG]);

  function buildRetailerNetworkSummary(retailersData: FeatureCollection): RetailerNetworkSummaryRow[] {
    const acc: Record<string, { total: number; agronomy: number; states: Set<string>; catCounts: Map<string, number> }> =
      {};

    for (const f of retailersData.features ?? []) {
      const p = f.properties ?? {};
      const retailer = s(p.Retailer) || "Unknown Retailer";
      const state = s(p.State);

      const categoryCanonical = s(p.Category);
      const isHQ = categoryCanonical === CAT_HQ;

      if (!acc[retailer]) {
        acc[retailer] = { total: 0, agronomy: 0, states: new Set<string>(), catCounts: new Map<string, number>() };
      }

      acc[retailer].total += 1;
      if (state) acc[retailer].states.add(state);

      const k = categoryCanonical || "Uncategorized";
      acc[retailer].catCounts.set(k, (acc[retailer].catCounts.get(k) || 0) + 1);

      if (!isHQ && categoryCanonical === CAT_AGRONOMY) {
        acc[retailer].agronomy += 1;
      }
    }

    const rows: RetailerNetworkSummaryRow[] = Object.entries(acc).map(([retailer, v]) => {
      const categoryCounts: CategoryCount[] = Array.from(v.catCounts.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

      return {
        retailer,
        totalLocations: v.total,
        agronomyLocations: v.agronomy,
        states: Array.from(v.states).sort(),
        categoryCounts,
      };
    });

    rows.sort((a, b) => b.totalLocations - a.totalLocations || a.retailer.localeCompare(b.retailer));
    return rows;
  }

  async function loadData() {
    const map = mapRef.current;
    if (!map) return;

    const retailersUrl = `${basePath}/data/retailers.geojson`;
    const kingpinsUrl = `${basePath}/data/kingpin.geojson`;

    const [r1, r2] = await Promise.all([fetch(retailersUrl), fetch(kingpinsUrl)]);
    const retailersDataRaw = (await r1.json()) as FeatureCollection;
    const kingpinData = (await r2.json()) as FeatureCollection;

    const retailersData: FeatureCollection = {
      ...retailersDataRaw,
      features: (retailersDataRaw.features ?? []).map((f) => {
        const p = f.properties ?? {};
        const cat = normalizeCategory(p.Category);
        return { ...f, properties: { ...p, Category: cat || "" } };
      }),
    };

    const offsetKingpins: FeatureCollection = {
      ...kingpinData,
      features: (kingpinData.features ?? []).map((f: any) => {
        const [lng, lat] = f.geometry?.coordinates ?? [0, 0];
        return { ...f, geometry: { ...f.geometry, coordinates: [lng + KINGPIN_OFFSET_LNG, lat] } };
      }),
    };

    retailersRef.current = retailersData;
    kingpinsRef.current = offsetKingpins;

    (map.getSource(SRC_RETAILERS) as mapboxgl.GeoJSONSource).setData(retailersData as any);
    (map.getSource(SRC_KINGPINS) as mapboxgl.GeoJSONSource).setData(offsetKingpins as any);

    if (onRetailerNetworkSummaryLoaded) {
      const rows = buildRetailerNetworkSummary(retailersData);
      const key = rows
        .slice(0, 200)
        .map((r) => `${r.retailer}|${r.totalLocations}|${r.agronomyLocations}|${r.states.join("/")}`)
        .join(";");

      if (key !== lastNetworkSummaryKeyRef.current) {
        lastNetworkSummaryKeyRef.current = key;
        try {
          onRetailerNetworkSummaryLoaded(rows);
        } catch (e) {
          console.warn("[CertisMap] onRetailerNetworkSummaryLoaded failed:", e);
        }
      }
    }

    const allStops: Stop[] = [];

    for (const f of retailersData.features ?? []) {
      const p = f.properties ?? {};
      const coords = f.geometry?.coordinates;
      if (!coords) continue;

      const category = s(p.Category);
      const kind: StopKind = category === CAT_HQ ? "hq" : "retailer";

      const retailer = s(p.Retailer);
      const name = s(p.Name);

      const label =
        kind === "hq"
          ? `${retailer || "Regional HQ"} — Regional HQ`
          : `${retailer || "Retailer"} — ${name || "Site"}`;

      allStops.push({
        id: makeId(kind, coords, p),
        kind,
        label,
        retailer,
        name,
        address: s(p.Address),
        city: s(p.City),
        state: s(p.State),
        zip: s(p.Zip),
        category,
        suppliers: s(p.Suppliers),
        coords,
      });
    }

    for (const f of offsetKingpins.features ?? []) {
      const p = f.properties ?? {};
      const coords = f.geometry?.coordinates;
      if (!coords) continue;

      const retailer = s(p.Retailer);
      const contactName = s(p.ContactName || p.Name || p.Contact || p["Contact Name"]);
      const label = retailer ? `${contactName || "Kingpin"} — ${retailer}` : `${contactName || "Kingpin"}`;

      allStops.push({
        id: makeId("kingpin", coords, p),
        kind: "kingpin",
        label,
        retailer,
        name: contactName || "Kingpin",
        address: s(p.Address),
        city: s(p.City),
        state: s(p.State),
        zip: s(p.Zip),
        category: s(p.Category) || "Kingpin",
        suppliers: s(p.Suppliers),
        email: s(p.Email) || "TBD",
        phoneOffice: s(p.OfficePhone || p["Office Phone"] || p.PhoneOffice) || "TBD",
        phoneCell: s(p.CellPhone || p["Cell Phone"] || p.PhoneCell) || "TBD",
        coords,
      });
    }

    onAllStopsLoaded(allStops);

    onStatesLoaded(uniqSorted(allStops.map((st) => s(st.state).toUpperCase()).filter(Boolean)));
    onRetailersLoaded(uniqSorted((retailersData.features ?? []).map((f: any) => s(f.properties?.Retailer)).filter(Boolean)));
    onCategoriesLoaded([...CANONICAL_CATEGORIES]);
    onSuppliersLoaded(uniqSorted(allStops.flatMap((st) => splitMulti(st.suppliers))));
  }

  function applyFilters() {
    const map = mapRef.current;
    const retailersData = retailersRef.current;
    if (!map || !retailersData) return;

    const retailerFilter: any[] = ["all"];
    retailerFilter.push(["!=", ["get", "Category"], CAT_HQ]);

    if (selectedStates.length) retailerFilter.push(["in", ["upcase", ["get", "State"]], ["literal", selectedStates]]);
    if (selectedRetailers.length) retailerFilter.push(["in", ["get", "Retailer"], ["literal", selectedRetailers]]);

    if (selectedCategories.length) {
      retailerFilter.push(["in", ["get", "Category"], ["literal", selectedCategories]]);
    }

    if (selectedSuppliers.length) {
      retailerFilter.push([
        "any",
        ...selectedSuppliers.map((sp) => [">=", ["index-of", sp.toLowerCase(), ["downcase", ["get", "Suppliers"]]], 0]),
      ]);
    }

    const hqFilter: any[] = ["all"];
    hqFilter.push(["==", ["get", "Category"], CAT_HQ]);
    if (selectedStates.length) hqFilter.push(["in", ["upcase", ["get", "State"]], ["literal", selectedStates]]);

    map.setFilter(LYR_RETAILERS, retailerFilter as any);
    map.setFilter(LYR_RETAILERS_HIT, retailerFilter as any);

    map.setFilter(LYR_HQ, hqFilter as any);
    map.setFilter(LYR_HQ_HIT, hqFilter as any);
  }

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  function updateHomeMarker() {
    const map = mapRef.current;
    if (!map) return;

    if (!homeCoords) {
      homeMarkerRef.current?.remove();
      homeMarkerRef.current = null;
      return;
    }

    const iconUrl = `${basePath}/icons/Blue_Home.png`;

    if (!homeMarkerRef.current) {
      const el = document.createElement("div");
      el.style.width = "28px";
      el.style.height = "28px";
      el.style.backgroundImage = `url(${iconUrl})`;
      el.style.backgroundSize = "contain";
      el.style.backgroundRepeat = "no-repeat";
      el.style.backgroundPosition = "center";

      homeMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat(homeCoords).addTo(map);
    } else {
      homeMarkerRef.current.setLngLat(homeCoords);
    }
  }

  useEffect(() => {
    updateHomeMarker();
    updateRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeCoords, basePath]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoomToStop) return;
    map.flyTo({ center: zoomToStop.coords, zoom: 12.5, essential: true });
  }, [zoomToStop]);

  function buildRouteCoords(): [number, number][] {
    const pts: [number, number][] = [];
    if (homeCoords) pts.push(homeCoords);
    for (const st of tripStops || []) pts.push(st.coords);
    return pts;
  }

  async function updateRoute(force = false) {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource(SRC_ROUTE) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    const pts = buildRouteCoords();

    if (pts.length < 2) {
      src.setData({ type: "FeatureCollection", features: [] } as any);
      lastRouteKeyRef.current = "";
      return;
    }

    const key = pts.map((c) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join("|");
    if (!force && key === lastRouteKeyRef.current) return;
    lastRouteKeyRef.current = key;

    if (routeDebounceRef.current) window.clearTimeout(routeDebounceRef.current);
    routeDebounceRef.current = window.setTimeout(async () => {
      try {
        directionsAbortRef.current?.abort();
      } catch {}
      const controller = new AbortController();
      directionsAbortRef.current = controller;

      const coordsStr = pts.map((c) => `${c[0]},${c[1]}`).join(";");

      const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}` +
        `?geometries=geojson&overview=full&steps=false&access_token=${encodeURIComponent(token)}`;

      try {
        const resp = await fetch(url, { signal: controller.signal });
        if (!resp.ok) throw new Error(`Directions HTTP ${resp.status} ${resp.statusText}`);
        const json: any = await resp.json();

        const geom = json?.routes?.[0]?.geometry;
        if (!geom || geom.type !== "LineString") throw new Error("Directions missing geometry");

        src.setData({ type: "FeatureCollection", features: [{ type: "Feature", geometry: geom, properties: {} }] } as any);
      } catch (e: any) {
        if (e?.name === "AbortError") return;

        src.setData({
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: { type: "LineString", coordinates: pts }, properties: { fallback: true } }],
        } as any);
      }
    }, 150);
  }

  useEffect(() => {
    updateRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripStops, token]);

  // ===============================
  // Click helpers
  // ===============================

  type LayerClickEvent = mapboxgl.MapMouseEvent & { features?: any[] };

  function getEventFeatures(e: mapboxgl.MapMouseEvent): any[] {
    const anyE = e as LayerClickEvent;
    if (anyE.features && anyE.features.length) return anyE.features;
    return [];
  }

  function handleRetailerClick(e: mapboxgl.MapMouseEvent) {
    const map = mapRef.current;
    if (!map) return;

    let features = getEventFeatures(e);

    if (!features || features.length === 0) {
      features = map.queryRenderedFeatures(e.point, { layers: [LYR_RETAILERS_HIT, LYR_HQ_HIT] }) as any[];
      if (!features || features.length === 0) {
        features = map.queryRenderedFeatures(e.point, { layers: [LYR_RETAILERS, LYR_HQ] }) as any[];
      }
    }

    if (!features || features.length === 0) return;

    const f = features[0];
    const p = f.properties ?? {};
    const coords = (f.geometry?.coordinates ?? []) as [number, number];

    const retailer = s(p.Retailer);
    const name = s(p.Name);
    const address = s(p.Address);
    const city = s(p.City);
    const state = s(p.State);
    const zip = s(p.Zip);
    const category = s(p.Category);
    const suppliers = s(p.Suppliers) || "Not listed";

    const kind: StopKind = category === CAT_HQ ? "hq" : "retailer";

    const stop: Stop = {
      id: makeId(kind, coords, p),
      kind,
      label: kind === "hq" ? `${retailer || "Regional HQ"} — Regional HQ` : `${retailer || "Retailer"} — ${name || "Site"}`,
      retailer,
      name,
      address,
      city,
      state,
      zip,
      category,
      suppliers,
      coords,
    };

    const header = kind === "hq" ? `${retailer || "Regional HQ"} — Regional HQ` : retailer || "Unknown Retailer";
    const addBtnId = safeDomId("add-stop");

    const popupHtml = `
      <div style="font-size:13px;min-width:300px;max-width:320px;color:#fff;line-height:1.3;font-family:Segoe UI,Arial;">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px;color:#facc15;">${header}</div>
        ${name ? `<div style="font-style:italic;margin-bottom:4px;">${name}</div>` : ""}
        <div style="margin-bottom:4px;">${address}<br/>${city}, ${state} ${zip}</div>
        ${category ? `<div style="margin-bottom:6px;"><span style="font-weight:700;color:#facc15;">Category:</span> ${category}</div>` : ""}
        <div style="margin-bottom:8px;"><span style="font-weight:700;color:#facc15;">Suppliers:</span> ${suppliers}</div>
        <button id="${addBtnId}" style="padding:7px 10px;border:none;background:#facc15;border-radius:5px;font-weight:700;font-size:13px;color:#111827;cursor:pointer;width:100%;">
          ➕ Add to Trip
        </button>
      </div>
    `;

    const popup = new mapboxgl.Popup({ offset: 14, closeOnMove: false }).setLngLat(coords).setHTML(popupHtml).addTo(map);

    setTimeout(() => {
      const btn = document.getElementById(addBtnId);
      if (btn) (btn as HTMLButtonElement).onclick = () => onAddStop(stop);
      try {
        popup.getElement();
      } catch {}
    }, 0);
  }

  function handleKingpinClick(e: mapboxgl.MapMouseEvent) {
    const map = mapRef.current;
    if (!map) return;

    let featuresRaw = getEventFeatures(e);

    if (!featuresRaw || featuresRaw.length === 0) {
      featuresRaw = map.queryRenderedFeatures(e.point, { layers: [LYR_KINGPINS_HIT] }) as any[];
      if (!featuresRaw || featuresRaw.length === 0) {
        featuresRaw = map.queryRenderedFeatures(e.point, { layers: [LYR_KINGPINS] }) as any[];
      }
    }

    if (!featuresRaw || featuresRaw.length === 0) return;

    const features = [...featuresRaw].sort((a, b) => {
      const ap = a.properties ?? {};
      const bp = b.properties ?? {};
      const ar = s(ap.Retailer).toLowerCase();
      const br = s(bp.Retailer).toLowerCase();
      if (ar !== br) return ar.localeCompare(br);
      const an = s(ap.ContactName || ap.Name || ap.Contact || ap["Contact Name"]).toLowerCase();
      const bn = s(bp.ContactName || bp.Name || bp.Contact || bp["Contact Name"]).toLowerCase();
      return an.localeCompare(bn);
    });

    const popupId = safeDomId("kp");
    const selectId = `${popupId}-select`;
    const addBtnId = `${popupId}-add`;

    const makeStopFromFeature = (f: any): Stop => {
      const p = f.properties ?? {};
      const coords = (f.geometry?.coordinates ?? []) as [number, number];

      const retailer = s(p.Retailer);
      const address = s(p.Address);
      const city = s(p.City);
      const state = s(p.State);
      const zip = s(p.Zip);

      const rawCat = s(p.Category);
      const category = isRegionalOrCorporateHQ(rawCat) ? CAT_HQ : rawCat || "Kingpin";

      const suppliers = s(p.Suppliers) || "Not listed";
      const contactName = s(p.ContactName || p.Name || p.Contact || p["Contact Name"]);
      const office = s(p.OfficePhone || p["Office Phone"] || p.PhoneOffice) || "TBD";
      const cell = s(p.CellPhone || p["Cell Phone"] || p.PhoneCell) || "TBD";
      const email = s(p.Email) || "TBD";

      const label = retailer ? `${contactName || "Kingpin"} — ${retailer}` : `${contactName || "Kingpin"}`;

      return {
        id: makeId("kingpin", coords, p),
        kind: "kingpin",
        label,
        retailer,
        name: contactName || "Kingpin",
        address,
        city,
        state,
        zip,
        category,
        suppliers,
        phoneOffice: office,
        phoneCell: cell,
        email,
        coords,
      };
    };

    const stops = features.map((f) => makeStopFromFeature(f));
    let activeIndex = 0;

    const renderDetailsHtml = (st: Stop) => {
      const header = st.retailer || "Unknown Retailer";
      const cat = st.category
        ? `<div style="margin-bottom:6px;"><span style="font-weight:700;color:#facc15;">Category:</span> ${st.category}</div>`
        : "";

      const sup = st.suppliers && st.suppliers.trim() ? st.suppliers : "Not listed";

      const whoLine = st.name ? `<div style="font-weight:700;margin-bottom:2px;">${st.name}</div>` : "";
      const titleRaw =
        features[activeIndex]?.properties?.ContactTitle ||
        features[activeIndex]?.properties?.Title ||
        features[activeIndex]?.properties?.["Contact Title"] ||
        "";
      const title = s(titleRaw);
      const titleLine = title ? `<div style="margin-bottom:4px;">${title}</div>` : "";

      return `
        <div style="font-size:13px;min-width:300px;max-width:340px;color:#fff;line-height:1.3;font-family:Segoe UI,Arial;">
          <div style="font-size:16px;font-weight:700;margin-bottom:6px;color:#facc15;">${header}</div>

          ${
            stops.length > 1
              ? `
              <div style="margin-bottom:8px;">
                <div style="font-weight:700;margin-bottom:4px;">Multiple Kingpins:</div>
                <select id="${selectId}" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #374151;background:#111827;color:#f9fafb;font-size:13px;">
                  ${stops
                    .map((x, i) => {
                      const who = x.name || "Kingpin";
                      const where = [x.city, x.state].filter(Boolean).join(", ");
                      const label = where ? `${who} (${where})` : who;
                      return `<option value="${i}" ${i === activeIndex ? "selected" : ""}>${label}</option>`;
                    })
                    .join("")}
                </select>
              </div>
            `
              : ""
          }

          <div style="margin-bottom:4px;">${st.address || ""}<br/>${st.city || ""}, ${st.state || ""} ${st.zip || ""}</div>
          ${cat}

          <div style="margin-bottom:8px;"><span style="font-weight:700;color:#facc15;">Suppliers:</span> ${sup}</div>

          ${whoLine}
          ${titleLine}
          <div style="margin-bottom:4px;">Office: ${st.phoneOffice || "TBD"} • Cell: ${st.phoneCell || "TBD"}</div>
          <div style="margin-bottom:8px;">Email: ${st.email || "TBD"}</div>

          <button id="${addBtnId}" style="padding:7px 10px;border:none;background:#facc15;border-radius:5px;font-weight:700;font-size:13px;color:#111827;cursor:pointer;width:100%;">
            ➕ Add to Trip
          </button>
        </div>
      `;
    };

    const popup = new mapboxgl.Popup({ offset: 14, closeOnMove: false })
      .setLngLat(stops[0].coords)
      .setHTML(renderDetailsHtml(stops[0]))
      .addTo(map);

    const wirePopup = () => {
      const select = document.getElementById(selectId) as HTMLSelectElement | null;
      const addBtn = document.getElementById(addBtnId) as HTMLButtonElement | null;

      if (addBtn) {
        addBtn.onclick = () => {
          const st = stops[activeIndex] || stops[0];
          onAddStop(st);
        };
      }

      if (select) {
        select.onchange = () => {
          const idx = Number(select.value);
          if (!Number.isFinite(idx) || idx < 0 || idx >= stops.length) return;
          activeIndex = idx;

          try {
            popup.setHTML(renderDetailsHtml(stops[activeIndex]));
          } catch {}

          setTimeout(() => wirePopup(), 0);
        };
      }
    };

    setTimeout(() => wirePopup(), 0);
  }

  return (
    <div className="relative w-full h-full min-h-0">
      <div ref={containerRef} className="w-full h-full min-h-[55vh] sm:min-h-0" />

      <div className="absolute bottom-4 left-4 z-10">
        <div className="rounded-xl border border-white/10 bg-neutral-900/90 shadow-2xl backdrop-blur px-4 py-3">
          <div className="text-[14px] font-extrabold text-white/90 mb-2">Legend</div>

          <div className="space-y-1.5 text-[13px] text-white/85">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full border border-black/40" style={{ background: "#22c55e" }} />
              <span>{CAT_AGRONOMY}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full border border-black/40" style={{ background: "#f97316" }} />
              <span>{CAT_GRAINFEED}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full border border-black/40" style={{ background: "#0ea5e9" }} />
              <span>{CAT_CSTORE}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full border border-black/40" style={{ background: "#a855f7" }} />
              <span>{CAT_DISTRIBUTION}</span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full border border-black/40"
                style={{ background: "#ff0000", boxShadow: "0 0 0 2px rgba(250,204,21,0.85) inset" }}
              />
              <span>{CAT_HQ}</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <LegendKingpinIcon svg={KINGPIN_SVG} />
              <span>Kingpin</span>
            </div>

            {/* Optional debug */}
            {/* <div className="text-[10px] text-white/40 break-all">{KINGPIN_ICON_DATA_URL}</div> */}
          </div>
        </div>
      </div>
    </div>
  );
}
