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
// ⚙️ HELPERS
// ========================================
const norm = (v: string) => (v || "").toString().trim().toLowerCase();

const assignDisplayCategory = (cat: string): string => {
  const c = norm(cat);
  if (c.includes("agronomy")) return "Agronomy";
  if (c.includes("grain")) return "Grain/Feed";
  if (c.includes("feed")) return "Feed";
  if (c.includes("office") || c.includes("service")) return "Office/Service";
  if (c.includes("distribution")) return "Distribution";
  if (c.includes("kingpin")) return "Kingpin";
  return "Unknown";
};

function parseSuppliers(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((s) => s.trim()).filter(Boolean);
  if (typeof value === "object")
    return Object.values(value)
      .map((s: any) => s.toString().trim())
      .filter(Boolean);
  if (typeof value === "string")
    return value
      .split(/[,;/|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

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
  selectedStates: string[];
  selectedRetailers: string[];
  selectedSuppliers: string[];
  selectedCategories: string[];
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
  selectedStates,
  selectedRetailers,
  selectedSuppliers,
  selectedCategories,
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
  // 🗺️ INITIALIZE MAP
  // ========================================
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-97, 40],
      zoom: 4.2,
      projection: "mercator",
    });

    mapRef.current = map;

    map.on("load", async () => {
      try {
        const res = await fetch(geojsonPath, { cache: "no-store" });
        if (!res.ok) throw new Error(`GeoJSON load failed: ${res.status}`);
        const data = await res.json();

        const validFeatures = (data.features || []).filter((f: any) => {
          const coords = f.geometry?.coordinates;
          return (
            Array.isArray(coords) &&
            coords.length === 2 &&
            !isNaN(coords[0]) &&
            !isNaN(coords[1])
          );
        });

        for (const f of validFeatures) {
          f.properties.DisplayCategory = assignDisplayCategory(
            f.properties?.Category || ""
          );
        }

        masterFeaturesRef.current = validFeatures;

        const states = new Set<string>();
        const retailers = new Set<string>();
        const suppliers = new Set<string>();

        validFeatures.forEach((f: any) => {
          const p = f.properties;
          if (p.State) states.add(p.State);
          if (p.Retailer) retailers.add(p.Retailer);
          parseSuppliers(p.Suppliers).forEach((s) => suppliers.add(s));
        });

        onStatesLoaded?.(Array.from(states).sort());
        onRetailersLoaded?.(Array.from(retailers).sort());
        onSuppliersLoaded?.(Array.from(suppliers).sort());

        // Retailer summary
        if (onRetailerSummary) {
          const summary: Record<
            string,
            { count: number; suppliers: Set<string>; states: Set<string> }
          > = {};
          validFeatures.forEach((f: any) => {
            const p = f.properties;
            const r = p.Retailer || "Unknown";
            const sList = parseSuppliers(p.Suppliers);
            if (!summary[r])
              summary[r] = {
                count: 0,
                suppliers: new Set(),
                states: new Set(),
              };
            summary[r].count++;
            sList.forEach((s) => summary[r].suppliers.add(s));
            if (p.State) summary[r].states.add(p.State);
          });

          onRetailerSummary(
            Object.entries(summary).map(([r, info]) => ({
              retailer: r,
              count: info.count,
              suppliers: Array.from(info.suppliers),
              states: Array.from(info.states),
            }))
          );
        }

        // Base layers
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
            "circle-stroke-width": 1.5,
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
            "circle-stroke-width": 2.5,
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
          filter: ["==", ["get", "DisplayCategory"], "Kingpin"],
        });

        // Popups
        map.on("click", ["retailers-layer", "kingpins-layer"], (e) => {
          const f = e.features?.[0];
          if (!f) return;

          const geom = f.geometry as GeoJSON.Point;
          const coords = geom?.coordinates as [number, number];
          const p = f.properties || {};

          const suppliersArr = parseSuppliers(p.Suppliers);
          const suppliers = suppliersArr.length
            ? suppliersArr.join(", ")
            : "N/A";

          const popupHTML = `
            <div style="font-size:13px;width:330px;background:#1a1a1a;color:#f5f5f5;
                        padding:6px;border-radius:4px;position:relative;">
              <strong>${p.Retailer || "Unknown"}</strong><br/>
              <em>${p.Name || ""}</em><br/>
              ${cleanAddress(p.Address || "")}<br/>
              ${p.City || ""} ${p.State || ""} ${p.Zip || ""}<br/>
              <strong>Category:</strong> ${p.DisplayCategory || "N/A"}<br/>
              <strong>Suppliers:</strong> ${suppliers}<br/>
              <button id="add-stop-btn" 
                style="margin-top:4px;padding:2px 6px;background:#166534;
                       color:#fff;border:none;border-radius:3px;
                       font-size:11px;cursor:pointer;">+ Add to Trip</button>
            </div>
          `;

          if (popupRef.current) popupRef.current.remove();

          const popup = new mapboxgl.Popup({ closeOnClick: true })
            .setLngLat(coords as LngLatLike)
            .setHTML(popupHTML)
            .addTo(map);

          popupRef.current = popup;

          setTimeout(() => {
            const btn = document.getElementById("add-stop-btn");
            if (btn && onAddStop) {
              btn.onclick = () => {
                onAddStop({
                  label: `${p.Retailer || "Unknown"} – ${p.Name || ""}`,
                  address: cleanAddress(p.Address || ""),
                  city: p.City || "",
                  state: p.State || "",
                  zip: p.Zip || "",
                  coords,
                });
                popup.remove();
              };
            }
          }, 150);
        });
      } catch (err) {
        console.error("❌ GeoJSON Load Error:", err);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onRetailerSummary, onAddStop]);

  // ========================================
  // 🔄 APPLY FILTERS
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
      const suppliers = parseSuppliers(p.Suppliers).map(norm);

      if (category === "Kingpin") return true;

      const matchState =
        selectedStates.length === 0 || selectedStates.includes(state);
      const matchRetailer =
        selectedRetailers.length === 0 || selectedRetailers.includes(retailer);
      const matchCategory =
        selectedCategories.length === 0 ||
        selectedCategories.includes(category);
      const matchSupplier =
        selectedSuppliers.length === 0 ||
        selectedSuppliers.some((s) => suppliers.includes(norm(s)));

      return matchState && matchRetailer && matchCategory && matchSupplier;
    });

    source.setData({ type: "FeatureCollection", features: filtered });

    // Recompute summary
    if (onRetailerSummary) {
      const summary: Record<
        string,
        { count: number; suppliers: Set<string>; states: Set<string> }
      > = {};
      filtered.forEach((f: any) => {
        const p = f.properties;
        const r = p.Retailer || "Unknown";
        const sList = parseSuppliers(p.Suppliers);
        if (!summary[r])
          summary[r] = {
            count: 0,
            suppliers: new Set(),
            states: new Set(),
          };
        summary[r].count++;
        sList.forEach((s) => summary[r].suppliers.add(s));
        if (p.State) summary[r].states.add(p.State);
      });

      onRetailerSummary(
        Object.entries(summary).map(([r, info]) => ({
          retailer: r,
          count: info.count,
          suppliers: Array.from(info.suppliers),
          states: Array.from(info.states),
        }))
      );
    }
  }, [
    selectedStates,
    selectedRetailers,
    selectedSuppliers,
    selectedCategories,
    onRetailerSummary,
  ]);

  return (
    <div
      ref={mapContainer}
      className="w-full h-full border-t border-gray-400 rounded-b-lg"
    />
  );
}
