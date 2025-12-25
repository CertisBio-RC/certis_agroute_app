"use client";

// ============================================================================
// 💠 CERTIS AGROUTE DATABASE — GOLD (K12 — Canonical Categories + Floating Legend)
//   • Satellite-streets-v12 + Mercator (Bailey Rule)
//   • Retailers filtered by: State ∩ Retailer ∩ Category ∩ Supplier
//   • Regional HQ filtered ONLY by State (Bailey HQ rule)
//   • Kingpins always visible overlay (not filtered)
//   • Applies ~100m offset to Kingpins (lng + 0.0013) like K10
//   • Kingpin icon size is ZOOM-SCALED (tuned down slightly — Problem B)
//   • Trip route: Mapbox Directions (driving) + straight-line fallback
//   • ✅ Loop guards: map init once, sources/layers added once, route abort/debounce
//   • ✅ UI polish: one-line Suppliers + Category/Suppliers label color match
//   • ✅ Multi-Kingpin dropdown when overlaps occur
//
//   ✅ NEW (Canonical Categories):
//     - Enforces EXACTLY 5 categories:
//         Agronomy | Grain/Feed | C-Store/Service/Energy | Distribution | Regional HQ
//     - Rules:
//         • If ANY token includes "HQ" (regional/corporate/hq) => Regional HQ
//         • Else if ANY token includes "Agronomy" => Agronomy wins (hybrids default to Agronomy)
//         • Else if ANY token includes Grain OR Feed => Grain/Feed
//         • Else if token includes C-Store or Service or Energy => C-Store/Service/Energy
//         • Else if token includes Distribution => Distribution
//         • Else => Grain/Feed (safe default to avoid new/garbage categories)
//
//   ✅ NEW (Legend):
//     - Floating legend overlay on the map (bottom-left)
//     - Explains the 5 categories + HQ + Kingpin overlay
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
  category?: string; // canonical category for retailers/HQ; "Kingpin" for kingpins
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
  agronomyLocations: number; // retailer features whose canonical category is "Agronomy" (excluding HQ)
  states: string[];

  // Canonical category breakdown from retailer features.
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
  selectedCategories: string[]; // should now only be the 5 canonical categories
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
const LYR_HQ = "corp-hq-circle"; // Keep ID stable to avoid layer churn
const LYR_KINGPINS = "kingpin-symbol";
const LYR_ROUTE = "trip-route";

const KINGPIN_ICON_ID = "kingpin-icon";
const KINGPIN_OFFSET_LNG = 0.0013;

// Canonical category field we inject into retailers.geojson features in-memory
const CANON_CAT_FIELD = "CanonCategory";

const CANON_CATEGORIES = [
  "Agronomy",
  "Grain/Feed",
  "C-Store/Service/Energy",
  "Distribution",
  "Regional HQ",
] as const;

type CanonCategory = (typeof CANON_CATEGORIES)[number];

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

