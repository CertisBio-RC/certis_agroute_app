// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";
import Image from "next/image";

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
// ⚙️ Normalizers
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
// 🧩 Supplier Normalization + Robust Parsing
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
  const geojsonPath = `${basePath}/data/retailers.geojson?v=20251021i`;

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

        // Normalize categories
        for (const f of data.features) {
          f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
        }

        // Collect unique sets
        const stateSet = new Set<string>();
        const retailerSet = new Set<string>();
        const supplierSet = new Set<string>();

        for (const f of data.features) {
          const props = f.properties || {};
          const st = props.State;
          const r = props.Retailer;
          const rawSuppliers =
            props.Suppliers || props.Supplier || props["Supplier(s)"] || props["Suppliers(s)"];
          if (st) stateSet.add(st);
          if (r) retailerSet.add(r);
          parseSuppliers(rawSuppliers).forEach((s) => supplierSet.add(s));
        }

        onStatesLoaded?.(Array.from(stateSet).sort());
        onRetailersLoaded?.(Array.from(retailerSet).sort());
        onSuppliersLoaded?.(Array.from(supplierSet).sort());

        map.addSource("retailers", { type: "geojson", data });

        // Retailers Layer
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

        // Kingpins Layer (visible by default)
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
          const stopLabel = siteName ? `${retailer} – ${siteName}` : retailer;
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
              ${p.Address || ""}<br/>
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
                  address: p.Address || "",
                  city: p.City || "",
                  state: p.State || "",
                  zip: p.Zip || "",
                  coords: coords as [number, number],
                });
            }
          }, 100);
        });

        ["retailers-layer", "kingpins-layer"].forEach((layer) => {
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        });
      } catch (err) {
        console.error("❌ Failed to load GeoJSON", err);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onAddStop]);

  // ========================================
  // 🔄 Filtering + Sidebar Summary
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
      const p = f.properties || {};
      const category = p.DisplayCategory;
      const retailer = p.Retailer || "";
      const state = p.State || "";
      const supplierList = parseSuppliers(
        p.Suppliers || p.Supplier || p["Supplier(s)"] || p["Suppliers(s)"]
      ).map(norm);

      if (category === "Kingpin") return true;
      if (selectedStates.length > 0 && !selectedStates.includes(state)) return false;
      if (selectedRetailers.length > 0 && !selectedRetailers.includes(retailer)) return false;

      const catNorm = norm(category);
      const categoryMatch =
        selectedCategories.length === 0
          ? ["agronomy", "agronomy/grain", "grain/feed"].includes(catNorm)
          : selectedCategories.includes(catNorm);

      const supplierMatch =
        selectedSuppliers.length === 0 ||
        selectedSuppliers.some((s) => supplierList.includes(norm(s)));

      return categoryMatch && supplierMatch;
    });

    source.setData({ type: "FeatureCollection", features: filtered });

    if (onRetailerSummary) {
      const summaryMap = new Map<
        string,
        { retailer: string; count: number; suppliers: string[]; categories: string[]; states: string[] }
      >();

      for (const f of filtered) {
        const p = f.properties || {};
        if (p.DisplayCategory === "Kingpin") continue;
        const state = p.State || "Unknown";
        const retailer = p.Retailer || "Unknown";
        const suppliers = parseSuppliers(p.Suppliers || p.Supplier || p["Supplier(s)"] || p["Suppliers(s)"]);
        const categories = expandCategories(p.Category || "");

        if (!summaryMap.has(retailer)) {
          summaryMap.set(retailer, { retailer, count: 0, suppliers: [], categories: [], states: [] });
        }

        const entry = summaryMap.get(retailer)!;
        entry.count += 1;
        if (state && !entry.states.includes(state)) entry.states.push(state);
        suppliers.forEach((s) => !entry.suppliers.includes(s) && entry.suppliers.push(s));
        categories.forEach((c) => !entry.categories.includes(c) && entry.categories.push(c));
      }

      onRetailerSummary(Array.from(summaryMap.values()));
    }
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers, onRetailerSummary]);

  // ========================================
  // 🧱 Render Map + Logo
  // ========================================
  return (
    <div className="relative w-full h-full">
      <div className="absolute top-2 left-2 z-20 bg-white bg-opacity-80 p-1 rounded">
        <Image
          src={`${basePath}/certis-logo.png`}
          alt="Certis Biologicals"
          width={180}
          height={50}
          priority
        />
      </div>
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}
