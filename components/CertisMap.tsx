// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app";

// ========================================
// 🎨 CATEGORY COLORS
// ========================================
export const categoryColors: Record<string, { color: string; outline?: string }> = {
  Agronomy: { color: "#1E90FF", outline: "#FFFFFF" }, // Blue w/ white border
  "Grain/Feed": { color: "#FFD700", outline: "#FFFFFF" }, // Yellow w/ white border
  Feed: { color: "#FFD700", outline: "#FFFFFF" },
  Grain: { color: "#FFD700", outline: "#FFFFFF" },
  "Office/Service": { color: "#006400", outline: "#FFFFFF" }, // Dark green
  Distribution: { color: "#FF8C00", outline: "#FFFFFF" }, // Orange
  Kingpin: { color: "#FF0000", outline: "#FFFF00" }, // Red w/ yellow border
};

// ========================================
//⚙️ NORMALIZERS
// ========================================
const norm = (v: string) => (v || "").toString().trim().toLowerCase();

const expandCategories = (cat: string): string[] => {
  const c = norm(cat);
  switch (c) {
    case "agronomy/grain":
    case "agronomygrain":
    case "agronomy hybrid":
    case "agronomy/feed":
    case "agronomyfeed":
      return ["Agronomy"];
    case "feed":
    case "grain":
    case "feed/grain":
    case "grain/feed":
      return ["Grain/Feed"];
    case "office/service":
      return ["Office/Service"];
    case "distribution":
      return ["Distribution"];
    case "kingpin":
      return ["Kingpin"];
    default:
      return ["Unknown"];
  }
};

const assignDisplayCategory = (cat: string): string => expandCategories(cat)[0];

// ========================================
// 🧩 SUPPLIER NORMALIZATION
// ========================================
function parseSuppliers(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value.replace(/'/g, '"'));
      if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
    } catch {}
  }
  if (typeof value === "string")
    return value.split(/[,;/|]+/).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "object")
    return Object.values(value).map((s: any) => String(s).trim()).filter(Boolean);
  return [];
}

// ========================================
// 🧹 ADDRESS SCRUBBER
// ========================================
const cleanAddress = (addr: string): string =>
  addr.replace(/\(.*?\)/g, "").replace(/\bP\.?O\.?\s*Box\b.*$/i, "").trim();

// ========================================
// 📍 TYPES
// ========================================
export interface Stop {
  label: string;
  address: string;
  coords: [number, number];
  city?: string;
  state?: string;
  zip?: string | number;
}

export interface CertisMapProps {
  selectedCategories: string[];
  selectedStates: string[];
  selectedSuppliers: string[];
  selectedRetailers: string[];
  onStatesLoaded?: (states: string[]) => void;
  onRetailersLoaded?: (retailers: string[]) => void;
  onSuppliersLoaded?: (suppliers: string[]) => void;
  onRetailerSummary?: (
    summaries: {
      retailer: string;
      count: number;
      suppliers: string[];
      states: string[];
      categories: string[];
    }[]
  ) => void;
  onAddStop?: (stop: Stop) => void;
  tripStops?: Stop[];
  tripMode?: "entered" | "optimize";
  onOptimizedRoute?: (stops: Stop[]) => void;
  zipCode?: string;
}

