"use client";

// ============================================================================
// 💠 CERTIS AGROUTE DATABASE — GOLD (K16: Home restored for routing + Kingpin chooser popup)
//   • Satellite-streets-v12 + Mercator (Bailey Rule)
//   • Retailers filtered by: State ∩ Retailer ∩ Category ∩ Supplier
//   • Regional HQ filtered ONLY by State (Bailey HQ rule)
//   • Kingpins always visible overlay (not filtered)
//   • Applies ~100m offset to Kingpins (lng + 0.0013) like K10
//   • Kingpin icon is SVG → Canvas → Mapbox image (Chrome-proof), fallback to /icons/kingpin.png
//   • ✅ Mobile usability: invisible “hitbox” layers for easier tapping (Retailer/HQ/Kingpin)
//   • ✅ Kingpin behavior: SINGLE popup, with DROPDOWN chooser when multiple overlap
//   • ✅ Loop guards: init once, sources/layers once, route abort/debounce
//
//   ✅ Category normalization (canonical 5):
//     - Agronomy, Grain/Feed, C-Store/Service/Energy, Distribution, Regional HQ
//     - Grain OR Feed => Grain/Feed
//     - Any hybrid containing Agronomy => Agronomy
//
//   K16 PATCH (Dec 2025):
//     • Removed on-map legend (page.tsx owns sidebar legend now)
//     • Added route status badge when fallback polyline is used
//     • Added dataLoadedRef guard (prevents accidental reload if map "load" fires again)
//
//   K16.1 PATCH (Jan 2026):
//     • Restored Home → Stop #1 segment by including homeCoords as waypoint 0 when present
//     • Route key + Directions request now include Home (prevents “missing first leg”)
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
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

  // ✅ Home is optional, but when present it becomes the first routing waypoint (Home → Stop1 → Stop2...)
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

function distanceSq(a: [number, number], b: [number, number]) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

type RouteMode = "none" | "roads" | "fallback";

type LayerClickEvent = mapboxgl.MapMouseEvent & { features?: any[] };

function getEventFeatures(e: mapboxgl.MapMouseEvent): any[] {
  const anyE = e as LayerClickEvent;
  if (anyE.features && anyE.features.length) return anyE.features;
  return [];
}

function kingpinDisplayName(p: Record<string, any>) {
  const contactName = s(p.ContactName || p.Name || p.Contact || p["Contact Name"]) || "Kingpin";
  const retailer = s(p.Retailer);
  const city = s(p.City);
  const state = s(p.State);
  const loc = [city, state].filter(Boolean).join(", ");
  if (retailer && loc) return `${contactName} — ${retailer} (${loc})`;
  if (retailer) return `${contactName} — ${retailer}`;
  if (loc) return `${contactName} (${loc})`;
  return contactName;
}

function kingpinStableKey(p: Record<string, any>, coords: [number, number]) {
  const retailer = s(p.Retailer);
  const contact = s(p.ContactName || p.Name || p.Contact || p["Contact Name"]);
  const email = s(p.Email);
  const cell = s(p.CellPhone || p["Cell Phone"] || p.PhoneCell);
  const office = s(p.OfficePhone || p["Office Phone"] || p.PhoneOffice);
  const city = s(p.City);
  const state = s(p.State);
  const zip = s(p.Zip);

  const core = [contact, retailer, email, cell, office, city, state, zip].filter(Boolean).join("|");
  if (core) return core;
  return `${coords[0].toFixed(6)},${coords[1].toFixed(6)}|${retailer}|${contact}`;
}

