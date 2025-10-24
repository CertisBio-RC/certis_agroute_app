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
// 🧩 TYPES
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
// 🧹 HELPERS
// ========================================
const norm = (v: string) => (v || "").toString().trim().toLowerCase();

const parseSuppliers = (val: any): string[] => {
  if (!val) return [];
  if (typeof val === "string") {
    return val
      .split(/[,;/|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(val)) return val.map((s) => s.trim());
  if (typeof val === "object")
    return Object.values(val).map((s: any) => s.toString().trim());
  return [];
};

const assignDisplayCategory = (cat: string): string => {
  const c = norm(cat);
  if (c.includes("agronomy")) return "Agronomy";
  if (c.includes("grain")) return "Grain/Feed";
  if (c.includes("feed")) return "Feed";
  if (c.includes("office")) return "Office/Service";
  if (c.includes("distribution")) return "Distribution";
  if (c.includes("kingpin")) return "Kingpin";
  return "Unknown";
};

const cleanAddress = (addr: string): string =>
  addr.replace(/\(.*?\)/g, "").replace(/\bP\.?O\.?\s*Box\b.*$/i, "").trim();

// ========================================
// 🗺️ MAIN MAP COMPONENT
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
  const geojsonPath = `${basePath}/data/retailers.geojson?v=baseline`;

  // ========================================
  // 🗺️ MAP INIT
  // ========================================
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-96, 40],
      zoom: 4,
      projection: "mercator",
    });

    mapRef.current = map;

    map.on("load", async () => {
      const res = await fetch(geojsonPath, { cache: "no-store" });
      const data = await res.json();

      const valid = data.features.filter((f: any) => {
        const c = f.geometry?.coordinates;
        return Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]);
      });

      for (const f of valid) {
        f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
      }

      masterFeaturesRef.current = valid;

      // ================================
      // Load unique dropdowns
      // ================================
      const states = new Set<string>();
      const retailers = new Set<string>();
      const suppliers = new Set<string>();

      valid.forEach((f: any) => {
        const p = f.properties || {};
        if (p.State) states.add(p.State);
        if (p.Retailer) retailers.add(p.Retailer);
        parseSuppliers(p.Suppliers).forEach((s) => suppliers.add(s));
      });

      onStatesLoaded?.(Array.from(states).sort());
      onRetailersLoaded?.(Array.from(retailers).sort());
      onSuppliersLoaded?.(Array.from(suppliers).sort());

      // ================================
      // Retailer summary
      // ================================
      const summaryMap: Record<string, { suppliers: Set<string>; states: Set<string>; count: number }> = {};
      valid.forEach((f: any) => {
        const p = f.properties || {};
        const r = p.Retailer || "Unknown";
        const s = parseSuppliers(p.Suppliers);
        const st = p.State || "";
        if (!summaryMap[r]) summaryMap[r] = { suppliers: new Set(), states: new Set(), count: 0 };
        summaryMap[r].count++;
        s.forEach((x) => summaryMap[r].suppliers.add(x));
        if (st) summaryMap[r].states.add(st);
      });

      const summaries = Object.entries(summaryMap).map(([retailer, info]) => ({
        retailer,
        count: info.count,
        suppliers: Array.from(info.suppliers),
        states: Array.from(info.states),
      }));
      onRetailerSummary?.(summaries);

      // ================================
      // Add source and layers
      // ================================
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
            "#aaa",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
        filter: ["!=", ["get", "DisplayCategory"], "Kingpin"],
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
      });

      // ================================
      // Popup
      // ================================
      map.on("click", ["retailers-layer", "kingpins-layer"], (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const geom = f.geometry as GeoJSON.Point;
        const coords = geom?.coordinates as [number, number];
        const p = f.properties || {};

        const suppliersArr = parseSuppliers(p.Suppliers);
        const suppliers = suppliersArr.length > 0 ? suppliersArr.join(", ") : "N/A";
        const retailer = p.Retailer || "Unknown";
        const siteName = p.Name || "";
        const category = p.DisplayCategory || "N/A";
        const address = cleanAddress(p.Address || "");
        const btnId = `add-stop-${Math.random().toString(36).slice(2)}`;

        const html = `
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

        const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
          .setLngLat(coords as LngLatLike)
          .setHTML(html)
          .addTo(map);

        popupRef.current = popup;

        setTimeout(() => {
          const btn = document.getElementById(btnId);
          if (btn && onAddStop) {
            btn.onclick = () =>
              onAddStop({
                label: siteName ? `${retailer} – ${siteName}` : retailer,
                address,
                city: p.City || "",
                state: p.State || "",
                zip: p.Zip || "",
                coords,
              });
          }
        }, 100);
      });
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onRetailerSummary, onAddStop]);

  // ========================================
  // 🔄 FILTER HANDLER
  // ========================================
  useEffect(() => {
    if (!mapRef.current || !masterFeaturesRef.current.length) return;
    const map = mapRef.current;
    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!src) return;

    const filtered = masterFeaturesRef.current.filter((f: any) => {
      const p = f.properties || {};
      const category = p.DisplayCategory;
      const retailer = p.Retailer || "";
      const state = p.State || "";
      const supplierList = parseSuppliers(p.Suppliers).map(norm);

      if (category === "Kingpin") return true;

      const matchState = selectedStates.length === 0 || selectedStates.includes(state);
      const matchRetailer = selectedRetailers.length === 0 || selectedRetailers.includes(retailer);
      const matchCategory =
        selectedCategories.length === 0 || selectedCategories.includes(category);
      const matchSupplier =
        selectedSuppliers.length === 0 ||
        selectedSuppliers.some((s) => supplierList.includes(norm(s)));

      return matchState && matchRetailer && matchCategory && matchSupplier;
    });

    src.setData({ type: "FeatureCollection", features: filtered });

    // Retailer summary refresh
    if (onRetailerSummary) {
      const sum: Record<string, { suppliers: Set<string>; states: Set<string>; count: number }> = {};
      for (const f of filtered) {
        const p = f.properties || {};
        const r = p.Retailer || "Unknown";
        const st = p.State || "";
        const s = parseSuppliers(p.Suppliers);
        if (!sum[r]) sum[r] = { suppliers: new Set(), states: new Set(), count: 0 };
        sum[r].count++;
        s.forEach((x) => sum[r].suppliers.add(x));
        if (st) sum[r].states.add(st);
      }
      const summaries = Object.entries(sum).map(([r, i]) => ({
        retailer: r,
        count: i.count,
        suppliers: Array.from(i.suppliers),
        states: Array.from(i.states),
      }));
      onRetailerSummary(summaries);
    }
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers, onRetailerSummary]);

  return <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />;
}
