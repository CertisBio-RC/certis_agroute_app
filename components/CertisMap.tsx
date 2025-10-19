// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app";

// ✅ Category colors
export const categoryColors: Record<string, { color: string; outline?: string }> = {
  Agronomy: { color: "#FFD700", outline: "#000" },
  "Grain/Feed": { color: "#228B22", outline: "#000" },
  Feed: { color: "#8B4513", outline: "#000" },
  "Office/Service": { color: "#1E90FF", outline: "#000" },
  Distribution: { color: "#FF8C00", outline: "#000" },
  Kingpin: { color: "#FF0000", outline: "#FFFF00" },
};

// ✅ Helpers
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

// ✅ Supplier normalization
const SUPPLIER_NAME_MAP: Record<string, string> = {
  chs: "CHS",
  winfield: "Winfield",
  helena: "Helena",
  rosens: "Rosens",
  growmark: "Growmark",
  iap: "IAP",
  "wilbur-ellis": "Wilbur-Ellis",
};

function standardizeSupplier(raw: string): string {
  const key = norm(raw);
  if (SUPPLIER_NAME_MAP[key]) return SUPPLIER_NAME_MAP[key];
  return raw
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function splitAndStandardizeSuppliers(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(standardizeSupplier);
}

// ✅ Types
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
  onRemoveStop?: (index: number) => void;
  tripStops?: Stop[];
  tripMode?: "entered" | "optimize";
  onOptimizedRoute?: (stops: Stop[]) => void;
}

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
  const geojsonPath = `${basePath}/data/retailers.geojson`;

  // ✅ Initialize map
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
        const response = await fetch(geojsonPath);
        if (!response.ok) throw new Error(`GeoJSON fetch failed: ${response.status}`);
        const data = await response.json();
        geoDataRef.current = data;

        for (const f of data.features) {
          f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
        }

        // ✅ Build unique lists
        const states = new Set<string>();
        const retailers = new Set<string>();
        const suppliers = new Set<string>();

        for (const f of data.features) {
          const st = f.properties?.State;
          const r = f.properties?.Retailer;
          const sRaw =
            f.properties?.Suppliers || f.properties?.Supplier || f.properties?.["Supplier(s)"] || "";
          if (st) states.add(st);
          if (r) retailers.add(r);
          splitAndStandardizeSuppliers(sRaw).forEach((s) => suppliers.add(s));
        }

        onStatesLoaded?.(Array.from(states).sort());
        onRetailersLoaded?.(Array.from(retailers).sort());
        onSuppliersLoaded?.(Array.from(suppliers).sort());

        map.addSource("retailers", { type: "geojson", data });

        // ✅ Regular sites
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
        });

        // ✅ Kingpins always visible
        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 9,
            "circle-color": categoryColors.Kingpin.color,
            "circle-stroke-width": 3,
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
          filter: ["==", ["get", "DisplayCategory"], "Kingpin"],
        });
        // ✅ Popup handling
        const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true });

        map.on("click", "retailers-layer", (e) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const props = feature.properties || {};
          const coords = feature.geometry?.coordinates;

          const rawSuppliers =
            props.Suppliers || props.Supplier || props["Supplier(s)"] || "";
          const suppliers = splitAndStandardizeSuppliers(rawSuppliers);

          const supplierDisplay =
            suppliers.length > 0 ? suppliers.join(", ") : "None listed";

          const popupHTML = `
            <div style="font-family:sans-serif;min-width:230px">
              <strong>${props.Retailer || "Unknown Retailer"}</strong><br/>
              <em>${props.Name || ""}</em><br/>
              ${props.Address || ""}<br/>
              ${props.City || ""}, ${props.State || ""} ${props.Zip || ""}<br/>
              <b>Category:</b> ${props.DisplayCategory}<br/>
              <b>Suppliers:</b> ${supplierDisplay}<br/>
              <button id="addStopBtn" style="
                margin-top:6px;
                padding:3px 8px;
                background-color:#065f46;
                color:#fff;
                border:none;
                border-radius:4px;
                cursor:pointer;">+ Add to Trip</button>
            </div>
          `;

          popup.setLngLat(coords).setHTML(popupHTML).addTo(map);

          // ✅ Handle Add-to-Trip
          setTimeout(() => {
            const btn = document.getElementById("addStopBtn");
            if (btn) {
              btn.onclick = () => {
                onAddStop?.({
                  label: props.Retailer || "Unknown Retailer",
                  address: `${props.Address || ""}, ${props.City || ""}, ${props.State || ""}`,
                  coords: coords,
                  city: props.City,
                  state: props.State,
                  zip: props.Zip,
                });
                popup.remove();
              };
            }
          }, 200);
        });

        map.on("mouseenter", "retailers-layer", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "retailers-layer", () => {
          map.getCanvas().style.cursor = "";
        });
      } catch (err) {
        console.error("Map load failed:", err);
      }
    });
  }, [geojsonPath, onAddStop, onRetailersLoaded, onStatesLoaded, onSuppliersLoaded]);

  // ✅ Dynamic filtering logic
  useEffect(() => {
    const map = mapRef.current;
    const data = geoDataRef.current;
    if (!map || !data) return;

    const agronomyDefault = ["Agronomy", "Agronomy Hybrid"];
    const cats =
      selectedCategories.length > 0 ? selectedCategories : agronomyDefault;

    const filteredFeatures = data.features.filter((f: any) => {
      const p = f.properties || {};
      const st = p.State || "";
      const retailer = p.Retailer || "";
      const displayCat = p.DisplayCategory || "";
      const sRaw =
        p.Suppliers || p.Supplier || p["Supplier(s)"] || "";
      const suppliers = splitAndStandardizeSuppliers(sRaw);

      // ✅ Kingpins always visible
      if (displayCat === "Kingpin") return true;

      // ✅ Filter by states
      if (selectedStates.length > 0 && !selectedStates.includes(st))
        return false;

      // ✅ Filter by retailers
      if (selectedRetailers.length > 0 && !selectedRetailers.includes(retailer))
        return false;

      // ✅ Filter by suppliers
      if (
        selectedSuppliers.length > 0 &&
        suppliers.length > 0 &&
        !suppliers.some((s) => selectedSuppliers.includes(s))
      )
        return false;

      // ✅ Filter by category
      if (cats.length > 0 && !cats.includes(displayCat)) return false;

      return true;
    });

    const filteredData = { ...data, features: filteredFeatures };
    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (src) src.setData(filteredData);
  }, [
    selectedStates,
    selectedRetailers,
    selectedSuppliers,
    selectedCategories,
  ]);

  // ✅ Trip route rendering
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const routeId = "trip-route";
    if (map.getLayer(routeId)) map.removeLayer(routeId);
    if (map.getSource(routeId)) map.removeSource(routeId);

    if (tripStops.length < 2) return;

    const routeCoords = tripStops.map((s) => s.coords);
    map.addSource(routeId, {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: { type: "LineString", coordinates: routeCoords },
      },
    });
    map.addLayer({
      id: routeId,
      type: "line",
      source: routeId,
      paint: { "line-color": "#00BFFF", "line-width": 3 },
    });
  }, [tripStops, tripMode]);

  return (
    <div
      ref={mapContainer}
      className="w-full h-full rounded-2xl border border-gray-500 shadow-md"
    />
  );
}