// ========================================
// 🗺️ MAIN COMPONENT
// ========================================
export default function CertisMap({
  selectedCategories,
  selectedStates,
  selectedSuppliers,
  selectedRetailers,
  onStatesLoaded,
  onRetailersLoaded,
  onSuppliersLoaded,
  onRetailerSummary,
  onAddStop,
  tripStops = [],
  tripMode = "entered",
  zipCode,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const masterFeaturesRef = useRef<any[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const geojsonPath = `${basePath}/data/retailers.geojson?v=20251028`;
  const routeSourceId = "trip-route";

  // ========================================
  // 🗺️ MAP INITIALIZATION
  // ========================================
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-98.5795, 39.8283],
      zoom: 4,
      projection: "mercator",
    });

    mapRef.current = map;

    map.on("load", async () => {
      try {
        // Load retailer data
        const response = await fetch(geojsonPath, { cache: "no-store" });
        const data = await response.json();
        const validFeatures = data.features.filter((f: any) => {
          const coords = f.geometry?.coordinates;
          return Array.isArray(coords) && coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1]);
        });

        for (const f of validFeatures) {
          f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
        }
        masterFeaturesRef.current = validFeatures;

        const stateSet = new Set<string>();
        const retailerSet = new Set<string>();
        const supplierSet = new Set<string>();
        for (const f of validFeatures) {
          const p = f.properties || {};
          if (p.State) stateSet.add(p.State);
          if (p.Retailer) retailerSet.add(p.Retailer);
          parseSuppliers(p.Suppliers || p.Supplier || p["Supplier(s)"]).forEach((s) => supplierSet.add(s));
        }

        onStatesLoaded?.(Array.from(stateSet).sort());
        onRetailersLoaded?.(Array.from(retailerSet).sort());
        onSuppliersLoaded?.(Array.from(supplierSet).sort());

        map.addSource("retailers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: validFeatures },
        });

        // Retailers layer
        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 4,
            "circle-stroke-width": 1.5,
            "circle-color": [
              "match",
              ["get", "DisplayCategory"],
              "Agronomy", categoryColors.Agronomy.color,
              "Grain/Feed", categoryColors["Grain/Feed"].color,
              "Feed", categoryColors.Feed.color,
              "Grain", categoryColors.Grain.color,
              "Office/Service", categoryColors["Office/Service"].color,
              "Distribution", categoryColors.Distribution.color,
              "#1d4ed8",
            ],
            "circle-stroke-color": "#FFFFFF",
          },
          filter: ["!=", ["get", "DisplayCategory"], "Kingpin"],
        });

        // Kingpin layer
        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 5,
            "circle-color": categoryColors.Kingpin.color,
            "circle-stroke-width": 2.5,
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
          filter: ["==", ["get", "DisplayCategory"], "Kingpin"],
        });

        // Trip route layer
        map.addSource(routeSourceId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "trip-route-layer",
          type: "line",
          source: routeSourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#00FFFF", "line-width": 3 },
        });

        // Popups
        map.on("click", ["retailers-layer", "kingpins-layer"], (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const geom = f.geometry as GeoJSON.Point;
          const coords = geom?.coordinates?.slice(0, 2) as [number, number];
          const p = f.properties || {};
          const suppliersArr = parseSuppliers(p.Suppliers);
          const suppliers = suppliersArr.length ? suppliersArr.join(", ") : "None listed";
          const retailer = p.Retailer || "Unknown";
          const siteName = p.Name || "";
          const category = p.DisplayCategory || "N/A";
          const address = cleanAddress(p.Address || "");
          const stopLabel = siteName ? `${retailer} – ${siteName}` : retailer;
          const btnId = `add-stop-${Math.random().toString(36).slice(2)}`;

          const html = `
            <div style="font-size:13px;width:360px;background:#1a1a1a;color:#f5f5f5;
                        padding:8px;border-radius:6px;position:relative;">
              <button id="${btnId}" style="position:absolute;top:6px;right:6px;
                       padding:3px 6px;background:#166534;color:#fff;border:none;
                       border-radius:4px;font-size:11px;cursor:pointer;font-weight:600;">
                + Add to Trip
              </button>
              <div style="line-height:1.3em;margin-top:6px;">
                <strong style="font-size:14px;color:#FFD700;">${retailer}</strong><br/>
                <em>${siteName}</em><br/>
                ${address}<br/>
                ${p.City || ""} ${p.State || ""} ${p.Zip || ""}<br/>
                <strong>Category:</strong> ${category}<br/>
                <strong>Suppliers:</strong> ${suppliers}
              </div>
            </div>`;

          if (popupRef.current) popupRef.current.remove();
          const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "none" })
            .setLngLat(coords as LngLatLike)
            .setHTML(html)
            .addTo(map);
          popupRef.current = popup;

          setTimeout(() => {
            const btn = document.getElementById(btnId);
            if (btn && onAddStop)
              btn.onclick = () =>
                onAddStop({
                  label: stopLabel,
                  address,
                  city: p.City || "",
                  state: p.State || "",
                  zip: p.Zip || "",
                  coords,
                });
          }, 100);
        });

        ["retailers-layer", "kingpins-layer"].forEach((layer) => {
          map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
        });
      } catch (err) {
        console.error("❌ Failed to load GeoJSON", err);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onAddStop]);

  // ========================================
  // 🏠 HOME MARKER
  // ========================================
  useEffect(() => {
    if (!zipCode || !mapRef.current) return;
    if (homeMarkerRef.current) homeMarkerRef.current.remove();

    const el = document.createElement("img");
    el.src = `${basePath}/icons/Blue-Home.png`;
    el.style.width = "10px";
    el.style.height = "10px";

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([-93.0, 42.0])
      .addTo(mapRef.current);

    homeMarkerRef.current = marker;
  }, [zipCode]);

  // ========================================
  // 🚗 ROUTE DRAWING (FOLLOW ROADS)
  // ========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || tripStops.length < 2) return;

    async function drawRoute() {
      try {
        const coordsStr = tripStops.map((s) => `${s.coords[0]},${s.coords[1]}`).join(";");
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
        const res = await fetch(url);
        const json = await res.json();
        const route = json.routes?.[0]?.geometry;

        const source = map.getSource(routeSourceId) as mapboxgl.GeoJSONSource;
        if (route && source) {
          source.setData({
            type: "FeatureCollection",
            features: [
              { type: "Feature", geometry: route, properties: {} },
            ],
          });
        }
      } catch (err) {
        console.error("Route error:", err);
      }
    }
    drawRoute();
  }, [tripStops, tripMode]);

  // ========================================
  // 🔄 FILTERING + RETAILER SUMMARY
  // ========================================
  useEffect(() => {
    if (!mapRef.current || !masterFeaturesRef.current.length) return;
    const map = mapRef.current;
    const source = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!source) return;

    const filtered = masterFeaturesRef.current.filter((f: any) => {
      const p = f.properties || {};
      const category = p.DisplayCategory;
      const retailer = p.Retailer || "";
      const state = p.State || "";
      const supplierList = parseSuppliers(p.Suppliers).map(norm);
      if (category === "Kingpin") return true;
      const matchState = selectedStates.length === 0 || selectedStates.includes(state);
      const matchRetailer = selectedRetailers.length === 0 || selectedRetailers.includes(retailer);
      const matchCategory = selectedCategories.length === 0 || selectedCategories.includes(category);
      const matchSupplier =
        selectedSuppliers.length === 0 || selectedSuppliers.some((s) => supplierList.includes(norm(s)));
      return matchState && matchRetailer && matchCategory && matchSupplier;
    });

    source.setData({ type: "FeatureCollection", features: filtered });

    const summaryMap = new Map<
      string,
      { retailer: string; count: number; categories: Set<string>; states: Set<string>; suppliers: Set<string> }
    >();

    for (const f of filtered) {
      const p = f.properties || {};
      const retailer = p.Retailer || "Unknown";
      const category = p.DisplayCategory || "N/A";
      const state = p.State || "";
      const suppliers = parseSuppliers(p.Suppliers);

      if (!summaryMap.has(retailer))
        summaryMap.set(retailer, { retailer, count: 0, categories: new Set(), states: new Set(), suppliers: new Set() });
      const entry = summaryMap.get(retailer)!;
      entry.count++;
      entry.categories.add(category);
      entry.states.add(state);
      suppliers.forEach((s) => entry.suppliers.add(s));
    }

    const summaries = Array.from(summaryMap.values()).map((v) => ({
      retailer: v.retailer,
      count: v.count,
      suppliers: Array.from(v.suppliers),
      states: Array.from(v.states),
      categories: Array.from(v.categories),
    }));
    onRetailerSummary?.(summaries);
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  return <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />;
}
