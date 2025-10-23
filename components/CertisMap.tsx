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
// ⚙️ NORMALIZERS
// ========================================
const norm = (v: string) => (v || "").toString().trim().toLowerCase();

const normalizeCategory = (cat: string) => {
  const c = norm(cat);
  if (["agronomy/grain", "agronomygrain", "agronomy hybrid"].includes(c))
    return "agronomy/grain";
  return c;
};

const expandCategories = (cat: string): string[] => {
  const c = normalizeCategory(cat);
  if (c === "agronomy/grain") return ["agronomy", "grain"];
  return [c];
};

const assignDisplayCategory = (cat: string): string => {
  const expanded = expandCategories(cat);
  if (expanded.includes("agronomy")) return "Agronomy";
  if (expanded.includes("grain")) return "Grain/Feed";
  if (expanded.includes("feed")) return "Feed";
  if (expanded.includes("officeservice") || expanded.includes("office/service"))
    return "Office/Service";
  if (expanded.includes("distribution")) return "Distribution";
  if (expanded.includes("kingpin")) return "Kingpin";
  return "Unknown";
};

// ========================================
// 🧩 SUPPLIER NORMALIZATION
// ========================================
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
      categories: string[];
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
  const geojsonPath = `${basePath}/data/retailers.geojson?v=20251023`;

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
        const response = await fetch(geojsonPath, { cache: "no-store" });
        if (!response.ok) throw new Error(`GeoJSON fetch failed: ${response.status}`);
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
          const st = p.State;
          const r = p.Retailer;
          const rawSuppliers = p.Suppliers || p.Supplier || p["Supplier(s)"] || p["Suppliers(s)"];
          if (st) stateSet.add(st);
          if (r) retailerSet.add(r);
          parseSuppliers(rawSuppliers).forEach((s) => supplierSet.add(s));
        }

        onStatesLoaded?.(Array.from(stateSet).sort());
        onRetailersLoaded?.(Array.from(retailerSet).sort());
        onSuppliersLoaded?.(Array.from(supplierSet).sort());

        map.addSource("retailers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: validFeatures },
        });

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
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
          filter: ["!=", ["get", "DisplayCategory"], "Kingpin"],
          layout: { visibility: "visible" },
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
          filter: ["==", ["get", "DisplayCategory"], "Kingpin"],
          layout: { visibility: "visible" },
        });

        // Popups
        map.on("click", ["retailers-layer", "kingpins-layer"], (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const geom = f.geometry as GeoJSON.Point;
          const coords = Array.isArray(geom?.coordinates)
            ? (geom.coordinates.slice(0, 2) as [number, number])
            : [0, 0];
          const p = f.properties || {};

          const suppliersArr = parseSuppliers(
            p.Suppliers || p.Supplier || p["Supplier(s)"] || p["Suppliers(s)"]
          );
          const suppliers = suppliersArr.length > 0 ? suppliersArr.join(", ") : "N/A";
          const retailer = p.Retailer || "Unknown";
          const siteName = p.Name || "";
          const category = p.DisplayCategory || "N/A";
          const address = cleanAddress(p.Address || "");
          const stopLabel = siteName ? `${retailer} – ${siteName}` : retailer;
          const btnId = `add-stop-${Math.random().toString(36).slice(2)}`;

          const popupHTML = `
            <div style="font-size:13px;width:340px;background:#1a1a1a;color:#f5f5f5;
                        padding:6px;border-radius:4px;position:relative;">
              <button id="${btnId}" style="position:absolute;top:4px;right:4px;
                       padding:2px 6px;background:#166534;color:#fff;border:none;
                       border-radius:3px;font-size:11px;cursor:pointer;font-weight:600;">
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

          const popup = new mapboxgl.Popup({
            closeButton: true,
            closeOnClick: true,
            maxWidth: "none",
          })
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
  // 🔄 FILTERING (HYBRID ADDITIVE)
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
      const supplierList = parseSuppliers(
        p.Suppliers || p.Supplier || p["Supplier(s)"] || p["Suppliers(s)"]
      ).map(norm);

      if (category === "Kingpin") return true;

      const matchState = selectedStates.length === 0 || selectedStates.includes(state);
      const matchRetailer = selectedRetailers.length === 0 || selectedRetailers.includes(retailer);
      const matchCategory =
        selectedCategories.length === 0 || selectedCategories.includes(norm(category));
      const matchSupplier =
        selectedSuppliers.length === 0 ||
        selectedSuppliers.some((s) => supplierList.includes(norm(s)));

      return matchState && matchRetailer && matchCategory && matchSupplier;
    });

    source.setData({ type: "FeatureCollection", features: filtered });
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  return <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />;
}
