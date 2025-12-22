"use client";

// ============================================================================
// 💠 CERTIS AGROUTE — GOLD (Interaction-safe + Build-safe + Home-aware routing)
//   • Satellite-streets-v12 + Mercator (Bailey Rule)
//   • Retailers filtered by: State ∩ Retailer ∩ Category ∩ Supplier
//   • Corporate HQ filtered ONLY by State (HQ rule)
//   • Kingpins always visible overlay (not filtered)
//   • Kingpin offset is DISPLAY ONLY; TRUE coords used for routing
//   • Trip route: Mapbox Directions (driving) + straight-line fallback
//
// ✅ FIX (CRITICAL): Prevent “Hudson Bay boot”
//   - NO initial fitBounds()
//   - Apply explicit Midwest jumpTo() ONCE after load
//   - Hard-skip invalid coords (lng/lat swap or garbage points)
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

  // TRUE coords for routing + canonical identity
  coords: [number, number]; // [lng, lat]

  // Optional display coords (used for flyTo / marker alignment)
  mapCoords?: [number, number];
};

export type RetailerSummaryRow = {
  retailer: string;
  count: number;
  suppliers: string[];
  categories: string[];
  states: string[];
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
};

const STYLE_URL = "mapbox://styles/mapbox/satellite-streets-v12";

// ✅ Upper Midwest / IA-centered default (Bailey)
const DEFAULT_CENTER: [number, number] = [-93.5, 41.5];
const DEFAULT_ZOOM = 5;

const SRC_RETAILERS = "retailers";
const SRC_KINGPINS = "kingpins";
const SRC_ROUTE = "trip-route-src";

const LYR_RETAILERS = "retailers-circle";
const LYR_HQ = "corp-hq-circle";
const LYR_KINGPINS = "kingpin-symbol";
const LYR_ROUTE = "trip-route";

const KINGPIN_ICON_ID = "kingpin-icon";
const KINGPIN_OFFSET_LNG = 0.0013;

// How close (meters) counts as “same location” for grouping multiple kingpins
const KINGPIN_GROUP_TOLERANCE_M = 60;

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

function isCorporateHQ(category: string) {
  const c = category.toLowerCase();
  return c.includes("corporate") && c.includes("hq");
}

