"use client";

// ============================================================================
// 💠 CERTIS AGROUTE DATABASE — GOLD (K11-safe + Midwest-view + Popup polish)
//   • Satellite-streets-v12 + Mercator (Bailey Rule)
//   • Retailers filtered by: State ∩ Retailer ∩ Category ∩ Supplier
//   • Regional HQ filtered ONLY by State (Bailey HQ rule)
//   • Kingpins always visible overlay (not filtered)
//   • Applies ~100m offset to Kingpins (lng + 0.0013) like K10
//   • Kingpin icon size is ZOOM-SCALED (tuned down slightly)
//   • Trip route: Mapbox Directions (driving) + straight-line fallback
//   • ✅ Loop guards: map init once, sources/layers added once, route abort/debounce
//   • ✅ UI polish: one-line Suppliers + Category/Suppliers label color match
//   • ✅ Regression fix: Multi-Kingpin dropdown when overlaps occur
//   • ✅ NEW: Canonical category normalization + floating legend overlay
//     - Canonical categories (5): Agronomy, Grain/Feed, C-Store/Service/Energy,
//       Distribution, Regional HQ
//     - Grain OR Feed => Grain/Feed
//     - Any hybrid containing Agronomy => Agronomy
//
// K13 PATCH (Chrome-only Kingpin legend mismatch):
//   ✅ Version BOTH the URL and the Mapbox image ID so Chrome/Mapbox cannot reuse
//      a stale cached PNG under the same image key.
//   - KINGPIN_ICON_VERSION = "K13"
//   - KINGPIN_ICON_ID = `kingpin-icon-${KINGPIN_ICON_VERSION}`
//   - kingpin.png?v=K13
//
// LEGEND PATCH (Chrome-proof):
//   ✅ Legend Kingpin icon is now a simple dark-blue circle (no <img>, no glyph).
//   If this displays correctly everywhere, we can later swap it to a 5-point star.
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

export type RetailerSummaryRow = {
  retailer: string;
  count: number;
  suppliers: string[];
  categories: string[];
  states: string[];
};

export type CategoryCount = {
  category: string;
  count: number;
};