function splitCategories(raw: any) {
  const str = s(raw);
  if (!str) return [];
  return str
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Canonical Category Normalization (Bailey Rule)
 * - We never allow "Feed/Grain" and "Grain/Feed" to exist as different categories.
 * - Agronomy wins any hybrid (unless it's clearly an HQ record).
 */
function normalizeCategory(raw: any): CanonCategory {
  const rawStr = s(raw);
  const tokens = splitCategories(rawStr);
  const hay = (tokens.length ? tokens.join(" | ") : rawStr).toLowerCase();

  // 1) HQ detection => Regional HQ
  // Supports: "Corporate HQ", "Regional HQ", "HQ"
  if (hay.includes("hq")) {
    // If anyone ever had "HQ" without qualifiers, we still treat it as the HQ bucket.
    return "Regional HQ";
  }

  // 2) Agronomy wins hybrids
  if (hay.includes("agronomy")) {
    return "Agronomy";
  }

  // 3) Grain/Feed bucket (grain OR feed anywhere)
  if (hay.includes("grain") || hay.includes("feed")) {
    return "Grain/Feed";
  }

  // 4) C-Store/Service/Energy
  // (we allow variations like cstore, c-store, service, energy)
  if (hay.includes("c-store") || hay.includes("cstore") || hay.includes("service") || hay.includes("energy")) {
    return "C-Store/Service/Energy";
  }

  // 5) Distribution
  if (hay.includes("distribution")) {
    return "Distribution";
  }

  // Safe default: keep it in the main non-agronomy bucket
  return "Grain/Feed";
}

/**
 * HQ detection should now be based on canonical category.
 * (We still support legacy raw strings via normalizeCategory.)
 */
function isRegionalHQ(rawCategory: any) {
  return normalizeCategory(rawCategory) === "Regional HQ";
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

  // Prevent accidental callback loops / re-emits if parent causes re-render
  const lastNetworkSummaryKeyRef = useRef<string>("");

  const basePath = useMemo(() => {
    const bp = (process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app").trim();
    return bp || "/certis_agroute_app";
  }, []);

  const token = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
    return env || (MAPBOX_TOKEN || "").trim();
  }, []);

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

      // Retailers layer (NON-HQ only) — color by CANONICAL category
      if (!map.getLayer(LYR_RETAILERS)) {
        map.addLayer({
          id: LYR_RETAILERS,
          type: "circle",
          source: SRC_RETAILERS,
          filter: ["!=", ["get", CANON_CAT_FIELD], "Regional HQ"],
          paint: {
            "circle-radius": 4,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#111827",
            "circle-color": [
              "match",
              ["get", CANON_CAT_FIELD],
              "Agronomy",
              "#22c55e",
              "Grain/Feed",
              "#f97316",
              "C-Store/Service/Energy",
              "#0ea5e9",
              "Distribution",
              "#a855f7",
              // default
              "#f9fafb",
            ],
          },
        });
      }

      // HQ layer — show ONLY canonical HQ bucket
      if (!map.getLayer(LYR_HQ)) {
        map.addLayer({
          id: LYR_HQ,
          type: "circle",
          source: SRC_RETAILERS,
          filter: ["==", ["get", CANON_CAT_FIELD], "Regional HQ"],
          paint: {
            "circle-radius": 6,
            "circle-color": "#ff0000",
            "circle-stroke-color": "#facc15",
            "circle-stroke-width": 2,
          },
        });
      }

      // Kingpin icon
      try {
        if (!map.hasImage(KINGPIN_ICON_ID)) {
          const iconUrl = `${basePath}/icons/kingpin.png`;
          const img = await new Promise<any>((resolve, reject) => {
            map.loadImage(iconUrl, (err, image) => {
              if (err || !image) reject(err || new Error("loadImage failed"));
              else resolve(image);
            });
          });
          map.addImage(KINGPIN_ICON_ID, img, { pixelRatio: 2 });
        }
      } catch (e) {
        console.warn("[CertisMap] Kingpin icon load failed:", e);
      }

      // Kingpins layer (slightly smaller)
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

      try {
        map.remove();
      } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, token]);

  function buildRetailerNetworkSummary(retailersData: FeatureCollection): RetailerNetworkSummaryRow[] {
    const acc: Record<
      string,
      {
        total: number;
        agronomy: number;
        states: Set<string>;
        catCounts: Map<string, number>;
      }
    > = {};

    for (const f of retailersData.features ?? []) {
      const p = f.properties ?? {};
      const retailer = s(p.Retailer) || "Unknown Retailer";
      const state = s(p.State);

      const canon = (s(p[CANON_CAT_FIELD]) as CanonCategory) || normalizeCategory(p.Category);
      const isHQ = canon === "Regional HQ";

      if (!acc[retailer]) {
        acc[retailer] = {
          total: 0,
          agronomy: 0,
          states: new Set<string>(),
          catCounts: new Map<string, number>(),
        };
      }

      acc[retailer].total += 1;
      if (state) acc[retailer].states.add(state);

      // Canonical breakdown
      acc[retailer].catCounts.set(canon, (acc[retailer].catCounts.get(canon) || 0) + 1);

      // Agronomy locations: canonical category is Agronomy, excluding HQ
      if (!isHQ && canon === "Agronomy") {
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

  function withCanonicalCategories(retailersData: FeatureCollection): FeatureCollection {
    return {
      ...retailersData,
      features: (retailersData.features ?? []).map((f) => {
        const p = f.properties ?? {};
        const canon = normalizeCategory(p.Category);
        return {
          ...f,
          properties: {
            ...p,
            [CANON_CAT_FIELD]: canon,
          },
        };
      }),
    };
  }

  async function loadData() {
    const map = mapRef.current;
    if (!map) return;

    const retailersUrl = `${basePath}/data/retailers.geojson`;
    const kingpinsUrl = `${basePath}/data/kingpin.geojson`;

    const [r1, r2] = await Promise.all([fetch(retailersUrl), fetch(kingpinsUrl)]);
    const retailersDataRaw = (await r1.json()) as FeatureCollection;
    const kingpinData = (await r2.json()) as FeatureCollection;

    // ✅ Canonicalize categories in-memory (source of truth for UI + filtering)
    const retailersData = withCanonicalCategories(retailersDataRaw);

    const offsetKingpins: FeatureCollection = {
      ...kingpinData,
      features: (kingpinData.features ?? []).map((f: any) => {
        const [lng, lat] = f.geometry?.coordinates ?? [0, 0];
        return {
          ...f,
          geometry: { ...f.geometry, coordinates: [lng + KINGPIN_OFFSET_LNG, lat] },
        };
      }),
    };

    retailersRef.current = retailersData;
    kingpinsRef.current = offsetKingpins;

    (map.getSource(SRC_RETAILERS) as mapboxgl.GeoJSONSource).setData(retailersData as any);
    (map.getSource(SRC_KINGPINS) as mapboxgl.GeoJSONSource).setData(offsetKingpins as any);

    // ✅ Build + emit retailer network summary (ALL locations)
    if (onRetailerNetworkSummaryLoaded) {
      const rows = buildRetailerNetworkSummary(retailersData);

      // Guard re-emit loops: only emit if data materially changes
      const key = rows
        .slice(0, 250)
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

      const canon = (s(p[CANON_CAT_FIELD]) as CanonCategory) || normalizeCategory(p.Category);
      const kind: StopKind = canon === "Regional HQ" ? "hq" : "retailer";

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
        category: canon,
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

    // States + Retailers from retailersData (plus kingpins for state list)
    onStatesLoaded(uniqSorted(allStops.map((st) => s(st.state).toUpperCase()).filter(Boolean)));

    onRetailersLoaded(
      uniqSorted((retailersData.features ?? []).map((f: any) => s(f.properties?.Retailer)).filter(Boolean))
    );

    // ✅ Categories: ALWAYS the canonical 5 in stable order
    onCategoriesLoaded([...CANON_CATEGORIES]);

    // Suppliers unchanged
    onSuppliersLoaded(uniqSorted(allStops.flatMap((st) => splitMulti(st.suppliers))));
  }

  function applyFilters() {
    const map = mapRef.current;
    const retailersData = retailersRef.current;
    if (!map || !retailersData) return;

    // Retailers layer is already filtered to non-HQ, but we keep filter logic clean.
    const retailerFilter: any[] = ["all"];
    retailerFilter.push(["!=", ["get", CANON_CAT_FIELD], "Regional HQ"]);

    if (selectedStates.length) retailerFilter.push(["in", ["upcase", ["get", "State"]], ["literal", selectedStates]]);
    if (selectedRetailers.length) retailerFilter.push(["in", ["get", "Retailer"], ["literal", selectedRetailers]]);

    // ✅ Canonical category filtering = exact match
    if (selectedCategories.length) {
      retailerFilter.push(["in", ["get", CANON_CAT_FIELD], ["literal", selectedCategories]]);
    }

    if (selectedSuppliers.length) {
      retailerFilter.push([
        "any",
        ...selectedSuppliers.map((sp) => [">=", ["index-of", sp.toLowerCase(), ["downcase", ["get", "Suppliers"]]], 0]),
      ]);
    }

    // HQ filter: Bailey HQ rule (HQ filtered only by State)
    const hqFilter: any[] = ["all"];
    hqFilter.push(["==", ["get", CANON_CAT_FIELD], "Regional HQ"]);
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
            {
              type: "Feature",
              geometry: { type: "LineString", coordinates: pts },
              properties: { fallback: true },
            },
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

    const canon = (s(p[CANON_CAT_FIELD]) as CanonCategory) || normalizeCategory(p.Category);
    const suppliers = s(p.Suppliers) || "Not listed";

    const kind: StopKind = canon === "Regional HQ" ? "hq" : "retailer";

    const stop: Stop = {
      id: makeId(kind, coords, p),
      kind,
      label:
        kind === "hq" ? `${retailer || "Regional HQ"} — Regional HQ` : `${retailer || "Retailer"} — ${name || "Site"}`,
      retailer,
      name,
      address,
      city,
      state,
      zip,
      category: canon,
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
        <div style="margin-bottom:6px;"><span style="font-weight:700;color:#facc15;">Category:</span> ${canon}</div>
        <div style="margin-bottom:8px;"><span style="font-weight:700;color:#facc15;">Suppliers:</span> ${suppliers}</div>
        <button id="${addBtnId}" style="padding:7px 10px;border:none;background:#facc15;border-radius:5px;font-weight:700;font-size:13px;color:#111827;cursor:pointer;width:100%;">
          ➕ Add to Trip
        </button>
      </div>
    `;

    // NOTE: close button styling stays in globals.css (.mapboxgl-popup-close-button)
    const popup = new mapboxgl.Popup({ offset: 14, closeOnMove: false }).setLngLat(coords).setHTML(popupHtml).addTo(map);

    setTimeout(() => {
      const btn = document.getElementById(addBtnId);
      if (btn) (btn as HTMLButtonElement).onclick = () => onAddStop(stop);
      try {
        popup.getElement();
      } catch {}
    }, 0);
  }

  // ✅ Multi-Kingpin dropdown restored (handles overlap clicks)
  function handleKingpinClick(e: mapboxgl.MapMouseEvent) {
    const map = mapRef.current;
    if (!map) return;

    const featuresRaw = map.queryRenderedFeatures(e.point, { layers: [LYR_KINGPINS] }) as any[];
    if (!featuresRaw.length) return;

    // Stable ordering for dropdown
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
      const category = s(p.Category) || "Kingpin";
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

          <div style="margin-bottom:4px;">${st.address || ""}<br/>${st.city || ""}, ${st.state || ""} ${
        st.zip || ""
      }</div>

          <div style="margin-bottom:6px;"><span style="font-weight:700;color:#facc15;">Category:</span> ${
            st.category || "Kingpin"
          }</div>

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

  // Floating legend (minimal, high-contrast, pointer-safe)
  const legend = (
    <div
      className="absolute bottom-3 left-3 z-20 pointer-events-auto"
      style={{
        maxWidth: 240,
        background: "rgba(17,24,39,0.88)", // slate-900-ish
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        boxShadow: "0 16px 45px rgba(0,0,0,0.55)",
        padding: 10,
        backdropFilter: "blur(6px)",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 12, color: "rgba(253,224,71,0.95)", marginBottom: 8 }}>
        Legend
      </div>

      <div style={{ display: "grid", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.9)" }}>
        <LegendRow dotColor="#22c55e" label="Agronomy" />
        <LegendRow dotColor="#f97316" label="Grain/Feed" />
        <LegendRow dotColor="#0ea5e9" label="C-Store/Service/Energy" />
        <LegendRow dotColor="#a855f7" label="Distribution" />
        <LegendHQRow label="Regional HQ" />
        <LegendIconRow iconUrl={`${basePath}/icons/kingpin.png`} label="Kingpin (always visible)" />
      </div>
    </div>
  );

  return (
    <div className="relative w-full h-full min-h-0">
      <div ref={containerRef} className="w-full h-full min-h-0" />
      {legend}
    </div>
  );
}

function LegendRow(props: { dotColor: string; label: string }) {
  const { dotColor, label } = props;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: dotColor,
          border: "1px solid rgba(17,24,39,0.9)",
          display: "inline-block",
        }}
      />
      <span>{label}</span>
    </div>
  );
}

function LegendHQRow(props: { label: string }) {
  const { label } = props;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: "#ff0000",
          border: "2px solid #facc15",
          display: "inline-block",
        }}
      />
      <span>{label}</span>
    </div>
  );
}

function LegendIconRow(props: { iconUrl: string; label: string }) {
  const { iconUrl, label } = props;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <img
        src={iconUrl}
        alt="Kingpin"
        style={{
          width: 14,
          height: 14,
          objectFit: "contain",
          transform: "translateY(1px)",
        }}
      />
      <span>{label}</span>
    </div>
  );
}