function makeKingpinStopFromFeature(f: any): Stop | null {
  const p = f?.properties ?? {};
  const coords = (f?.geometry?.coordinates ?? null) as [number, number] | null;
  if (!coords) return null;

  const retailer = s(p.Retailer);
  const contactName = s(p.ContactName || p.Name || p.Contact || p["Contact Name"]) || "Kingpin";
  const label = retailer ? `${contactName} — ${retailer}` : `${contactName}`;

  const rawCat = s(p.Category);
  const category = isRegionalOrCorporateHQ(rawCat) ? CAT_HQ : rawCat || "Kingpin";

  return {
    id: makeId("kingpin", coords, p),
    kind: "kingpin",
    label,
    retailer,
    name: contactName,
    address: s(p.Address),
    city: s(p.City),
    state: s(p.State),
    zip: s(p.Zip),
    category,
    suppliers: s(p.Suppliers),
    email: s(p.Email) || "TBD",
    phoneOffice: s(p.OfficePhone || p["Office Phone"] || p.PhoneOffice) || "TBD",
    phoneCell: s(p.CellPhone || p["Cell Phone"] || p.PhoneCell) || "TBD",
    coords,
  };
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

  const directionsAbortRef = useRef<AbortController | null>(null);
  const routeDebounceRef = useRef<number | null>(null);
  const lastRouteKeyRef = useRef<string>("");

  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const lastNetworkSummaryKeyRef = useRef<string>("");
  const dataLoadedRef = useRef<boolean>(false);

  const [routeMode, setRouteMode] = useState<RouteMode>("none");
  const routeModeRef = useRef<RouteMode>("none");

  // ✅ Keep only ONE open popup at a time (prevents stacking)
  const activePopupRef = useRef<mapboxgl.Popup | null>(null);

  const basePath = useMemo(() => {
    const bp = (process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app").trim();
    return bp || "/certis_agroute_app";
  }, []);

  const token = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
    return env || (MAPBOX_TOKEN || "").trim();
  }, []);

  // ✅ Versioned Mapbox image id to dodge stale caches
  const KINGPIN_ICON_VERSION = "K16";
  const KINGPIN_ICON_ID = useMemo(() => `kingpin-icon-${KINGPIN_ICON_VERSION}`, []);

  // ✅ Kingpin visual tuning
  const KINGPIN_SHAPE = useMemo<"circle" | "star">(() => "star", []);
  const KINGPIN_FILL = "#2563eb";
  const KINGPIN_STROKE = "#0b1220";
  const KINGPIN_STROKE_W = 6;

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

  const setRouteModeSafe = (next: RouteMode) => {
    if (routeModeRef.current === next) return;
    routeModeRef.current = next;
    setRouteMode(next);
  };

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

    const ensureKingpinIcon = async () => {
      const m = mapRef.current;
      if (!m) return;
      if (m.hasImage(KINGPIN_ICON_ID)) return;

      // 1) Primary: SVG → Canvas → addImage
      try {
        const img = await rasterizeSvgToMapboxImage(KINGPIN_SVG, 64, 2);
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

      // HQ
      if (!map.getLayer(LYR_HQ)) {
        map.addLayer({
          id: LYR_HQ,
          type: "circle",
          source: SRC_RETAILERS,
          filter: ["==", ["get", "Category"], CAT_HQ],
          paint: {
            "circle-radius": 6,
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
            "icon-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              3,
              0.18,
              5,
              0.2,
              7,
              0.22,
              9,
              0.24,
              11,
              0.25,
              13,
              0.26,
              15,
              0.26,
              17,
              0.26,
            ],
            "icon-anchor": "center",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
      }

      // Kingpin hitbox (mobile friendly)
      if (!map.getLayer(LYR_KINGPINS_HIT)) {
        map.addLayer({
          id: LYR_KINGPINS_HIT,
          type: "circle",
          source: SRC_KINGPINS,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 18, 5, 20, 7, 22, 10, 24, 12, 26],
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

      // ✅ Load data only once (even if map "load" fires again)
      if (!dataLoadedRef.current) {
        dataLoadedRef.current = true;
        await loadData();
      }

      applyFilters();
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

      try {
        activePopupRef.current?.remove();
      } catch {}
      activePopupRef.current = null;

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
        kind === "hq" ? `${retailer || "Regional HQ"} — Regional HQ` : `${retailer || "Retailer"} — ${name || "Site"}`;

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
      const st = makeKingpinStopFromFeature(f);
      if (!st) continue;
      allStops.push(st);
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoomToStop) return;
    map.flyTo({ center: zoomToStop.coords, zoom: 12.5, essential: true });
  }, [zoomToStop]);

  function buildRouteCoords(): [number, number][] {
    // ✅ Home waypoint is first if present: Home → Stop1 → Stop2 → ...
    const pts: [number, number][] = [];
    if (homeCoords && Array.isArray(homeCoords) && homeCoords.length === 2) {
      pts.push(homeCoords);
    }
    for (const st of tripStops || []) {
      if (st?.coords && Array.isArray(st.coords) && st.coords.length === 2) pts.push(st.coords);
    }
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
      setRouteModeSafe("none");
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
        setRouteModeSafe("roads");
      } catch (e: any) {
        if (e?.name === "AbortError") return;

        src.setData({
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: { type: "LineString", coordinates: pts }, properties: { fallback: true } }],
        } as any);
        setRouteModeSafe("fallback");
      }
    }, 150);
  }

  useEffect(() => {
    updateRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripStops, homeCoords, token]);

  function closeActivePopup() {
    try {
      activePopupRef.current?.remove();
    } catch {}
    activePopupRef.current = null;
  }

  function openSinglePopupAt(coords: [number, number], html: string) {
    const map = mapRef.current;
    if (!map) return null;

    closeActivePopup();

    const popup = new mapboxgl.Popup({ offset: 14, closeOnMove: false }).setLngLat(coords).setHTML(html).addTo(map);
    activePopupRef.current = popup;
    return popup;
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

    openSinglePopupAt(coords, popupHtml);

    setTimeout(() => {
      const btn = document.getElementById(addBtnId);
      if (btn) (btn as HTMLButtonElement).onclick = () => onAddStop(stop);
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

    const clickLngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    const candidates = (featuresRaw || [])
      .filter(Boolean)
      .map((f: any) => {
        const coords = (f.geometry?.coordinates ?? null) as [number, number] | null;
        const p = f.properties ?? {};
        if (!coords) return null;
        return {
          f,
          coords,
          p,
          d: distanceSq(clickLngLat, coords),
          label: kingpinDisplayName(p),
          key: kingpinStableKey(p, coords),
        };
      })
      .filter(Boolean) as Array<{ f: any; coords: [number, number]; p: any; d: number; label: string; key: string }>;

    const byKey: Record<string, { f: any; coords: [number, number]; p: any; d: number; label: string; key: string }> = {};
    for (const c of candidates) {
      if (!byKey[c.key] || c.d < byKey[c.key].d) byKey[c.key] = c;
    }
    const uniq = Object.values(byKey).sort((a, b) => a.d - b.d || a.label.localeCompare(b.label));

    if (!uniq.length) return;

    const defaultPick = uniq[0];
    const anchorCoords = defaultPick.coords;

    const selectId = safeDomId("kp-select");
    const addBtnId = safeDomId("kp-add");
    const hasMany = uniq.length > 1;

    const initialStop = makeKingpinStopFromFeature(defaultPick.f);
    if (!initialStop) return;

    const header = s(defaultPick.p.Retailer) || "Unknown Retailer";
    const titleRaw = defaultPick.p.ContactTitle || defaultPick.p.Title || defaultPick.p["Contact Title"] || "";
    const title = s(titleRaw);

    const optionsHtml = uniq
      .map((c, idx) => {
        const sel = idx === 0 ? ` selected="selected"` : "";
        const text = c.label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const val = c.key.replace(/"/g, "&quot;");
        return `<option value="${val}"${sel}>${text}</option>`;
      })
      .join("");

    const chooserHtml = hasMany
      ? `
        <div style="margin:8px 0 10px 0;">
          <div style="font-size:12px;font-weight:700;color:#facc15;margin-bottom:4px;">Multiple Kingpins here</div>
          <select id="${selectId}" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:#0b1220;color:#fff;font-size:13px;">
            ${optionsHtml}
          </select>
        </div>
      `
      : "";

    const popupHtml = `
      <div style="font-size:13px;min-width:320px;max-width:380px;color:#fff;line-height:1.3;font-family:Segoe UI,Arial;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
          <div>
            <div style="font-size:16px;font-weight:800;margin-bottom:6px;color:#facc15;">${header}</div>
          </div>
          <div style="opacity:0.7;font-weight:700;">KP</div>
        </div>

        ${chooserHtml}

        <div id="kp-details">
          <div style="font-weight:800;margin-bottom:2px;">${(initialStop.name || "Kingpin").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          ${title ? `<div style="margin-bottom:4px;">${title.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>` : ""}
          <div style="margin-bottom:6px;">${s(initialStop.address).replace(/</g, "&lt;").replace(/>/g, "&gt;")}<br/>${s(
            initialStop.city
          )}, ${s(initialStop.state)} ${s(initialStop.zip)}</div>

          ${
            initialStop.category
              ? `<div style="margin-bottom:6px;"><span style="font-weight:800;color:#facc15;">Category:</span> ${s(
                  initialStop.category
                ).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`
              : ""
          }

          <div style="margin-bottom:8px;"><span style="font-weight:800;color:#facc15;">Suppliers:</span> ${
            s(initialStop.suppliers).trim() ? s(initialStop.suppliers).replace(/</g, "&lt;").replace(/>/g, "&gt;") : "Not listed"
          }</div>

          <div style="margin-bottom:4px;">Office: ${s(initialStop.phoneOffice)} • Cell: ${s(initialStop.phoneCell)}</div>
          <div style="margin-bottom:10px;">Email: ${s(initialStop.email)}</div>
        </div>

        <button id="${addBtnId}" style="padding:7px 10px;border:none;background:#facc15;border-radius:6px;font-weight:900;font-size:13px;color:#111827;cursor:pointer;width:100%;">
          ➕ Add to Trip
        </button>
      </div>
    `;

    openSinglePopupAt(anchorCoords, popupHtml);

    setTimeout(() => {
      let current = defaultPick;

      const updateDetails = (pick: typeof defaultPick) => {
        const stop = makeKingpinStopFromFeature(pick.f);
        if (!stop) return;

        const p = pick.p ?? {};
        const titleRaw2 = p.ContactTitle || p.Title || p["Contact Title"] || "";
        const title2 = s(titleRaw2);

        const detailsEl = document.getElementById("kp-details");
        if (!detailsEl) return;

        const safe = (x: string) => s(x).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        detailsEl.innerHTML = `
          <div style="font-weight:800;margin-bottom:2px;">${safe(stop.name || "Kingpin")}</div>
          ${title2 ? `<div style="margin-bottom:4px;">${safe(title2)}</div>` : ""}
          <div style="margin-bottom:6px;">${safe(stop.address || "")}<br/>${safe(stop.city || "")}, ${safe(stop.state || "")} ${safe(
          stop.zip || ""
        )}</div>
          ${
            stop.category
              ? `<div style="margin-bottom:6px;"><span style="font-weight:800;color:#facc15;">Category:</span> ${safe(stop.category)}</div>`
              : ""
          }
          <div style="margin-bottom:8px;"><span style="font-weight:800;color:#facc15;">Suppliers:</span> ${
            safe(stop.suppliers || "").trim() ? safe(stop.suppliers || "") : "Not listed"
          }</div>
          <div style="margin-bottom:4px;">Office: ${safe(stop.phoneOffice || "TBD")} • Cell: ${safe(stop.phoneCell || "TBD")}</div>
          <div style="margin-bottom:10px;">Email: ${safe(stop.email || "TBD")}</div>
        `;

        const btn = document.getElementById(addBtnId);
        if (btn) (btn as HTMLButtonElement).onclick = () => onAddStop(stop);
      };

      updateDetails(defaultPick);

      if (hasMany) {
        const sel = document.getElementById(selectId) as HTMLSelectElement | null;
        if (sel) {
          sel.onchange = () => {
            const key = sel.value;
            const found = uniq.find((u) => u.key === key);
            if (found) {
              current = found;
              updateDetails(found);
            }
          };
        }
      }

      const btn = document.getElementById(addBtnId);
      if (btn) {
        (btn as HTMLButtonElement).onclick = () => {
          const stop = makeKingpinStopFromFeature(current.f);
          if (stop) onAddStop(stop);
        };
      }
    }, 0);
  }

  return (
    <div className="relative w-full h-full min-h-0">
      <div ref={containerRef} className="w-full h-full min-h-[55vh] sm:min-h-0" />

      {/* Route status (only shows when fallback is active) */}
      {routeMode === "fallback" && (
        <div className="absolute top-4 left-4 z-10">
          <div
            className="rounded-xl border border-white/10 bg-neutral-900/90 shadow-2xl backdrop-blur px-3 py-2"
            style={{ maxWidth: 340 }}
          >
            <div className="text-[12px] font-extrabold text-yellow-300">Route fallback active</div>
            <div className="text-[11px] text-white/80 mt-0.5">
              Using a straight-line polyline (Directions API failed). Check token/network or retry.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
