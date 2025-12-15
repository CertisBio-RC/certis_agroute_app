"use client";

// components/CertisMap.tsx
// ============================================================================
// 💠 CERTIS AGROUTE — GOLD BASELINE (BUILD-SAFE)
//   • Style locked: mapbox://styles/mapbox/satellite-streets-v12
//   • Projection locked: mercator
//   • Retailers filtered by: State ∩ Retailer ∩ Category ∩ Supplier
//   • Corporate HQ filtered ONLY by State
//   • Kingpins always visible (not filtered by retailer filters)
//   • Home marker: /icons/Blue_Home.png at homeCoords
//   • Trip route: Mapbox Directions (driving) w/ straight-line fallback
//   • Static export safe: basePath "/certis_agroute_app" or NEXT_PUBLIC_BASE_PATH
// ============================================================================

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { MAPBOX_TOKEN } from "../utils/token";

// -----------------------------
// Types (IMPORTANT: uses `coords` to match app/page.tsx)
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

  // Kingpin contact fields (optional)
  email?: string;
  phoneOffice?: string;
  phoneCell?: string;

  // NOTE: keep `coords` (not `coordinates`) for compatibility
  coords: [number, number]; // [lng, lat]
};

export type RetailerSummaryRow = {
  retailer: string;
  count: number;
  suppliers: string[];
  categories: string[];
  states: string[];
};

type GeoJSONPointFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONPointFeature[];
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
const DEFAULT_CENTER: [number, number] = [-93.5, 41.9];
const DEFAULT_ZOOM = 5.2;

const SRC_RETAILERS = "retailers-src";
const SRC_KINGPINS = "kingpins-src";
const SRC_ROUTE = "route-src";

const LYR_RETAILERS = "retailers-circle";
const LYR_HQ = "hq-circle";
const LYR_KINGPINS = "kingpins-symbol";
const LYR_ROUTE = "trip-route-line";

const KINGPIN_ICON_ID = "kingpin-icon";

