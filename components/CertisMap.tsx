"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app";

// ========================================
// 🎨 CATEGORY COLORS
// ========================================
export const categoryColors: Record<string, { color: string; outline?: string }> = {
  Agronomy: { color: "#FFD700", outline: "#000" },
  "Grain/Feed": { color: "#228B22", outline: "#000" },
  Feed: { color: "#8B4513", outline: "#000" },
  "Office/Service": { color: "#1E90FF", outline: "#000" },
  Distribution: { color: "#FF8C00", outline: "#000" },
  Kingpin: { color: "#FF0000", outline: "#FFFF00" },
};

// ========================================
// ⚙️ HELPERS
// ========================================
const norm = (v: string) => (v || "").toString().trim().toLowerCase();

const cleanAddress = (addr: string): string =>
  addr.replace(/\(.*?\)/g, "").replace(/\bP\.?O\.?\s*Box\b.*$/i, "").trim();

function parseSuppliers(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((s) => s.trim());
  if (typeof value === "object") return Object.values(value).map((s: any) => s.toString().trim());
  if (typeof value === "string")
    return value
      .split(/[,;/|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

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
    }[]
  ) => void;
  onAddStop?: (stop: Stop) => void;
  tripStops?: Stop[];
  tripMode?: "entered" | "optimize";
  onOptimizedRoute?: (stops: Stop[]) => void;
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
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const allFeaturesRef = useRef<any[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const geojsonPath = `${basePath}/data/retailers.geojson?v=20251024`;

  // ========================================
  // 🗺️ INIT MAP
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
        const response = await fetch(geojsonPath, { cache: "no-store" });
        if (!response.ok) throw new Error(`GeoJSON fetch failed: ${response.status}`);
        const data = await response.json();

        const valid = data.features.filter(
          (f: any) =>
            f.geometry?.coordinates?.length === 2 &&
            !isNaN(f.geometry.coordinates[0]) &&
            !isNaN(f.geometry.coordinates[1])
        );

        allFeaturesRef.current = valid;

        // Populate dropdowns
        const states = new Set<string>();
        const retailers = new Set<string>();
        const suppliers = new Set<string>();

        for (const f of valid) {
          const p = f.properties || {};
          if (p.State) states.add(p.State);
          if (p.Retailer) retailers.add(p.Retailer);
          parseSuppliers(p.Suppliers).forEach((s) => suppliers.add(s));
        }

        onStatesLoaded?.(Array.from(states).sort());
        onRetailersLoaded?.(Array.from(retailers).sort());
        onSuppliersLoaded?.(Array.from(suppliers).sort());

        // Initial retailer summary
        const summaryMap: Record<
          string,
          { suppliers: Set<string>; states: Set<string>; count: number }
        > = {};
        for (const f of valid) {
          const p = f.properties || {};
          const retailer = p.Retailer || "Unknown";
          const state = p.State || "";
          const sups = parseSuppliers(p.Suppliers);
          if (!summaryMap[retailer]) {
            summaryMap[retailer] = { suppliers: new Set(), states: new Set(), count: 0 };
          }
          summaryMap[retailer].count++;
          sups.forEach((s) => summaryMap[retailer].suppliers.add(s));
          if (state) summaryMap[retailer].states.add(state);
        }
        const summaries = Object.entries(summaryMap).map(([retailer, info]) => ({
          retailer,
          count: info.count,
          suppliers: Array.from(info.suppliers),
          states: Array.from(info.states),
        }));
        onRetailerSummary?.(summaries);

        // Source + layers
        map.addSource("retailers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: valid },
        });

        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 4,
            "circle-color": [
              "match",
              ["get", "Category"],
              "Agronomy",
              categoryColors.Agronomy.color,
              "Grain/Feed",
              categoryColors["Grain/Feed"].color,
              "Feed",
              categoryColors.Feed.color,
              "Office/Service",
              categoryColors["Office/Service"].color,
              "Distribution",
              categoryColors.Distribution.color,
              "#1d4ed8",
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
          filter: ["!=", ["get", "Category"], "Kingpin"],
        });

        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 6,
            "circle-color": categoryColors.Kingpin.color,
            "circle-stroke-width": 3,
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
          filter: ["==", ["get", "Category"], "Kingpin"],
        });

        // Popup
        map.on("click", ["retailers-layer", "kingpins-layer"], (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const geom = f.geometry as GeoJSON.Point;
          const coords = geom.coordinates as [number, number];
          const p = f.properties || {};
          const suppliersArr = parseSuppliers(p.Suppliers);
          const suppliers = suppliersArr.length ? suppliersArr.join(", ") : "N/A";
          const retailer = p.Retailer || "Unknown";
          const siteName = p.Name || "";
          const category = p.Category || "N/A";
          const address = cleanAddress(p.Address || "");
          const stopLabel = siteName ? `${retailer} – ${siteName}` : retailer;
          const btnId = `add-stop-${Math.random().toString(36).slice(2)}`;

          const popupHTML = `
            <div style="font-size:13px;width:340px;background:#1a1a1a;color:#f5f5f5;padding:6px;border-radius:4px;position:relative;">
              <button id="${btnId}" style="position:absolute;top:4px;right:4px;padding:2px 6px;background:#166534;color:#fff;border:none;border-radius:3px;font-size:11px;cursor:pointer;font-weight:600;">
                + Add to Trip
              </button>
              <strong>${retailer}</strong><br/>
              <em>${siteName}</em><br/>
              ${address}<br/>
              ${p.City || ""} ${p.State || ""} ${p.Zip || ""}<br/>
              <strong>Category:</strong> ${category}<br/>
              <strong>Suppliers:</strong> ${suppliers}
            </div>
          `;

          if (popupRef.current) popupRef.current.remove();

          const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "none" })
            .setLngLat(coords as LngLatLike)
            .setHTML(popupHTML)
            .addTo(map);

          popupRef.current = popup;

          setTimeout(() => {
            const btn = document.getElementById(btnId);
            if (btn && onAddStop) {
              btn.onclick = () =>
                onAddStop({
                  label: stopLabel,
                  address,
                  city: p.City || "",
                  state: p.State || "",
                  zip: p.Zip || "",
                  coords: coords as [number, number],
                });
            }
          }, 100);
        });
      } catch (err) {
        console.error("❌ Failed to load GeoJSON", err);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onRetailerSummary, onAddStop]);

  // ========================================
  // 🔄 FILTERING
  // ========================================
  useEffect(() => {
    if (!mapRef.current || !allFeaturesRef.current.length) return;
    const map = mapRef.current;
    const source = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!source) return;

    const filtered = allFeaturesRef.current.filter((f: any) => {
      const p = f.properties || {};
      const category = p.Category || "";
      const retailer = p.Retailer || "";
      const state = p.State || "";
      const suppliers = parseSuppliers(p.Suppliers).map(norm);

      if (category === "Kingpin") return true;

      const matchState = !selectedStates.length || selectedStates.includes(state);
      const matchRetailer = !selectedRetailers.length || selectedRetailers.includes(retailer);
      const matchCategory = !selectedCategories.length || selectedCategories.includes(category);
      const matchSupplier =
        !selectedSuppliers.length ||
        selectedSuppliers.some((s) => suppliers.includes(norm(s)));

      return matchState && matchRetailer && matchCategory && matchSupplier;
    });

    source.setData({ type: "FeatureCollection", features: filtered });

    // Refresh summary
    if (onRetailerSummary) {
      const summaryMap: Record<string, { suppliers: Set<string>; states: Set<string>; count: number }> = {};
      for (const f of filtered) {
        const p = f.properties || {};
        const retailer = p.Retailer || "Unknown";
        const state = p.State || "";
        const sups = parseSuppliers(p.Suppliers);
        if (!summaryMap[retailer]) {
          summaryMap[retailer] = { suppliers: new Set(), states: new Set(), count: 0 };
        }
        summaryMap[retailer].count++;
        sups.forEach((s) => summaryMap[retailer].suppliers.add(s));
        if (state) summaryMap[retailer].states.add(state);
      }

      const summaries = Object.entries(summaryMap).map(([retailer, info]) => ({
        retailer,
        count: info.count,
        suppliers: Array.from(info.suppliers),
        states: Array.from(info.states),
      }));
      onRetailerSummary(summaries);
    }
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers, onRetailerSummary]);

  return <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />;
}