function escapeHtml(v: string) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function distanceMeters(a: [number, number], b: [number, number]) {
  // Haversine
  const R = 6371000;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function isValidLngLat(coords: any): coords is [number, number] {
  if (!Array.isArray(coords) || coords.length !== 2) return false;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  if (lng < -180 || lng > 180) return false;
  if (lat < -90 || lat > 90) return false;
  return true;
}

function getRetailerNameForId(p: Record<string, any>) {
  return s(p.Retailer);
}

function getStopNameForId(kind: StopKind, p: Record<string, any>) {
  if (kind === "kingpin") return s(p.ContactName || p.Name || p.Contact || p["Contact Name"]);
  return s(p.Name);
}

function makeId(kind: StopKind, coords: [number, number], p: Record<string, any>) {
  const retailer = getRetailerNameForId(p);
  const name = getStopNameForId(kind, p);
  const st = s(p.State);
  const zip = s(p.Zip);
  return `${kind}:${retailer}|${name}|${st}|${zip}|${coords[0].toFixed(6)},${coords[1].toFixed(6)}`;
}

type KingpinEntry = {
  p: Record<string, any>;
  trueCoords: [number, number];
  mapCoords: [number, number];
};

function kingpinEntryFromFeature(f: Feature): KingpinEntry | null {
  const p = f.properties ?? {};
  const mapCoords = f.geometry?.coordinates;
  if (!isValidLngLat(mapCoords)) return null;

  const tLng = Number(p.__trueLng);
  const tLat = Number(p.__trueLat);

  const trueCoords: [number, number] =
    Number.isFinite(tLng) && Number.isFinite(tLat) && tLng >= -180 && tLng <= 180 && tLat >= -90 && tLat <= 90
      ? [tLng, tLat]
      : [mapCoords[0] - KINGPIN_OFFSET_LNG, mapCoords[1]];

  if (!isValidLngLat(trueCoords)) return null;

  return { p, trueCoords, mapCoords };
}

function enableAllInteractions(map: mapboxgl.Map) {
  try {
    map.dragPan.enable();
    map.scrollZoom.enable();
    map.boxZoom.enable();
    map.doubleClickZoom.enable();
    map.keyboard.enable();
    map.touchZoomRotate.enable();
  } catch {}
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
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const retailersRef = useRef<FeatureCollection | null>(null);
  const kingpinsRef = useRef<FeatureCollection | null>(null); // OFFSET features w/ __trueLng/__trueLat

  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const directionsAbortRef = useRef<AbortController | null>(null);
  const routeDebounceRef = useRef<number | null>(null);
  const lastRouteKeyRef = useRef<string>("");

  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const resizeDebounceRef = useRef<number | null>(null);
  const resizeRafRef = useRef<number | null>(null);

  // ✅ prevent initial flyTo if zoomToStop is pre-populated
  const prevZoomStopIdRef = useRef<string | null>(null);

  // ✅ ensure initial view is applied ONCE (explicit jumpTo, not fitBounds)
  const didSetInitialViewRef = useRef<boolean>(false);

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

  // Initialize previous zoomToStop id ONCE so first render doesn't auto-fly
  useEffect(() => {
    prevZoomStopIdRef.current = zoomToStop?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // INIT MAP (once)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      projection: { name: "mercator" },
      interactive: true,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");

    // ResizeObserver (debounced)
    try {
      resizeObsRef.current = new ResizeObserver(() => {
        const m = mapRef.current;
        if (!m) return;

        if (resizeDebounceRef.current) window.clearTimeout(resizeDebounceRef.current);

        resizeDebounceRef.current = window.setTimeout(() => {
          const mm = mapRef.current;
          if (!mm) return;

          if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
          resizeRafRef.current = requestAnimationFrame(() => {
            try {
              mm.resize();
            } catch {}
          });
        }, 80);
      });

      resizeObsRef.current.observe(containerRef.current);
    } catch {}

    const onLoad = async () => {
      enableAllInteractions(map);

      // Sources
      if (!map.getSource(SRC_RETAILERS)) {
        map.addSource(SRC_RETAILERS, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getSource(SRC_KINGPINS)) {
        map.addSource(SRC_KINGPINS, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getSource(SRC_ROUTE)) {
        map.addSource(SRC_ROUTE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
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
              [
                "all",
                ["==", ["index-of", "corporate", ["downcase", ["get", "Category"]]], -1],
                [">=", ["index-of", "agronomy", ["downcase", ["get", "Category"]]], 0],
              ],
              "#22c55e",
              [">=", ["index-of", "grain", ["downcase", ["get", "Category"]]], 0],
              "#f97316",
              [
                "any",
                [">=", ["index-of", "c-store", ["downcase", ["get", "Category"]]], 0],
                [">=", ["index-of", "service", ["downcase", ["get", "Category"]]], 0],
                [">=", ["index-of", "energy", ["downcase", ["get", "Category"]]], 0],
              ],
              "#0ea5e9",
              [">=", ["index-of", "distribution", ["downcase", ["get", "Category"]]], 0],
              "#a855f7",
              "#f9fafb",
            ],
          },
        });
      }

      // Corporate HQ layer
      if (!map.getLayer(LYR_HQ)) {
        map.addLayer({
          id: LYR_HQ,
          type: "circle",
          source: SRC_RETAILERS,
          filter: [">=", ["index-of", "corporate", ["downcase", ["get", "Category"]]], 0],
          paint: {
            "circle-radius": 7,
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

      if (!map.getLayer(LYR_KINGPINS)) {
        map.addLayer({
          id: LYR_KINGPINS,
          type: "symbol",
          source: SRC_KINGPINS,
          layout: {
            "icon-image": KINGPIN_ICON_ID,
            "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.015, 5, 0.025, 7, 0.035, 9, 0.045, 12, 0.055],
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
      }

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

      // Load + apply
      await loadData();
      applyFilters();
      updateHomeMarker();
      await updateRoute(true);

      // ✅ Explicit Midwest view ONCE (NO fitBounds)
      if (!didSetInitialViewRef.current) {
        didSetInitialViewRef.current = true;
        try {
          map.jumpTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
        } catch {}
      }

      requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {}
      });

      const setPointer = () => (map.getCanvas().style.cursor = "pointer");
      const clearPointer = () => (map.getCanvas().style.cursor = "");

      [LYR_RETAILERS, LYR_HQ, LYR_KINGPINS].forEach((lyr) => {
        map.on("mouseenter", lyr, setPointer);
        map.on("mouseleave", lyr, clearPointer);
      });

      map.on("click", LYR_RETAILERS, (e) => handleRetailerClick(e));
      map.on("click", LYR_HQ, (e) => handleRetailerClick(e));
      map.on("click", LYR_KINGPINS, (e) => handleKingpinClick(e));

      console.info("[CertisMap] Loaded. Initial view set to Midwest. Interactions enabled.");
    };

    map.on("load", onLoad);

    return () => {
      try {
        map.off("load", onLoad);
      } catch {}

      try {
        directionsAbortRef.current?.abort();
      } catch {}
      directionsAbortRef.current = null;

      if (routeDebounceRef.current) {
        window.clearTimeout(routeDebounceRef.current);
        routeDebounceRef.current = null;
      }

      if (resizeDebounceRef.current) {
        window.clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = null;
      }
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
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

  async function loadData() {
    const map = mapRef.current;
    if (!map) return;

    const retailersUrl = `${basePath}/data/retailers.geojson`;
    const kingpinsUrl = `${basePath}/data/kingpin.geojson`;

    const [r1, r2] = await Promise.all([fetch(retailersUrl), fetch(kingpinsUrl)]);

    if (!r1.ok) throw new Error(`Retailers fetch failed: ${r1.status} ${r1.statusText}`);
    if (!r2.ok) throw new Error(`Kingpins fetch failed: ${r2.status} ${r2.statusText}`);

    const retailersDataRaw = (await r1.json()) as FeatureCollection;
    const kingpinDataRaw = (await r2.json()) as FeatureCollection;

    // ✅ sanitize retailer features (skip invalid coords)
    const retailersData: FeatureCollection = {
      type: "FeatureCollection",
      features: (retailersDataRaw.features ?? []).filter((f: any) => {
        const coords = f?.geometry?.coordinates;
        const ok = isValidLngLat(coords);
        if (!ok) console.warn("[CertisMap] Skipping retailer feature with invalid coords:", coords, f?.properties);
        return ok;
      }),
    };

    // ✅ Build OFFSET kingpin features for map display, preserve TRUE coords in props
    const offsetKingpins: FeatureCollection = {
      type: "FeatureCollection",
      features: (kingpinDataRaw.features ?? [])
        .map((f: any) => {
          const coords = f?.geometry?.coordinates;
          if (!isValidLngLat(coords)) {
            console.warn("[CertisMap] Skipping kingpin feature with invalid coords:", coords, f?.properties);
            return null;
          }

          const [lng, lat] = coords as [number, number];
          const trueLng = lng;
          const trueLat = lat;

          const nextProps = { ...(f.properties ?? {}), __trueLng: trueLng, __trueLat: trueLat };

          return {
            ...f,
            properties: nextProps,
            geometry: { ...f.geometry, coordinates: [lng + KINGPIN_OFFSET_LNG, lat] }, // DISPLAY ONLY
          } as Feature;
        })
        .filter(Boolean) as Feature[],
    };

    retailersRef.current = retailersData;
    kingpinsRef.current = offsetKingpins;

    (map.getSource(SRC_RETAILERS) as mapboxgl.GeoJSONSource).setData(retailersData as any);
    (map.getSource(SRC_KINGPINS) as mapboxgl.GeoJSONSource).setData(offsetKingpins as any);

    const allStops: Stop[] = [];

    // Retailers/HQ
    for (const f of retailersData.features ?? []) {
      const p = f.properties ?? {};
      const coords = f.geometry?.coordinates;
      if (!isValidLngLat(coords)) continue;

      const category = s(p.Category);
      const kind: StopKind = isCorporateHQ(category) ? "hq" : "retailer";

      const retailer = s(p.Retailer);
      const name = s(p.Name);
      const label =
        kind === "hq"
          ? `${retailer || "Corporate HQ"} — Corporate HQ`
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
        coords, // TRUE
        mapCoords: coords,
      });
    }

    // Kingpins
    for (const f of offsetKingpins.features ?? []) {
      const entry = kingpinEntryFromFeature(f);
      if (!entry) continue;

      const p = entry.p;
      const retailer = s(p.Retailer);
      const contactName = s(p.ContactName || p.Name || p.Contact || p["Contact Name"]);
      const label = retailer ? `${contactName || "Kingpin"} — ${retailer}` : `${contactName || "Kingpin"}`;

      allStops.push({
        id: makeId("kingpin", entry.trueCoords, p),
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
        coords: entry.trueCoords, // TRUE for routing
        mapCoords: entry.mapCoords, // OFFSET for flyTo
      });
    }

    onAllStopsLoaded(allStops);

    onStatesLoaded(uniqSorted(allStops.map((st) => s(st.state).toUpperCase()).filter(Boolean)));

    onRetailersLoaded(
      uniqSorted((retailersData.features ?? []).map((f: any) => s(f.properties?.Retailer)).filter(Boolean))
    );

    onCategoriesLoaded(uniqSorted((retailersData.features ?? []).flatMap((f: any) => splitCategories(f.properties?.Category))));

    onSuppliersLoaded(uniqSorted(allStops.flatMap((st) => splitMulti(st.suppliers))));
  }

  function applyFilters() {
    const map = mapRef.current;
    const retailersData = retailersRef.current;
    if (!map || !retailersData) return;

    const retailerFilter: any[] = ["all"];
    retailerFilter.push(["==", ["index-of", "corporate", ["downcase", ["get", "Category"]]], -1]);

    if (selectedStates.length) retailerFilter.push(["in", ["upcase", ["get", "State"]], ["literal", selectedStates]]);
    if (selectedRetailers.length) retailerFilter.push(["in", ["get", "Retailer"], ["literal", selectedRetailers]]);

    if (selectedCategories.length) {
      retailerFilter.push([
        "any",
        ...selectedCategories.map((c) => [">=", ["index-of", c.toLowerCase(), ["downcase", ["get", "Category"]]], 0]),
      ]);
    }

    if (selectedSuppliers.length) {
      retailerFilter.push([
        "any",
        ...selectedSuppliers.map((sp) => [">=", ["index-of", sp.toLowerCase(), ["downcase", ["get", "Suppliers"]]], 0]),
      ]);
    }

    const hqFilter: any[] = ["all"];
    hqFilter.push([">=", ["index-of", "corporate", ["downcase", ["get", "Category"]]], 0]);
    if (selectedStates.length) hqFilter.push(["in", ["upcase", ["get", "State"]], ["literal", selectedStates]]);

    try {
      map.setFilter(LYR_RETAILERS, retailerFilter as any);
      map.setFilter(LYR_HQ, hqFilter as any);
    } catch {}
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

  // Only fly when zoomToStop CHANGES (ignore any pre-filled initial value)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoomToStop) return;

    const incomingId = zoomToStop.id ?? null;
    if (incomingId && incomingId === prevZoomStopIdRef.current) return;

    prevZoomStopIdRef.current = incomingId;

    const ctr = zoomToStop.mapCoords ?? zoomToStop.coords;
    if (!isValidLngLat(ctr)) return;

    try {
      enableAllInteractions(map);
      map.flyTo({ center: ctr, zoom: 12.5, essential: true });
    } catch {}
  }, [zoomToStop]);

  function buildRouteCoords(): [number, number][] {
    const pts: [number, number][] = [];
    if (homeCoords && isValidLngLat(homeCoords)) pts.push(homeCoords);
    for (const st of tripStops || []) {
      if (isValidLngLat(st.coords)) pts.push(st.coords); // TRUE coords only
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
    if (!isValidLngLat(coords)) return;

    const retailer = s(p.Retailer);
    const name = s(p.Name);
    const address = s(p.Address);
    const city = s(p.City);
    const state = s(p.State);
    const zip = s(p.Zip);
    const category = s(p.Category);
    const suppliers = s(p.Suppliers);

    const kind: StopKind = isCorporateHQ(category) ? "hq" : "retailer";
    const stop: Stop = {
      id: makeId(kind, coords, p),
      kind,
      label: kind === "hq" ? `${retailer || "Corporate HQ"} — Corporate HQ` : `${retailer || "Retailer"} — ${name || "Site"}`,
      retailer,
      name,
      address,
      city,
      state,
      zip,
      category,
      suppliers,
      coords,
      mapCoords: coords,
    };

    const suppliersText = suppliers || "Not listed";
    const suppliersTitle = escapeHtml(suppliersText);

    const popupHtml = `
      <div style="font-size:13px;min-width:300px;max-width:320px;color:#fff;line-height:1.3;font-family:Segoe UI,Arial;">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px;color:#facc15;">${escapeHtml(retailer || "Unknown Retailer")}</div>
        ${name ? `<div style="font-style:italic;margin-bottom:4px;">${escapeHtml(name)}</div>` : ""}
        <div style="margin-bottom:4px;">${escapeHtml(address)}<br/>${escapeHtml(city)}, ${escapeHtml(state)} ${escapeHtml(zip)}</div>
        ${category ? `<div style="margin-bottom:6px;"><span style="font-weight:700;color:#facc15;">Category:</span> ${escapeHtml(category)}</div>` : ""}
        <div style="margin-bottom:8px;display:flex;gap:6px;align-items:baseline;">
          <span style="font-weight:700;">Suppliers:</span>
          <span title="${suppliersTitle}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;display:inline-block;">${escapeHtml(suppliersText)}</span>
        </div>
        <button id="add-stop-btn" style="padding:7px 10px;border:none;background:#facc15;border-radius:5px;font-weight:700;font-size:13px;color:#111827;cursor:pointer;width:100%;">
          ➕ Add to Trip
        </button>
      </div>
    `;

    new mapboxgl.Popup({ offset: 14, closeOnMove: false }).setLngLat(coords).setHTML(popupHtml).addTo(map);

    setTimeout(() => {
      const btn = document.getElementById("add-stop-btn");
      if (btn) (btn as HTMLButtonElement).onclick = () => onAddStop(stop);
    }, 0);
  }

  function getKingpinsNearClickedPoint(clickedMapCoords: [number, number]) {
    const kp = kingpinsRef.current;
    if (!kp?.features?.length) return [];

    const matches: KingpinEntry[] = [];
    for (const f of kp.features) {
      const entry = kingpinEntryFromFeature(f);
      if (!entry) continue;
      const d = distanceMeters(clickedMapCoords, entry.mapCoords);
      if (d <= KINGPIN_GROUP_TOLERANCE_M) matches.push(entry);
    }

    matches.sort((a, b) => {
      const ar = s(a.p.Retailer).localeCompare(s(b.p.Retailer));
      if (ar !== 0) return ar;
      return s(a.p.ContactName || a.p.Name).localeCompare(s(b.p.ContactName || b.p.Name));
    });

    return matches;
  }

  function stopFromKingpinEntry(entry: KingpinEntry, fallbackRetailer?: string): Stop {
    const p = entry.p;
    const retailer = s(p.Retailer) || s(fallbackRetailer);
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

    const label = contactName ? `${contactName} — ${retailer || "Kingpin"}` : `${retailer || "Kingpin"}`;

    return {
      id: makeId("kingpin", entry.trueCoords, p),
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
      coords: entry.trueCoords,
      mapCoords: entry.mapCoords,
    };
  }

  function handleKingpinClick(e: mapboxgl.MapMouseEvent) {
    const map = mapRef.current;
    if (!map) return;

    const features = map.queryRenderedFeatures(e.point, { layers: [LYR_KINGPINS] }) as any[];
    if (!features.length) return;

    const f = features[0];
    const p0 = f.properties ?? {};
    const clickedMapCoords = (f.geometry?.coordinates ?? []) as [number, number];
    if (!isValidLngLat(clickedMapCoords)) return;

    const retailer0 = s(p0.Retailer);

    const matches = getKingpinsNearClickedPoint(clickedMapCoords);

    const entries: KingpinEntry[] =
      matches.length > 0
        ? matches
        : (() => {
            const single: Feature = {
              type: "Feature",
              geometry: { type: "Point", coordinates: clickedMapCoords },
              properties: p0,
            };
            const ent = kingpinEntryFromFeature(single);
            return ent ? [ent] : [];
          })();

    if (!entries.length) return;

    const options = entries.map((ent, idx) => {
      const pr = ent.p ?? {};
      const contact = s(pr.ContactName || pr.Name || pr.Contact || pr["Contact Name"]) || `Kingpin #${idx + 1}`;
      const title = s(pr.ContactTitle || pr.Title || pr["Contact Title"]);
      const r = s(pr.Retailer) || retailer0 || "Retailer";
      const line = title ? `${contact} — ${title}` : `${contact}`;
      return { idx, contact, title, retailer: r, line };
    });

    const popupId = `kp-popup-${Date.now()}`;
    const selectId = `${popupId}-select`;
    const addBtnId = `${popupId}-add`;
    const detailsId = `${popupId}-details`;

    const retailerHeader = escapeHtml(options[0].retailer || retailer0 || "Unknown Retailer");

    const popupHtml = `
      <div id="${popupId}" style="font-size:13px;min-width:320px;max-width:360px;color:#fff;line-height:1.3;font-family:Segoe UI,Arial;">
        <div style="font-size:16px;font-weight:800;margin-bottom:6px;color:#facc15;">${retailerHeader}</div>

        ${
          options.length > 1
            ? `<div style="margin-bottom:8px;">
                 <div style="font-weight:700;margin-bottom:4px;color:#facc15;">Kingpins at this location (${options.length}):</div>
                 <select id="${selectId}" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid rgba(250,204,21,0.55);background:#111827;color:#fff;">
                   ${options.map((o) => `<option value="${o.idx}">${escapeHtml(o.line)}</option>`).join("")}
                 </select>
               </div>`
            : ""
        }

        <div id="${detailsId}"></div>

        <button id="${addBtnId}" style="padding:8px 10px;border:none;background:#facc15;border-radius:6px;font-weight:800;font-size:13px;color:#111827;cursor:pointer;width:100%;margin-top:8px;">
          ➕ Add to Trip
        </button>

        <div style="margin-top:8px;opacity:0.85;font-size:11px;">
          Note: Multiple Kingpins can share one address — use the selector above.
        </div>
      </div>
    `;

    const popup = new mapboxgl.Popup({ offset: 14, closeOnMove: false })
      .setLngLat(clickedMapCoords)
      .setHTML(popupHtml)
      .addTo(map);

    function renderDetails(idx: number) {
      const ent = entries[idx] ?? entries[0];
      const p = ent.p ?? {};

      const address = escapeHtml(s(p.Address));
      const city = escapeHtml(s(p.City));
      const state = escapeHtml(s(p.State));
      const zip = escapeHtml(s(p.Zip));
      const category = escapeHtml(s(p.Category) || "Kingpin");
      const suppliersText = s(p.Suppliers) || "Not listed";
      const suppliersTitle = escapeHtml(s(suppliersText));

      const contactName = escapeHtml(s(p.ContactName || p.Name || p.Contact || p["Contact Name"]));
      const contactTitle = escapeHtml(s(p.ContactTitle || p.Title || p["Contact Title"]));
      const office = escapeHtml(s(p.OfficePhone || p["Office Phone"] || p.PhoneOffice) || "TBD");
      const cell = escapeHtml(s(p.CellPhone || p["Cell Phone"] || p.PhoneCell) || "TBD");
      const email = escapeHtml(s(p.Email) || "TBD");

      const html = `
        <div style="margin-bottom:6px;">${address}<br/>${city}, ${state} ${zip}</div>
        <div style="margin-bottom:6px;"><span style="font-weight:800;color:#facc15;">Category:</span> ${category}</div>
        <div style="margin-bottom:8px;display:flex;gap:6px;align-items:baseline;">
          <span style="font-weight:800;">Suppliers:</span>
          <span title="${suppliersTitle}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;display:inline-block;">${escapeHtml(
            s(suppliersText)
          )}</span>
        </div>
        ${contactName ? `<div style="font-weight:900;margin-bottom:2px;">${contactName}</div>` : ""}
        ${contactTitle ? `<div style="margin-bottom:4px;">${contactTitle}</div>` : ""}
        <div style="margin-bottom:4px;">Office: ${office} • Cell: ${cell}</div>
        <div style="margin-bottom:0px;">Email: ${email}</div>
      `;

      const host = document.getElementById(detailsId);
      if (host) host.innerHTML = html;
    }

    function getSelectedIndex() {
      const sel = document.getElementById(selectId) as HTMLSelectElement | null;
      const v = sel ? Number(sel.value) : 0;
      return Number.isFinite(v) ? v : 0;
    }

    setTimeout(() => {
      renderDetails(0);

      const sel = document.getElementById(selectId) as HTMLSelectElement | null;
      if (sel) {
        sel.onchange = () => {
          const idx = getSelectedIndex();
          renderDetails(idx);
        };
      }

      const btn = document.getElementById(addBtnId) as HTMLButtonElement | null;
      if (btn) {
        btn.onclick = () => {
          const idx = getSelectedIndex();
          const ent = entries[idx] ?? entries[0];
          const stop = stopFromKingpinEntry(ent, retailer0);
          onAddStop(stop);
          try {
            popup.remove();
          } catch {}
        };
      }
    }, 0);
  }

  return <div ref={containerRef} className="w-full h-full min-h-0" />;
}