// -----------------------------
// Helpers (typed; avoids unknown[] issues)
// -----------------------------

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function uniq(values: string[]): string[] {
  const out = Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function splitSuppliers(raw: unknown): string[] {
  const str = s(raw);
  if (!str) return [];
  return str
    .split(/[;,|]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function splitCategories(raw: unknown): string[] {
  const str = s(raw);
  if (!str) return [];
  return str
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function isHQ(category: string): boolean {
  const c = category.toLowerCase();
  return c.includes("corporate") && c.includes("hq");
}

function categoryPasses(category: string, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const c = category.toLowerCase();
  return selected.some((sel) => c.includes(sel.toLowerCase()));
}

function suppliersPasses(suppliers: string[], selected: string[]): boolean {
  if (selected.length === 0) return true;
  const set = new Set(suppliers.map((x) => x.toLowerCase()));
  return selected.some((sel) => set.has(sel.toLowerCase()));
}

function safeFC(json: unknown): FeatureCollection {
  const obj = json as Partial<FeatureCollection>;
  const features = Array.isArray(obj?.features) ? (obj.features as GeoJSONPointFeature[]) : [];
  return { type: "FeatureCollection", features };
}

function stopId(kind: StopKind, f: GeoJSONPointFeature): string {
  const p = f.properties ?? {};
  const retailer = s(p.Retailer);
  const name = s(p.Name);
  const state = s(p.State);
  const zip = s(p.Zip);
  const [lng, lat] = f.geometry?.coordinates ?? [0, 0];
  return `${kind}:${retailer}|${name}|${state}|${zip}|${lng.toFixed(6)},${lat.toFixed(6)}`;
}

function retailerStopFromFeature(f: GeoJSONPointFeature): Stop {
  const p = f.properties ?? {};
  const category = s(p.Category);
  const kind: StopKind = isHQ(category) ? "hq" : "retailer";

  const retailer = s(p.Retailer);
  const name = s(p.Name);
  const address = s(p.Address);
  const city = s(p.City);
  const state = s(p.State);
  const zip = s(p.Zip);
  const suppliers = s(p.Suppliers);

  const label =
    kind === "hq"
      ? `${retailer || "Corporate HQ"} — Corporate HQ`
      : retailer
        ? `${retailer} — ${name || "Site"}`
        : name || "Retailer Site";

  return {
    id: stopId(kind, f),
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
    coords: f.geometry.coordinates,
  };
}

function kingpinStopFromFeature(f: GeoJSONPointFeature): Stop {
  const p = f.properties ?? {};
  const retailer = s(p.Retailer);
  const contactName = s(p.Name || p.Contact || p["Contact Name"]);
  const title = s(p.Title);
  const address = s(p.Address);
  const city = s(p.City);
  const state = s(p.State);
  const zip = s(p.Zip);
  const suppliers = s(p.Suppliers);
  const email = s(p.Email);
  const office = s(p.OfficePhone || p["Office Phone"] || p.PhoneOffice) || "TBD";
  const cell = s(p.CellPhone || p["Cell Phone"] || p.PhoneCell) || "TBD";

  const heading = contactName ? contactName : "Kingpin";
  const label = retailer ? `${heading} — ${retailer}` : heading;

  return {
    id: stopId("kingpin", f),
    kind: "kingpin",
    label,
    retailer,
    name: title ? `${heading} — ${title}` : heading,
    address,
    city,
    state,
    zip,
    category: "Kingpin",
    suppliers,
    email: email || "TBD",
    phoneOffice: office,
    phoneCell: cell,
    coords: f.geometry.coordinates,
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

  const retailersRef = useRef<FeatureCollection | null>(null);
  const kingpinsRef = useRef<FeatureCollection | null>(null);

  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const lastListsRef = useRef<{
    states: string;
    retailers: string;
    categories: string;
    suppliers: string;
  }>({ states: "", retailers: "", categories: "", suppliers: "" });

  const basePath = useMemo(() => {
    const bp = (process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app").trim();
    return bp || "/certis_agroute_app";
  }, []);

  const token = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
    return env || (MAPBOX_TOKEN || "").trim();
  }, []);

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
      // Load kingpin icon
      try {
        if (!map.hasImage(KINGPIN_ICON_ID)) {
          const iconUrl = `${basePath}/icons/kingpin.png`;
          const image = await new Promise<any>((resolve, reject) => {
            map.loadImage(iconUrl, (err, img) => {
              if (err || !img) reject(err || new Error("loadImage failed"));
              else resolve(img);
            });
          });
          map.addImage(KINGPIN_ICON_ID, image, { pixelRatio: 2 });
        }
      } catch (e) {
        console.warn("[CertisMap] Kingpin icon load failed:", e);
      }

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

      // Retailers layer (non-HQ)
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
              // Agronomy dominant if not HQ
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

      // Corporate HQ layer
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

      // Kingpins layer (always visible overlay)
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

      // Route layer
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
      // ✅ FIX: Mapbox v3 types no longer export EventData — MapMouseEvent is enough.
      const handleRetailerClick = (e: mapboxgl.MapMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [LYR_RETAILERS, LYR_HQ] });
        if (!features.length) return;

        const raw = features[0] as any;
        const f: GeoJSONPointFeature = {
          type: "Feature",
          geometry: raw.geometry,
          properties: raw.properties ?? {},
        };

        const stop = retailerStopFromFeature(f);

        const p = f.properties ?? {};
        const retailer = s(p.Retailer);
        const name = s(p.Name);
        const address = s(p.Address);
        const city = s(p.City);
        const state = s(p.State);
        const zip = s(p.Zip);
        const category = s(p.Category);
        const suppliers = s(p.Suppliers);

        const title =
          stop.kind === "hq"
            ? `${retailer || "Corporate HQ"}`
            : `${retailer || "Retailer"}${name ? ` — ${name}` : ""}`;

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

        setTimeout(() => {
          const btn = document.getElementById("add-stop-btn");
          if (!btn) return;
          btn.onclick = () => {
            onAddStop?.(stop);
            popup.remove();
          };
        }, 0);
      };

      const handleKingpinClick = (e: mapboxgl.MapMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [LYR_KINGPINS] });
        if (!features.length) return;

        const raw = features[0] as any;
        const f: GeoJSONPointFeature = {
          type: "Feature",
          geometry: raw.geometry,
          properties: raw.properties ?? {},
        };

        const stop = kingpinStopFromFeature(f);

        const p = f.properties ?? {};
        const contactName = s(p.Name || p.Contact || p["Contact Name"]);
        const title = s(p.Title);
        const retailer = s(p.Retailer);

        const office = s(p.OfficePhone || p["Office Phone"] || p.PhoneOffice) || "TBD";
        const cell = s(p.CellPhone || p["Cell Phone"] || p.PhoneCell) || "TBD";
        const email = s(p.Email) || "TBD";
        const suppliers = s(p.Suppliers) || "—";

        const address = s(p.Address);
        const city = s(p.City);
        const state = s(p.State);
        const zip = s(p.Zip);

        const heading = contactName ? `${contactName}${title ? ` — ${title}` : ""}` : "Kingpin";
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

      const setPointer = () => (map.getCanvas().style.cursor = "pointer");
      const clearPointer = () => (map.getCanvas().style.cursor = "");
      map.on("mouseenter", LYR_RETAILERS, setPointer);
      map.on("mouseleave", LYR_RETAILERS, clearPointer);
      map.on("mouseenter", LYR_HQ, setPointer);
      map.on("mouseleave", LYR_HQ, clearPointer);
      map.on("mouseenter", LYR_KINGPINS, setPointer);
      map.on("mouseleave", LYR_KINGPINS, clearPointer);

      // Load data now that style/sources exist
      await loadGeoJSON();
      applyFiltersAndEmit();
      updateHomeMarker();
      await updateRoute();

      console.info("[CertisMap] Map loaded and initialized.");
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
  // Data loading
  // -----------------------------
  const loadGeoJSON = async () => {
    const map = mapRef.current;
    if (!map) return;

    const retailersUrl = `${basePath}/data/retailers.geojson`;
    const kingpinsUrl = `${basePath}/data/kingpin.geojson`;

    try {
      const [r1, r2] = await Promise.all([fetch(retailersUrl), fetch(kingpinsUrl)]);
      if (!r1.ok) throw new Error(`Retailers fetch failed: ${r1.status} ${r1.statusText}`);
      if (!r2.ok) throw new Error(`Kingpins fetch failed: ${r2.status} ${r2.statusText}`);

      const retailersJson = safeFC(await r1.json());
      const kingpinsJson = safeFC(await r2.json());

      retailersRef.current = retailersJson;
      kingpinsRef.current = kingpinsJson;

      const rSrc = map.getSource(SRC_RETAILERS) as mapboxgl.GeoJSONSource | undefined;
      const kSrc = map.getSource(SRC_KINGPINS) as mapboxgl.GeoJSONSource | undefined;

      rSrc?.setData(retailersJson as unknown as GeoJSON.GeoJSON);
      kSrc?.setData(kingpinsJson as unknown as GeoJSON.GeoJSON);

      const allStops: Stop[] = [];
      for (const f of retailersJson.features) allStops.push(retailerStopFromFeature(f));
      for (const f of kingpinsJson.features) allStops.push(kingpinStopFromFeature(f));
      onAllStopsLoaded?.(allStops);
    } catch (e) {
      console.error("[CertisMap] GeoJSON load failed:", e);
    }
  };

  // -----------------------------
  // Filters + Lists + Summary
  // -----------------------------
  const applyFiltersAndEmit = () => {
    const map = mapRef.current;
    const retailersFC = retailersRef.current;
    if (!map || !retailersFC) return;

    const states = selectedStates;
    const retailers = selectedRetailers;
    const categories = selectedCategories;
    const suppliers = selectedSuppliers;

    // Retailer layer filter: NOT HQ + intersection filters
    const retailerFilter: any[] = ["all"];
    retailerFilter.push(["==", ["index-of", "Corporate", ["get", "Category"]], -1]);

    if (states.length > 0) retailerFilter.push(["in", ["get", "State"], ["literal", states]]);
    if (retailers.length > 0) retailerFilter.push(["in", ["get", "Retailer"], ["literal", retailers]]);
    if (categories.length > 0) {
      retailerFilter.push(["any", ...categories.map((c) => [">=", ["index-of", c, ["get", "Category"]], 0])]);
    }
    if (suppliers.length > 0) {
      retailerFilter.push(["any", ...suppliers.map((s0) => [">=", ["index-of", s0, ["get", "Suppliers"]], 0])]);
    }

    // HQ filter: HQ + state only
    const hqFilter: any[] = ["all"];
    hqFilter.push([">=", ["index-of", "Corporate", ["get", "Category"]], 0]);
    if (states.length > 0) hqFilter.push(["in", ["get", "State"], ["literal", states]]);

    map.setFilter(LYR_RETAILERS, retailerFilter as any);
    map.setFilter(LYR_HQ, hqFilter as any);

    // Visible retailer features (used for lists + retailer summary)
    const visibleRetailers = retailersFC.features.filter((f) => {
      const p = f.properties ?? {};
      const cat = s(p.Category);
      if (isHQ(cat)) return false;

      const st = s(p.State);
      const rt = s(p.Retailer);
      const sup = splitSuppliers(p.Suppliers);

      if (states.length > 0 && !states.includes(st)) return false;
      if (retailers.length > 0 && !retailers.includes(rt)) return false;
      if (!categoryPasses(cat, categories)) return false;
      if (!suppliersPasses(sup, suppliers)) return false;

      return true;
    });

    // Typed dropdown lists
    const statesList: string[] = uniq(visibleRetailers.map((f) => s(f.properties?.State)));
    const retailersList: string[] = uniq(visibleRetailers.map((f) => s(f.properties?.Retailer)));
    const categoriesList: string[] = uniq(visibleRetailers.flatMap((f) => splitCategories(f.properties?.Category)));
    const suppliersList: string[] = uniq(visibleRetailers.flatMap((f) => splitSuppliers(f.properties?.Suppliers)));

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

    // Retailer summary (visible retailers only)
    const summaryMap = new Map<string, RetailerSummaryRow>();

    for (const f of visibleRetailers) {
      const p = f.properties ?? {};
      const retailer = s(p.Retailer) || "Unknown Retailer";
      const st = s(p.State);
      const cats = splitCategories(p.Category);
      const sups = splitSuppliers(p.Suppliers);

      if (!summaryMap.has(retailer)) {
        summaryMap.set(retailer, { retailer, count: 0, suppliers: [], categories: [], states: [] });
      }
      const row = summaryMap.get(retailer)!;
      row.count += 1;
      row.suppliers = uniq([...row.suppliers, ...sups]);
      row.categories = uniq([...row.categories, ...cats]);
      row.states = uniq([...row.states, ...(st ? [st] : [])]);
    }

    const summary = Array.from(summaryMap.values()).sort((a, b) => b.count - a.count);
    onRetailerSummary?.(summary);
  };

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
    if (!map || !zoomToStop) return;

    map.flyTo({ center: zoomToStop.coords, zoom: 12.5, essential: true });
  }, [zoomToStop]);

  // -----------------------------
  // Trip route (Directions + fallback)
  // -----------------------------
  const updateRoute = async () => {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource(SRC_ROUTE) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    if (!tripStops || tripStops.length < 2) {
      src.setData({ type: "FeatureCollection", features: [] } as any);
      return;
    }

    const coords = tripStops.map((st) => st.coords);
    const coordsStr = coords.map((c) => `${c[0]},${c[1]}`).join(";");

    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}` +
      `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

    try {
      console.info("[CertisMap] Directions request:", url.replace(token, "TOKEN"));
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Directions HTTP ${resp.status} ${resp.statusText}`);
      const json: any = await resp.json();

      const geom = json?.routes?.[0]?.geometry;
      if (!geom || geom.type !== "LineString" || !Array.isArray(geom.coordinates)) {
        throw new Error("Directions response missing valid geometry");
      }

      src.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: geom, properties: {} }],
      } as any);

      console.info("[CertisMap] Directions OK (road-following).");
    } catch (e) {
      console.warn("[CertisMap] Directions FAILED — fallback straight line:", e);
      src.setData({
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
    updateRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripStops, token]);

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
