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
// ⚙️ Normalizers
// ========================================
const norm = (v: string) => (v || "").toString().trim().toLowerCase();

function sanitizeAddress(addr: string): string {
  if (!addr) return "";
  return addr
    .replace(/\b(P\.?O\.?\s*Box\s*\d*)/gi, "")
    .replace(/\b(Attn:?)/gi, "")
    .replace(/[;,]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const expandCategories = (cat: string): string[] => {
  const c = norm(cat);
  if (["agronomy/grain", "agronomygrain", "agronomy hybrid"].includes(c))
    return ["agronomy", "grain"];
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
// 🧩 Supplier Parsing
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
// 🗺️ Map Component
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
  const geojsonPath = `${basePath}/data/retailers.geojson?v=20251022b`;

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

        // Normalize and prep
        for (const f of data.features) {
          f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
        }

        const stateSet = new Set<string>();
        const retailerSet = new Set<string>();
        const supplierSet = new Set<string>();

        for (const f of data.features) {
          const p = f.properties || {};
          if (p.State) stateSet.add(p.State);
          if (p.Retailer) retailerSet.add(p.Retailer);
          const sup = parseSuppliers(p.Suppliers || p.Supplier || p["Supplier(s)"]);
          sup.forEach((s) => supplierSet.add(s));
        }

        onStatesLoaded?.(Array.from(stateSet).sort());
        onRetailersLoaded?.(Array.from(retailerSet).sort());
        onSuppliersLoaded?.(Array.from(supplierSet).sort());

        map.addSource("retailers", { type: "geojson", data });

        // Layers
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
          layout: { visibility: "none" },
        });

        // Kingpins layer visible by default
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

        // Popup logic
        map.on("click", ["retailers-layer", "kingpins-layer"], (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const geom = f.geometry as GeoJSON.Point;
          const coords: [number, number] = Array.isArray(geom?.coordinates)
            ? geom.coordinates
            : [0, 0];
          const p = f.properties || {};

          const suppliers = parseSuppliers(p.Suppliers || p.Supplier || p["Supplier(s)"]);
          const supplierStr = suppliers.length > 0 ? suppliers.join(", ") : "N/A";
          const addr = sanitizeAddress(p.Address || "");
          const retailer = p.Retailer || "Unknown";
          const site = p.Name || "";
          const category = p.DisplayCategory || "N/A";
          const stopLabel = site ? `${retailer} – ${site}` : retailer;
          const btnId = `btn-${Math.random().toString(36).slice(2)}`;
          const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
            addr + " " + (p.City || "") + " " + (p.State || "")
          )}`;
          const amaps = `https://maps.apple.com/?daddr=${encodeURIComponent(
            addr + " " + (p.City || "") + " " + (p.State || "")
          )}`;

          const html = `
            <div style="font-size:13px;width:360px;background:#1a1a1a;color:#f5f5f5;padding:6px;border-radius:4px;position:relative;">
              <button id="${btnId}"
                style="position:absolute;top:4px;right:4px;padding:2px 6px;background:#166534;color:#fff;border:none;border-radius:3px;font-size:11px;cursor:pointer;font-weight:600;">
                + Add to Trip
              </button>
              <strong>${retailer}</strong><br/>
              <em>${site}</em><br/>
              ${addr}<br/>
              ${p.City || ""} ${p.State || ""} ${p.Zip || ""}<br/>
              <strong>Category:</strong> ${category}<br/>
              <strong>Suppliers:</strong> ${supplierStr}<br/>
              <div style="margin-top:6px;">
                <a href="${gmaps}" target="_blank" style="color:#00b0ff;font-size:12px;margin-right:10px;">📍 Google Maps</a>
                <a href="${amaps}" target="_blank" style="color:#00ff9d;font-size:12px;">🍎 Apple Maps</a>
              </div>
            </div>`;

          if (popupRef.current) popupRef.current.remove();

          const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
            .setLngLat(coords)
            .setHTML(html)
            .addTo(map);

          popupRef.current = popup;

          setTimeout(() => {
            const btn = document.getElementById(btnId);
            if (btn && onAddStop) {
              btn.onclick = () =>
                onAddStop({
                  label: stopLabel,
                  address: addr,
                  city: p.City || "",
                  state: p.State || "",
                  zip: p.Zip || "",
                  coords,
                });
            }
          }, 100);
        });

        // Pointer cursor
        ["retailers-layer", "kingpins-layer"].forEach((layer) => {
          map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
        });
      } catch (e) {
        console.error("GeoJSON Load Error:", e);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded]);

  // ========================================
  // 🔄 Filtering Logic
  // ========================================
  useEffect(() => {
    if (!mapRef.current || !geoDataRef.current) return;
    const map = mapRef.current;
    const source = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!source) return;

    const data = geoDataRef.current;
    const filtered = data.features.filter((f: any) => {
      const p = f.properties || {};
      const category = p.DisplayCategory;
      const retailer = p.Retailer || "";
      const state = p.State || "";
      const suppliers = parseSuppliers(p.Suppliers || p.Supplier || p["Supplier(s)"]).map(norm);

      if (category === "Kingpin") return true;
      if (selectedStates.length > 0 && !selectedStates.includes(state)) return false;
      if (selectedRetailers.length > 0 && !selectedRetailers.includes(retailer)) return false;
      if (
        selectedSuppliers.length > 0 &&
        !selectedSuppliers.some((s) => suppliers.includes(norm(s)))
      )
        return false;
      if (selectedCategories.length > 0 && !selectedCategories.includes(category)) return false;
      return true;
    });

    source.setData({ type: "FeatureCollection", features: filtered });
  }, [selectedStates, selectedRetailers, selectedSuppliers, selectedCategories]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
