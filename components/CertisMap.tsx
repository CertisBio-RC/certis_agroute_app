// components/CertisMap.tsx
// ============================================================================
// 💠 CERTIS AGROUTE — GOLD BASELINE (BUILD-SAFE)
//   • Style locked: mapbox://styles/mapbox/satellite-streets-v12
//   • Projection locked: mercator
//   • Retailers filtered by: State ∩ Retailer ∩ Category ∩ Supplier
//   • Corporate HQ filtered ONLY by State
//   • Kingpins always visible (not filtered by retailer filters)
//   • Home marker uses Blue_Home.png at homeCoords
//   • Trip route: Mapbox Directions (driving) with graceful fallback to straight line
//   • Static export safe: basePath "/certis_agroute_app" or NEXT_PUBLIC_BASE_PATH
// ============================================================================

"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { MAPBOX_TOKEN } from "../utils/token";

// -----------------------------
// Types
// -----------------------------

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
  coordinates: [number, number]; // [lng, lat]
};

export type RetailerSummaryRow = {
  retailer: string;
  count: number;
  suppliers: string[];
  categories: string[];
  states: string[];
};

type GeoJSONFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

type CertisMapProps = {
  selectedStates: string[];
  selectedRetailers: string[];
  selectedCategories: string[];
  selectedSuppliers: string[];

  homeCoords: [number, number] | null;

  tripStops: Stop[];
  zoomToStop: Stop | null;

  onStatesLoaded?: (states: string[]) => void;
  onRetailersLoaded?: (retailers: string[]) => void;
  onCategoriesLoaded?: (categories: string[]) => void;
  onSuppliersLoaded?: (suppliers: string[]) => void;

  onAllStopsLoaded?: (stops: Stop[]) => void;
  onRetailerSummary?: (summary: RetailerSummaryRow[]) => void;

  onAddStop?: (stop: Stop) => void;
};

// -----------------------------
// Constants
// -----------------------------

const STYLE_URL = "mapbox://styles/mapbox/satellite-streets-v12";
const DEFAULT_CENTER: [number, number] = [-93.5, 41.9]; // IA-ish
const DEFAULT_ZOOM = 5.2;

const SRC_RETAILERS = "retailers-src";
const SRC_KINGPINS = "kingpins-src";
const SRC_ROUTE = "route-src";

const LYR_RETAILERS = "retailers-circle";
const LYR_HQ = "hq-circle";
const LYR_KINGPINS = "kingpins-symbol";
const LYR_ROUTE = "trip-route-line";

const KINGPIN_ICON_ID = "kingpin-icon";

function safeString(v: unknown): string {
  return String(v ?? "").trim();
}

