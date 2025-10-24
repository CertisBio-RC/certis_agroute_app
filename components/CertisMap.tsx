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
  Agronomy: { color: "#FFD700", outline: "#000" },
  "Grain/Feed": { color: "#228B22", outline: "#000" },
  Feed: { color: "#8B4513", outline: "#000" },
  "Office/Service": { color: "#1E90FF", outline: "#000" },
  Distribution: { color: "#FF8C00", outline: "#000" },
  Kingpin: { color: "#FF0000", outline: "#FFFF00" },
};

// ========================================
// ⚙️ NORMALIZATION HELPERS
// ========================================
const norm = (v: string) => (v || "").toString().trim().toLowerCase();

const normalizeCategory = (cat: string): string => {
  const c = norm(cat);
  if (["agronomy/grain", "agronomygrain"].includes(c)) return "agronomy/grain";
  return c;
};

const assignDisplayCategory = (cat: string): string => {
  const c = normalizeCategory(cat);
  if (c.includes("agronomy")) return "Agronomy";
  if (c.includes("grain")) return "Grain/Feed";
  if (c.includes("feed")) return "Feed";
  if (c.includes("office")) return "Office/Service";
  if (c.includes("distribution")) return "Distribution";
  if (c.includes("kingpin")) return "Kingpin";
  return "Unknown";
};

const parseSuppliers = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((v) => v.trim());
  if (typeof val === "string")
    return val
      .split(/[,;/|]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  return [];
};

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
  const masterFeaturesRef = useRef<any[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const geojsonPath = `${basePath}/data/retailers.geojson?v=20251024`;

  // ========================================
  // 🗺️ MAP INITIALIZATION
  // ========================================
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-97, 39],
      zoom: 4,
      projection: "mercator",
    });

    mapRef.current = map;

    map.on("load", async () => {
      try {
        const response = await fetch(geojsonPath, { cache: "no-store" });
        if (!response.ok) throw new Error(`GeoJSON fetch failed: ${response.status}`);
        const data = await response.json();

        // Validate features
        const validFeatures = data.features.filter((f: any) => {
          const coords = f.geometry?.coordinates;
          return (
            Array.isArray(coords) &&
            coords.length === 2 &&
            !isNaN(coords[0]) &&
            !isNaN(coords[1])
          );
        });

        // Assign display categories
        for (const f of validFeatures) {
          f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
        }

        masterFeaturesRef.current = validFeatures;

        // Build unique sets for dropdowns
        const states = new Set<string>();
        const retailers = new Set<string>();
        const suppliers = new Set<string>();

        validFeatures.forEach((f: any) => {
          const p = f.properties || {};
          if (p.State) states.add(p.State);
          if (p.Retailer) retailers.add(p.Retailer);
          parseSuppliers(p.Suppliers).forEach((s) => suppliers.add(s));
        });

        onStatesLoaded?.(Array.from(states).sort());
        onRetailersLoaded?.(Array.from(retailers).sort());
        onSuppliersLoaded?.(Array.from(suppliers).sort());

        // Initialize retailer summary
        const summary: Record<string, { suppliers: Set<string>; states: Set<string>; count: number }> = {};
        validFeatures.forEach((f: any) => {
          const p = f.properties || {};
          const r = p.Retailer || "Unknown";
          if (!summary[r]) summary[r] = { suppliers: new Set(), states: new Set(), count: 0 };
          summary[r].count++;
          parseSuppliers(p.Suppliers).forEach((s) => summary[r].suppliers.add(s));
          if (p.State) summary[r].states.add(p.State);
        });

        const summaries = Object.entries(summary).map(([retailer, info]) => ({
          retailer,
          count: info.count,
          suppliers: Array.from(info.suppliers),
          states: Array.from(info.states),
        }));
        onRetailerSummary?.(summaries);

        // Add map source
        map.addSource("retailers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: validFeatures },
        });

        // Regular locations
        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 4,
            "circle-color": [
              "match",
              ["get", "DisplayCategory"],
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
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#fff",
          },
          filter: ["!=", ["get", "DisplayCategory"], "Kingpin"],
        });

        // Kingpins
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
          filter: ["==", ["get", "DisplayCategory"], "Kingpin"],
        });

        // Popup
        map.on("click", ["retailers-layer", "kingpins-layer"], (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties || {};
          const coords = (f.geometry as any).coordinates as [number, number];
          const suppliersArr = parseSuppliers(p.Suppliers);
          const suppliers = suppliersArr.length ? suppliersArr.join(", ") : "N/A";

          const popupHTML = `
            <div style="font-size:13px;width:340px;background:#1a1a1a;color:#f5f5f5;
                        padding:6px;border-radius:4px;position:relative;">
              <button id="add-stop-btn" style="position:absolute;top:4px;right:4px;
                       padding:2px 6px;background:#166534;color:#fff;border:none;
                       border-radius:3px;font-size:11px;cursor:pointer;font-weight:600;">
                + Add to Trip
              </button>
              <strong>${p.Retailer || "Unknown"}</strong><br/>
              <em>${p.Name || ""}</em><br/>
              ${cleanAddress(p.Address || "")}<br/>
              ${p.City || ""} ${p.State || ""} ${p.Zip || ""}<br/>
              <strong>Category:</strong> ${p.DisplayCategory}<br/>
              <strong>Suppliers:</strong> ${suppliers}
            </div>
          `;

          if (popupRef.current) popupRef.current.remove();
          const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
            .setLngLat(coords as LngLatLike)
            .setHTML(popupHTML)
            .addTo(map);
          popupRef.current = popup;
        });
      } catch (err) {
        console.error("❌ GeoJSON load error:", err);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onRetailerSummary]);

  // ========================================
  // 🔄 FILTERING
  // ========================================
  useEffect(() => {
    if (!mapRef.current || !masterFeaturesRef.current.length) return;
    const map = mapRef.current;
    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!src) return;

    const filtered = masterFeaturesRef.current.filter((f: any) => {
      const p = f.properties || {};
      const category = p.DisplayCategory;
      const state = p.State || "";
      const retailer = p.Retailer || "";
      const suppliers = parseSuppliers(p.Suppliers).map(norm);

      if (category === "Kingpin") return true;

      const matchState =
        selectedStates.length === 0 || selectedStates.includes(state);
      const matchRetailer =
        selectedRetailers.length === 0 || selectedRetailers.includes(retailer);
      const matchCategory =
        selectedCategories.length === 0 || selectedCategories.includes(category);
      const matchSupplier =
        selectedSuppliers.length === 0 ||
        selectedSuppliers.some((s) => suppliers.includes(norm(s)));

      return matchState && matchRetailer && matchCategory && matchSupplier;
    });

    src.setData({ type: "FeatureCollection", features: filtered });

    if (onRetailerSummary) {
      const summary: Record<string, { suppliers: Set<string>; states: Set<string>; count: number }> = {};
      filtered.forEach((f: any) => {
        const p = f.properties || {};
        const r = p.Retailer || "Unknown";
        if (!summary[r]) summary[r] = { suppliers: new Set(), states: new Set(), count: 0 };
        summary[r].count++;
        parseSuppliers(p.Suppliers).forEach((s) => summary[r].suppliers.add(s));
        if (p.State) summary[r].states.add(p.State);
      });
      const summaries = Object.entries(summary).map(([retailer, info]) => ({
        retailer,
        count: info.count,
        suppliers: Array.from(info.suppliers),
        states: Array.from(info.states),
      }));
      onRetailerSummary(summaries);
    }
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers, onRetailerSummary]);

  return <div ref={mapContainer} className="w-full h-full border-t border-gray-700" />;
}