export type RetailerNetworkSummaryRow = {
  retailer: string;
  totalLocations: number; // ALL retailer features (including non-agronomy, excluding kingpins)
  agronomyLocations: number; // retailer features whose category includes "agronomy" (excluding HQ)
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

// ✅ K13: Version BOTH URL + Mapbox image ID (Chrome cache-proof)
const KINGPIN_ICON_VERSION = "K13";
const KINGPIN_ICON_ID = `kingpin-icon-${KINGPIN_ICON_VERSION}`;

const KINGPIN_OFFSET_LNG = 0.0013;

// Canonical categories (the only ones we expose to filters/UX)
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

/**
 * HQ detection supports:
 * - "Corporate HQ" (legacy)
 * - "Regional HQ" (current)
 * - "HQ" (if ever used)
 */
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

/**
 * Canonical category normalization (Bailey Rules):
 * - Any hybrid containing Agronomy => Agronomy
 * - Grain OR Feed (or any hybrid that contains either) => Grain/Feed
 * - C-Store/Service/Energy => C-Store/Service/Energy
 * - Distribution => Distribution
 * - HQ => Regional HQ
 * - If none match => "" (we leave uncategorized)
 */
function normalizeCategory(rawCategory: any): string {
  const raw = s(rawCategory);
  const low = raw.toLowerCase();
  if (!low) return "";

  // HQ wins into dedicated bucket
  if (isRegionalOrCorporateHQ(raw)) return CAT_HQ;

  // Agronomy overrides any hybrid
  if (low.includes("agronomy")) return CAT_AGRONOMY;

  // Grain/Feed: either token implies Grain/Feed
  const hasGrain = low.includes("grain");
  const hasFeed = low.includes("feed");
  if (hasGrain || hasFeed) return CAT_GRAINFEED;

  // C-Store/Service/Energy
  if (low.includes("c-store") || low.includes("c store") || low.includes("service") || low.includes("energy")) {
    return CAT_CSTORE;
  }

  // Distribution
  if (low.includes("distribution")) return CAT_DISTRIBUTION;

  return "";
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

  // ✅ SINGLE SOURCE OF TRUTH for the Kingpin icon URL (map layer + legend)
  // ✅ K13: URL is versioned
  const KINGPIN_ICON_URL = useMemo(() => {
    return `${basePath}/icons/kingpin.png?v=${KINGPIN_ICON_VERSION}`;
  }, [basePath]);

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

    // ✅ ResizeObserver: keeps the map canvas synced with layout changes
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

    // ✅ Mobile: force resize on orientation/viewport changes (prevents "blank until rotate")
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

    map.on("load", async () => {
      // Sources (once)
      if (!map.getSource(SRC_RETAILERS)) {
        map.addSource(SRC_RETAILERS, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getSource(SRC_KINGPINS)) {
        map.addSource(SRC_KINGPINS, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getSource(SRC_ROUTE)) {
        map.addSource(SRC_ROUTE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }

      // Retailers layer (canonical categories)
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

      // HQ layer (canonical)
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

      // Kingpin icon (load once)
      // ✅ K13: image ID is versioned; if Chrome/Mapbox cached an older PNG under
      //         the old ID, it cannot be reused.
      try {
        if (!map.hasImage(KINGPIN_ICON_ID)) {
          const img = await new Promise<any>((resolve, reject) => {
            map.loadImage(KINGPIN_ICON_URL, (err, image) => {
              if (err || !image) reject(err || new Error("loadImage failed"));
              else resolve(image);
            });
          });
          map.addImage(KINGPIN_ICON_ID, img, { pixelRatio: 2 });
        }
      } catch (e) {
        console.warn("[CertisMap] Kingpin icon load failed:", e);
      }

      // Kingpins layer
      if (!map.getLayer(LYR_KINGPINS)) {
        map.addLayer({
          id: LYR_KINGPINS,
          type: "symbol",
          source: SRC_KINGPINS,
          layout: {
            "icon-image": KINGPIN_ICON_ID,
            "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.014, 5, 0.023, 7, 0.032, 9, 0.041, 12, 0.05],
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
      }

      // Route line
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

      [LYR_RETAILERS, LYR_HQ, LYR_KINGPINS].forEach((lyr) => {
        map.on("mouseenter", lyr, setPointer);
        map.on("mouseleave", lyr, clearPointer);
      });

      map.on("click", LYR_RETAILERS, (e) => handleRetailerClick(e));
      map.on("click", LYR_HQ, (e) => handleRetailerClick(e));
      map.on("click", LYR_KINGPINS, (e) => handleKingpinClick(e));

      requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {}
      });

      console.info("[CertisMap] Loaded.");
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
  }, [basePath, token, KINGPIN_ICON_URL]);

  function buildRetailerNetworkSummary(retailersData: FeatureCollection): RetailerNetworkSummaryRow[] {
    const acc: Record<
      string,
      { total: number; agronomy: number; states: Set<string>; catCounts: Map<string, number> }
    > = {};

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
    onRetailersLoaded(
      uniqSorted((retailersData.features ?? []).map((f: any) => s(f.properties?.Retailer)).filter(Boolean))
    );

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
    map.setFilter(LYR_HQ, hqFilter as any);
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

        src.setData({
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: geom, properties: {} }],
        } as any);
      } catch (e: any) {
        if (e?.name === "AbortError") return;

        src.setData({
          type: "FeatureCollection",
          features: [
            { type: "Feature", geometry: { type: "LineString", coordinates: pts }, properties: { fallback: true } },
          ],
        } as any);
      }
    }, 150);
  }

  useEffect(() => {
    updateRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripStops, token]);

  function handleRetailerClick(e: mapboxgl.MapMouseEvent) {
    const map = mapRef.current;
    if (!map) return;

    const features = map.queryRenderedFeatures(e.point, { layers: [LYR_RETAILERS, LYR_HQ] }) as any[];
    if (!features.length) return;

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
      label:
        kind === "hq"
          ? `${retailer || "Regional HQ"} — Regional HQ`
          : `${retailer || "Retailer"} — ${name || "Site"}`,
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

    const featuresRaw = map.queryRenderedFeatures(e.point, { layers: [LYR_KINGPINS] }) as any[];
    if (!featuresRaw.length) return;

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

      // ✅ If kingpin data ever still says "Corporate HQ", force display label to "Regional HQ"
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
      {/* ✅ Key mobile fix: ensure the map container has non-zero height before Mapbox paints */}
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

            {/* ✅ KINGPIN LEGEND: TEMPORARY SIMPLE SYMBOL (Chrome-proof) */}
            <div className="flex items-center gap-2 pt-1">
              <span
                className="inline-block h-3.5 w-3.5 rounded-full border border-white/20"
                style={{
                  background: "#1e3a8a", // dark blue
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.35) inset",
                }}
                aria-hidden="true"
              />
              <span>Kingpin</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
