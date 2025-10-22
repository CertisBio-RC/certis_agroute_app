// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app";

// ========================================
// 🎨 Category Colors
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
// ⚙️ Normalizers + Utilities
// ========================================
const norm = (v: string) => (v || "").toString().trim().toLowerCase();

const normalizeCategory = (cat: string) => {
  const c = norm(cat);
  if (["agronomy/grain", "agronomygrain", "agronomy hybrid"].includes(c)) return "agronomy/grain";
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
  if (expanded.includes("officeservice") || expanded.includes("office/service")) return "Office/Service";
  if (expanded.includes("distribution")) return "Distribution";
  if (expanded.includes("kingpin")) return "Kingpin";
  return "Unknown";
};

// ========================================
// 🧹 Address Sanitizer
// ========================================
const sanitizeAddress = (addr: string): string => {
  return (addr || "")
    .replace(/\bP\.?\s*O\.?\s*Box\s*\d*/gi, "")
    .replace(/,+/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
};

// ========================================
// 🧩 Supplier Parser (multi-format robust)
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
// 📍 Types
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
// 🗺️ Component
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
  onOptimizedRoute,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const geoDataRef = useRef<any>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const geojsonPath = `${basePath}/data/retailers.geojson?v=20251022a`;

  // ========================================
  // 🗺️ Map Initialization
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
        geoDataRef.current = data;

        // Assign normalized categories
        for (const f of data.features) {
          f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
        }

        // Collect unique metadata
        const stateSet = new Set<string>();
        const retailerSet = new Set<string>();
        const supplierSet = new Set<string>();

        for (const f of data.features) {
          const props = f.properties || {};
          if (props.State) stateSet.add(props.State);
          if (props.Retailer) retailerSet.add(props.Retailer);
          parseSuppliers(
            props.Suppliers || props.Supplier || props["Supplier(s)"]
          ).forEach((s) => supplierSet.add(s));
        }

        onStatesLoaded?.(Array.from(stateSet).sort());
        onRetailersLoaded?.(Array.from(retailerSet).sort());
        onSuppliersLoaded?.(Array.from(supplierSet).sort());

        map.addSource("retailers", { type: "geojson", data });

        // Hide all but Kingpins initially
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
          layout: { visibility: "none" },
        });

        // Kingpin layer visible by default
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

        // 💬 Popup (persistent + trip-safe)
        map.on("click", ["retailers-layer", "kingpins-layer"], (e) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const props = feature.properties || {};
          const geom: any = feature.geometry;
          const coords: [number, number] = Array.isArray(geom?.coordinates)
            ? geom.coordinates
            : [0, 0];

          const suppliers = parseSuppliers(
            props.Suppliers || props.Supplier || props["Supplier(s)"]
          ).join(", ") || "N/A";

          const retailer = props.Retailer || "Unknown";
          const siteName = props.Name || "";
          const stopLabel = siteName ? `${retailer} – ${siteName}` : retailer;
          const category = props.DisplayCategory || "N/A";
          const btnId = `add-stop-${Math.random().toString(36).slice(2)}`;

          const popupHTML = `
            <div style="font-size:13px;width:360px;background:#1a1a1a;color:#f5f5f5;
                        padding:6px;border-radius:4px;position:relative;">
              <button id="${btnId}"
                style="position:absolute;top:4px;right:4px;padding:2px 6px;
                       background:#166534;color:#fff;border:none;border-radius:3px;
                       font-size:11px;cursor:pointer;font-weight:600;">
                + Add to Trip
              </button>
              <strong>${retailer}</strong><br/>
              <em>${siteName}</em><br/>
              ${sanitizeAddress(props.Address || "")}<br/>
              ${props.City || ""} ${props.State || ""} ${props.Zip || ""}<br/>
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
            .setLngLat(coords)
            .setHTML(popupHTML)
            .addTo(map);

          popupRef.current = popup;

          setTimeout(() => {
            const btn = document.getElementById(btnId);
            if (btn && onAddStop) {
              btn.onclick = () =>
                onAddStop({
                  label: stopLabel,
                  address: sanitizeAddress(props.Address || ""),
                  city: props.City || "",
                  state: props.State || "",
                  zip: props.Zip || "",
                  coords,
                });
            }
          }, 100);
        });

        // 🖱 Pointer Cursor
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
  // 🔄 Real-Time Filtering (multi-selection safe)
  // ========================================
  useEffect(() => {
    if (!mapRef.current || !geoDataRef.current) return;
    const map = mapRef.current;
    const data = geoDataRef.current;
    const source = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!source) return;

    const hasFilters =
      selectedStates.length > 0 ||
      selectedRetailers.length > 0 ||
      selectedSuppliers.length > 0 ||
      selectedCategories.length > 0;

    map.setLayoutProperty("retailers-layer", "visibility", hasFilters ? "visible" : "none");

    const filtered = data.features.filter((f: any) => {
      const props = f.properties || {};
      const category = props.DisplayCategory;
      const retailer = props.Retailer || "";
      const state = props.State || "";
      const suppliers = parseSuppliers(
        props.Suppliers || props.Supplier || props["Supplier(s)"]
      ).map(norm);

      if (category === "Kingpin") return true;
      if (selectedStates.length && !selectedStates.includes(state)) return false;
      if (selectedRetailers.length && !selectedRetailers.includes(retailer)) return false;

      const catNorm = norm(category);
      const categoryMatch =
        selectedCategories.length === 0
          ? ["agronomy", "grain/feed", "feed"].includes(catNorm)
          : selectedCategories.includes(category);

      const supplierMatch =
        selectedSuppliers.length === 0 ||
        selectedSuppliers.some((s) => suppliers.includes(norm(s)));

      return categoryMatch && supplierMatch;
    });

    source.setData({ type: "FeatureCollection", features: filtered });

    // Retailer summary callback
    if (onRetailerSummary) {
      const summary = new Map<
        string,
        { retailer: string; count: number; suppliers: string[]; categories: string[]; states: string[] }
      >();

      for (const f of filtered) {
        const props = f.properties || {};
        if (props.DisplayCategory === "Kingpin") continue;
        const retailer = props.Retailer || "Unknown";
        const suppliers = parseSuppliers(props.Suppliers || props.Supplier || props["Supplier(s)"]);
        const categories = expandCategories(props.Category || "");
        const state = props.State || "Unknown";

        if (!summary.has(retailer))
          summary.set(retailer, { retailer, count: 0, suppliers: [], categories: [], states: [] });

        const e = summary.get(retailer)!;
        e.count++;
        suppliers.forEach((s) => !e.suppliers.includes(s) && e.suppliers.push(s));
        categories.forEach((c) => !e.categories.includes(c) && e.categories.push(c));
        if (!e.states.includes(state)) e.states.push(state);
      }

      onRetailerSummary(Array.from(summary.values()));
    }
  }, [selectedStates, selectedRetailers, selectedSuppliers, selectedCategories, onRetailerSummary]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