function splitSuppliers(raw: unknown): string[] {
  const s = safeString(raw);
  if (!s) return [];
  return s
    .split(/[;,|]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function isCorporateHQFromCategory(category: string): boolean {
  const c = category.toLowerCase();
  // handles "Corporate HQ" and also variants like "Corporate HQ, Agronomy"
  return c.includes("corporate") && c.includes("hq");
}

function categoryMatchesSelection(category: string, selectedCategories: string[]): boolean {
  if (selectedCategories.length === 0) return true;
  // Treat Category as a multi-value string; match if ANY selected appears as substring.
  const c = category.toLowerCase();
  return selectedCategories.some((sel) => c.includes(sel.toLowerCase()));
}

function suppliersMatchSelection(suppliers: string[], selectedSuppliers: string[]): boolean {
  if (selectedSuppliers.length === 0) return true;
  const set = new Set(suppliers.map((s) => s.toLowerCase()));
  return selectedSuppliers.some((s) => set.has(s.toLowerCase()));
}

function makeStopId(kind: StopKind, f: GeoJSONFeature): string {
  const p = f.properties ?? {};
  const retailer = safeString(p.Retailer);
  const name = safeString(p.Name);
  const state = safeString(p.State);
  const zip = safeString(p.Zip);
  const coords = f.geometry?.coordinates ?? [0, 0];
  return `${kind}:${retailer}|${name}|${state}|${zip}|${coords[0].toFixed(6)},${coords[1].toFixed(6)}`;
}

function buildStopFromRetailerFeature(f: GeoJSONFeature): Stop {
  const p = f.properties ?? {};
  const category = safeString(p.Category);
  const hq = isCorporateHQFromCategory(category);

  const retailer = safeString(p.Retailer);
  const name = safeString(p.Name);
  const address = safeString(p.Address);
  const city = safeString(p.City);
  const state = safeString(p.State);
  const zip = safeString(p.Zip);
  const suppliers = safeString(p.Suppliers);

  const kind: StopKind = hq ? "hq" : "retailer";
  const label = hq
    ? `${retailer} — Corporate HQ`
    : retailer
      ? `${retailer} — ${name || "Site"}`
      : name || "Retailer Site";

  return {
    id: makeStopId(kind, f),
Name: undefined, // (intentionally not used; kept out)
    kind,
    label,
    retailer,
    name,
    address,
    city,
    state,
    zip,
    category,
    suppliers,
    coordinates: f.geometry.coordinates,
  };
}

function buildStopFromKingpinFeature(f: GeoJSONFeature): Stop {
  const p = f.properties ?? {};
  const retailer = safeString(p.Retailer);
  const name = safeString(p.Name) || safeString(p.Contact) || safeString(p["Contact Name"]);
  const title = safeString(p.Title);
  const address = safeString(p.Address);
  const city = safeString(p.City);
  const state = safeString(p.State);
  const zip = safeString(p.Zip);
  const suppliers = safeString(p.Suppliers);
  const email = safeString(p.Email);
  const office = safeString(p.OfficePhone || p["Office Phone"] || p.PhoneOffice);
  const cell = safeString(p.CellPhone || p["Cell Phone"] || p.PhoneCell);

  const labelBase = name ? name : "Kingpin";
  const label = retailer ? `${labelBase} — ${retailer}` : labelBase;

  return {
    id: makeStopId("kingpin", f),
    kind: "kingpin",
    label,
    retailer,
    name: title ? `${name}${name ? " — " : ""}${title}` : name,
    address,
    city,
    state,
    zip,
    category: "Kingpin",
    suppliers,
    email,
    phoneOffice: office || "TBD",
    phoneCell: cell || "TBD",
    coordinates: f.geometry.coordinates,
  };
}

// -----------------------------
// Component
// -----------------------------

export default function CertisMap({
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
  onRetailerSummary,
  onAddStop,
}: CertisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const retailersDataRef = useRef<FeatureCollection | null>(null);
  const kingpinsDataRef = useRef<FeatureCollection | null>(null);

  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Avoid spamming parent callbacks on every render
  const lastListsRef = useRef<{
    states: string;
    retailers: string;
    categories: string;
    suppliers: string;
  }>({ states: "", retailers: "", categories: "", suppliers: "" });

  const basePath = useMemo(() => {
    const bp = (process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app").trim();
    return bp === "" ? "/certis_agroute_app" : bp;
  }, []);

  const token = useMemo(() => {
    const envToken = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
    return envToken || (mapboxgl.accessToken || "").trim() || (MAPBOX_TOKEN || "").trim();
  }, []);

  // Ensure Mapbox token is set (required for Directions + tiles)
  useEffect(() => {
    if (!mapboxgl.accessToken) {
      mapboxgl.accessToken = token;
    }
  }, [token]);

  // -----------------------------
  // Map init (once)
  // -----------------------------
  useEffect(() => {
    if (mapRef.current) return;
    if (!containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      projection: { name: "mercator" },
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");

    const onLoad = async () => {
      // Load icon for Kingpins (symbol layer)
      try {
        if (!map.hasImage(KINGPIN_ICON_ID)) {
          const iconUrl = `${basePath}/icons/kingpin.png`;
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.crossOrigin = "anonymous";
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error(`Failed to load ${iconUrl}`));
            el.src = iconUrl;
          });
          const bitmap = await createImageBitmap(img);
          map.addImage(KINGPIN_ICON_ID, bitmap, { pixelRatio: 2 });
        }
      } catch (e) {
        // Not fatal; Kingpin layer will still attempt render (but without image it may not)
        console.warn("[CertisMap] Kingpin icon load failed:", e);
      }

      // Add empty sources/layers (data set later)
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

      // Retailers circle layer (non-HQ)
      if (!map.getLayer(LYR_RETAILERS)) {
        map.addLayer({
          id: LYR_RETAILERS,
          type: "circle",
          source: SRC_RETAILERS,
          paint: {
            "circle-radius": 6,
            "circle-stroke-width": 1.25,
            "circle-stroke-color": "#000000",
            "circle-opacity": 0.95,
            "circle-color": [
              "case",
              // Agronomy dominance (and not HQ)
              [
                "all",
                ["==", ["index-of", "Corporate", ["get", "Category"]], -1],
                [">=", ["index-of", "Agronomy", ["get", "Category"]], 0],
              ],
              "#2aa84a",
              // Grain/Feed
              [">=", ["index-of", "Grain", ["get", "Category"]], 0],
              "#ff8c1a",
              // C-Store/Service/Energy
              [
                "any",
                [">=", ["index-of", "C-Store", ["get", "Category"]], 0],
                [">=", ["index-of", "Service", ["get", "Category"]], 0],
                [">=", ["index-of", "Energy", ["get", "Category"]], 0],
              ],
              "#2f80ff",
              // Distribution
              [">=", ["index-of", "Distribution", ["get", "Category"]], 0],
              "#8f54ff",
              // Default
              "#cfcfcf",
            ],
          },
        });
      }

      // Corporate HQ layer (red with yellow border, slightly larger)
      if (!map.getLayer(LYR_HQ)) {
        map.addLayer({
          id: LYR_HQ,
          type: "circle",
          source: SRC_RETAILERS,
          filter: [">=", ["index-of", "Corporate", ["get", "Category"]], 0],
          paint: {
            "circle-radius": 7,
            "circle-color": "#d62828",
            "circle-stroke-width": 1.25,
            "circle-stroke-color": "#f4d03f",
            "circle-opacity": 0.95,
          },
        });
      }

      // Kingpins symbol layer (always visible)
      if (!map.getLayer(LYR_KINGPINS)) {
        map.addLayer({
          id: LYR_KINGPINS,
          type: "symbol",
          source: SRC_KINGPINS,
          layout: {
            "icon-image": KINGPIN_ICON_ID,
            "icon-size": 0.22,
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
            "line-width": 4,
            "line-color": "#ffd400",
            "line-opacity": 0.95,
          },
        });
      }

      // Click handlers
      const handleRetailerClick = (e: mapboxgl.MapMouseEvent & mapboxgl.EventData) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [LYR_RETAILERS, LYR_HQ] });
        if (!features.length) return;

        const f = features[0] as unknown as GeoJSONFeature;
        const stop = buildStopFromRetailerFeature(f);

        const p = f.properties ?? {};
        const retailer = safeString(p.Retailer);
        const name = safeString(p.Name);
        const address = safeString(p.Address);
        const city = safeString(p.City);
        const state = safeString(p.State);
        const zip = safeString(p.Zip);
        const category = safeString(p.Category);
        const suppliers = safeString(p.Suppliers);

        const isHQ = stop.kind === "hq";
        const title = isHQ ? `${retailer || "Corporate HQ"}` : `${retailer || "Retailer"}${name ? ` — ${name}` : ""}`;

        const html = `
          <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; font-size: 12px; line-height: 1.25; min-width: 240px;">
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 6px;">${title}</div>
            <div>${address}${address && (city || state || zip) ? ", " : ""}${city}${city && state ? ", " : ""}${state} ${zip}</div>
            <div style="margin-top: 6px;"><b>Category:</b> ${category || "—"}</div>
            <div><b>Suppliers:</b> ${suppliers || "—"}</div>
            <button id="add-stop-btn" style="margin-top: 10px; padding: 6px 10px; border-radius: 8px; border: 1px solid #333; cursor: pointer;">
              Add to Trip
            </button>
          </div>
        `;

        const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
          .setLngLat(f.geometry.coordinates)
          .setHTML(html)
          .addTo(map);

        // Wire button
        setTimeout(() => {
          const btn = document.getElementById("add-stop-btn");
          if (!btn) return;
          btn.onclick = () => {
            onAddStop?.(stop);
            popup.remove();
          };
        }, 0);
      };

      const handleKingpinClick = (e: mapboxgl.MapMouseEvent & mapboxgl.EventData) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [LYR_KINGPINS] });
        if (!features.length) return;

        const f = features[0] as unknown as GeoJSONFeature;
        const stop = buildStopFromKingpinFeature(f);

        const p = f.properties ?? {};
        const contactName = safeString(p.Name || p.Contact || p["Contact Name"]);
        const title = safeString(p.Title);
        const retailer = safeString(p.Retailer);

        const office = safeString(p.OfficePhone || p["Office Phone"] || p.PhoneOffice) || "TBD";
        const cell = safeString(p.CellPhone || p["Cell Phone"] || p.PhoneCell) || "TBD";
        const email = safeString(p.Email) || "TBD";
        const suppliers = safeString(p.Suppliers) || "—";

        const address = safeString(p.Address);
        const city = safeString(p.City);
        const state = safeString(p.State);
        const zip = safeString(p.Zip);

        const heading = contactName
          ? `${contactName}${title ? ` — ${title}` : ""}`
          : "Kingpin";

        const sub = retailer ? `<div style="margin-top: 2px;"><b>Retailer:</b> ${retailer}</div>` : "";

        const html = `
          <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; font-size: 12px; line-height: 1.25; min-width: 260px;">
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 6px;">${heading}</div>
            ${sub}
            <div style="margin-top: 6px;">${address}${address && (city || state || zip) ? ", " : ""}${city}${city && state ? ", " : ""}${state} ${zip}</div>
            <div style="margin-top: 6px;"><b>Office:</b> ${office}</div>
            <div><b>Cell:</b> ${cell}</div>
            <div><b>Email:</b> ${email}</div>
            <div style="margin-top: 6px;"><b>Suppliers:</b> ${suppliers}</div>
            <button id="add-stop-btn" style="margin-top: 10px; padding: 6px 10px; border-radius: 8px; border: 1px solid #333; cursor: pointer;">
              Add to Trip
            </button>
          </div>
        `;

        const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
          .setLngLat(f.geometry.coordinates)
          .setHTML(html)
          .addTo(map);

        setTimeout(() => {
          const btn = document.getElementById("add-stop-btn");
          if (!btn) return;
          btn.onclick = () => {
            onAddStop?.(stop);
            popup.remove();
          };
        }, 0);
      };

      map.on("click", LYR_RETAILERS, handleRetailerClick);
      map.on("click", LYR_HQ, handleRetailerClick);
      map.on("click", LYR_KINGPINS, handleKingpinClick);

      // Cursor pointer
      const setPointer = () => (map.getCanvas().style.cursor = "pointer");
      const clearPointer = () => (map.getCanvas().style.cursor = "");

      map.on("mouseenter", LYR_RETAILERS, setPointer);
      map.on("mouseleave", LYR_RETAILERS, clearPointer);
      map.on("mouseenter", LYR_HQ, setPointer);
      map.on("mouseleave", LYR_HQ, clearPointer);
      map.on("mouseenter", LYR_KINGPINS, setPointer);
      map.on("mouseleave", LYR_KINGPINS, clearPointer);

      // Load data after layers exist
      await loadAllGeoJSON();

      // Apply initial filters + derived lists/summary
      applyFiltersAndEmit();
      updateRouteGeometry();
      updateHomeMarker();

      console.info("[CertisMap] Map loaded.");
    };

    map.on("load", onLoad);

    return () => {
      try {
        map.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, token]);

  // -----------------------------
  // Data load
  // -----------------------------
  const loadAllGeoJSON = async () => {
    const retailersUrl = `${basePath}/data/retailers.geojson`;
    const kingpinsUrl = `${basePath}/data/kingpin.geojson`;

    try {
      const [r1, r2] = await Promise.all([fetch(retailersUrl), fetch(kingpinsUrl)]);
      if (!r1.ok) throw new Error(`Retailers fetch failed: ${r1.status} ${r1.statusText}`);
      if (!r2.ok) throw new Error(`Kingpins fetch failed: ${r2.status} ${r2.statusText}`);

      const retailersJson = (await r1.json()) as FeatureCollection;
      const kingpinsJson = (await r2.json()) as FeatureCollection;

      retailersDataRef.current = {
        type: "FeatureCollection",
        features: Array.isArray(retailersJson.features) ? retailersJson.features : [],
      };

      kingpinsDataRef.current = {
        type: "FeatureCollection",
        features: Array.isArray(kingpinsJson.features) ? kingpinsJson.features : [],
      };

      // Push into map sources
      const map = mapRef.current;
      if (map) {
        const rSrc = map.getSource(SRC_RETAILERS) as mapboxgl.GeoJSONSource | undefined;
        const kSrc = map.getSource(SRC_KINGPINS) as mapboxgl.GeoJSONSource | undefined;

        rSrc?.setData(retailersDataRef.current as unknown as GeoJSON.GeoJSON);
        kSrc?.setData(kingpinsDataRef.current as unknown as GeoJSON.GeoJSON);
      }

      // Emit all stops (retailers + HQ + kingpins)
      const allStops: Stop[] = [];
      for (const f of retailersDataRef.current.features) {
        allStops.push(buildStopFromRetailerFeature(f));
      }
      for (const f of kingpinsDataRef.current.features) {
        allStops.push(buildStopFromKingpinFeature(f));
      }
      onAllStopsLoaded?.(allStops);
    } catch (e) {
      console.error("[CertisMap] GeoJSON load failed:", e);
    }
  };

  // -----------------------------
  // Filtering + Lists + Summary
  // -----------------------------
  const applyFiltersAndEmit = () => {
    const map = mapRef.current;
    const retailersFC = retailersDataRef.current;

    if (!map || !retailersFC) return;

    // Mapbox filter expressions
    const states = selectedStates;
    const retailers = selectedRetailers;
    const categories = selectedCategories;
    const suppliers = selectedSuppliers;

    // Retailer layer filter: NOT HQ, and intersection filters
    const retailerFilter: any[] = ["all"];

    // exclude HQ
    retailerFilter.push(["==", ["index-of", "Corporate", ["get", "Category"]], -1]);

    if (states.length > 0) retailerFilter.push(["in", ["get", "State"], ["literal", states]]);
    if (retailers.length > 0) retailerFilter.push(["in", ["get", "Retailer"], ["literal", retailers]]);
    if (categories.length > 0) {
      // substring match for any selected category
      retailerFilter.push([
        "any",
        ...categories.map((c) => [">=", ["index-of", c, ["get", "Category"]], 0]),
      ]);
    }
    if (suppliers.length > 0) {
      retailerFilter.push([
        "any",
        ...suppliers.map((s) => [">=", ["index-of", s, ["get", "Suppliers"]], 0]),
      ]);
    }

    // HQ layer filter: HQ + State only
    const hqFilter: any[] = ["all"];
    hqFilter.push([">=", ["index-of", "Corporate", ["get", "Category"]], 0]);
    if (states.length > 0) hqFilter.push(["in", ["get", "State"], ["literal", states]]);

    map.setFilter(LYR_RETAILERS, retailerFilter as any);
    map.setFilter(LYR_HQ, hqFilter as any);

    // Build derived visible retailer set (for dropdowns + summary)
    const visibleRetailerFeatures = retailersFC.features.filter((f) => {
      const p = f.properties ?? {};
      const category = safeString(p.Category);
      if (isCorporateHQFromCategory(category)) return false; // exclude HQ from retailer summary

      const st = safeString(p.State);
      const rt = safeString(p.Retailer);
      const suppliersArr = splitSuppliers(p.Suppliers);

      if (states.length > 0 && !states.includes(st)) return false;
      if (retailers.length > 0 && !retailers.includes(rt)) return false;
      if (!categoryMatchesSelection(category, categories)) return false;
      if (!suppliersMatchSelection(suppliersArr, suppliers)) return false;

      return true;
    });

    // Emit filter lists (typed string[] — fixes your build error)
    const statesList: string[] = uniqueStrings(
      visibleRetailerFeatures.map((f) => safeString(f.properties?.State))
    );
    const retailersList: string[] = uniqueStrings(
      visibleRetailerFeatures.map((f) => safeString(f.properties?.Retailer))
    );
    const categoriesList: string[] = uniqueStrings(
      visibleRetailerFeatures
        .map((f) => safeString(f.properties?.Category))
        .flatMap((c) =>
          c
            ? c
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
            : []
        )
    );
    const suppliersList: string[] = uniqueStrings(
      visibleRetailerFeatures.flatMap((f) => splitSuppliers(f.properties?.Suppliers))
    );

    // Only call parent if changed
    const statesKey = statesList.join("||");
    const retailersKey = retailersList.join("||");
    const categoriesKey = categoriesList.join("||");
    const suppliersKey = suppliersList.join("||");

    if (lastListsRef.current.states !== statesKey) {
      lastListsRef.current.states = statesKey;
      onStatesLoaded?.(statesList);
    }
    if (lastListsRef.current.retailers !== retailersKey) {
      lastListsRef.current.retailers = retailersKey;
      onRetailersLoaded?.(retailersList);
    }
    if (lastListsRef.current.categories !== categoriesKey) {
      lastListsRef.current.categories = categoriesKey;
      onCategoriesLoaded?.(categoriesList);
    }
    if (lastListsRef.current.suppliers !== suppliersKey) {
      lastListsRef.current.suppliers = suppliersKey;
      onSuppliersLoaded?.(suppliersList);
    }

    // Retailer summary from visible retailers only
    const summaryMap = new Map<string, RetailerSummaryRow>();

    for (const f of visibleRetailerFeatures) {
      const p = f.properties ?? {};
      const retailer = safeString(p.Retailer) || "Unknown Retailer";
      const state = safeString(p.State);
      const categoryRaw = safeString(p.Category);
      const suppliersArr = splitSuppliers(p.Suppliers);

      const categoriesArr = categoryRaw
        ? categoryRaw
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : [];

      if (!summaryMap.has(retailer)) {
        summaryMap.set(retailer, {
          retailer,
          count: 0,
          suppliers: [],
          categories: [],
          states: [],
        });
      }

      const row = summaryMap.get(retailer)!;
      row.count += 1;
      row.suppliers = uniqueStrings([...row.suppliers, ...suppliersArr]);
      row.categories = uniqueStrings([...row.categories, ...categoriesArr]);
      row.states = uniqueStrings([...row.states, ...(state ? [state] : [])]);
    }

    const summary = Array.from(summaryMap.values()).sort((a, b) => b.count - a.count);
    onRetailerSummary?.(summary);
  };

  // Re-apply filters whenever selections change
  useEffect(() => {
    applyFiltersAndEmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  // -----------------------------
  // Home marker
  // -----------------------------
  const updateHomeMarker = () => {
    const map = mapRef.current;
    if (!map) return;

    // Remove if no coords
    if (!homeCoords) {
      if (homeMarkerRef.current) {
        try {
          homeMarkerRef.current.remove();
        } catch {
          // ignore
        }
        homeMarkerRef.current = null;
      }
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

      homeMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(homeCoords)
        .addTo(map);
    } else {
      homeMarkerRef.current.setLngLat(homeCoords);
    }
  };

  useEffect(() => {
    updateHomeMarker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeCoords, basePath]);

  // -----------------------------
  // Zoom to stop
  // -----------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!zoomToStop) return;

    const [lng, lat] = zoomToStop.coordinates;
    map.flyTo({ center: [lng, lat], zoom: 12.5, essential: true });
  }, [zoomToStop]);

  // -----------------------------
  // Trip routing (Directions + fallback)
  // -----------------------------
  const updateRouteGeometry = async () => {
    const map = mapRef.current;
    if (!map) return;

    const routeSrc = map.getSource(SRC_ROUTE) as mapboxgl.GeoJSONSource | undefined;
    if (!routeSrc) return;

    if (!tripStops || tripStops.length < 2) {
      routeSrc.setData({ type: "FeatureCollection", features: [] } as any);
      return;
    }

    const coords = tripStops.map((s) => s.coordinates);
    const coordsStr = coords.map((c) => `${c[0]},${c[1]}`).join(";");

    const directionsUrl =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}` +
      `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

    try {
      console.info("[CertisMap] Directions request:", directionsUrl.replace(token, "TOKEN"));
      const resp = await fetch(directionsUrl);
      if (!resp.ok) throw new Error(`Directions HTTP ${resp.status} ${resp.statusText}`);

      const json = (await resp.json()) as any;
      const geom = json?.routes?.[0]?.geometry;

      if (!geom || geom.type !== "LineString" || !Array.isArray(geom.coordinates)) {
        throw new Error("Directions response missing valid LineString geometry");
      }

      routeSrc.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: geom, properties: {} }],
      } as any);

      console.info("[CertisMap] Directions OK (road-following).");
    } catch (e) {
      console.warn("[CertisMap] Directions FAILED — falling back to straight line:", e);

      // Straight-line fallback through stops
      routeSrc.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates: coords },
            properties: { fallback: true },
          },
        ],
      } as any);
    }
  };

  useEffect(() => {
    updateRouteGeometry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripStops, token]);

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      />
    </div>
  );
}
