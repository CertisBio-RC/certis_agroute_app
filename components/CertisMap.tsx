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

// ✅ Normalizers
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
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function splitAndStandardizeSuppliers(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,]/)
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

// ✅ Component
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

  // ✅ Map initialization
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

        // Normalize categories
        for (const f of data.features) {
          f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
        }

        // Collect unique sets
        const stateSet = new Set<string>();
        const retailerSet = new Set<string>();
        const supplierSet = new Set<string>();

        for (const f of data.features) {
          const st = f.properties?.State;
          const r = f.properties?.Retailer;
          const rawSuppliers =
            f.properties?.Suppliers ||
            f.properties?.suppliers ||
            f.properties?.Supplier ||
            f.properties?.supplier ||
            f.properties?.["Supplier(s)"];
          if (st) stateSet.add(st);
          if (r) retailerSet.add(r);
          splitAndStandardizeSuppliers(rawSuppliers).forEach((s) => supplierSet.add(s));
        }

        onStatesLoaded?.(Array.from(stateSet).sort());
        onRetailersLoaded?.(Array.from(retailerSet).sort());
        onSuppliersLoaded?.(Array.from(supplierSet).sort());

        map.addSource("retailers", { type: "geojson", data });

        // Regular points
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

        // Kingpins (always visible)
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

        // ✅ Popups
        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          maxWidth: "none",
        });

        function buildPopupHTML(props: any, coords: [number, number]) {
          const retailer = props.Retailer || "Unknown";
          const siteName = props.Name || "";
          const category = props.DisplayCategory || "N/A";
          const suppliers =
            splitAndStandardizeSuppliers(
              props.Suppliers ||
                props.suppliers ||
                props.Supplier ||
                props.supplier ||
                props["Supplier(s)"]
            ).join(", ") || "N/A";
          const stopLabel = siteName ? `${retailer} – ${siteName}` : retailer;
          const btnId = `add-stop-${Math.random().toString(36).slice(2)}`;

          const html = `
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
              ${props.Address || ""}<br/>
              ${props.City || ""} ${props.State || ""} ${props.Zip || ""}<br/>
              <strong>Category:</strong> ${category}<br/>
              <strong>Suppliers:</strong> ${suppliers}
            </div>
          `;

          setTimeout(() => {
            const btn = document.getElementById(btnId);
            if (btn && onAddStop) {
              btn.onclick = () =>
                onAddStop({
                  label: stopLabel,
                  address: props.Address || "",
                  city: props.City || "",
                  state: props.State || "",
                  zip: props.Zip || "",
                  coords,
                });
            }
          }, 0);

          return html;
        }

        function bindPopup(layerId: string) {
          map.on("mouseenter", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const feature = e.features?.[0];
            if (!feature) return;
            const geom: any = feature.geometry;
            const coords: [number, number] = Array.isArray(geom?.coordinates)
              ? geom.coordinates
              : [0, 0];
            const props = feature.properties || {};
            if (coords && props)
              popup.setLngLat(coords).setHTML(buildPopupHTML(props, coords)).addTo(map);
          });

          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
          });
        }

        bindPopup("retailers-layer");
        bindPopup("kingpins-layer");
      } catch (err) {
        console.error("❌ Failed to load GeoJSON", err);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onAddStop]);

  // ✅ Real-time filtering
  useEffect(() => {
    if (!mapRef.current || !geoDataRef.current) return;
    const map = mapRef.current;
    const data = geoDataRef.current;
    const source = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!source) return;

    let filtered = data.features.filter((f: any) => {
      const props = f.properties || {};
      const category = props.DisplayCategory;
      const retailer = props.Retailer || "";
      const state = props.State || "";
      const supplierList = splitAndStandardizeSuppliers(
        props.Suppliers ||
          props.suppliers ||
          props.Supplier ||
          props.supplier ||
          props["Supplier(s)"]
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

    // ✅ Retailer summary
    if (onRetailerSummary) {
      const summaryMap = new Map<
        string,
        { retailer: string; count: number; suppliers: string[]; categories: string[]; states: string[] }
      >();

      for (const f of filtered) {
        const props = f.properties || {};
        if (props.DisplayCategory === "Kingpin") continue;
        const state = props.State || "Unknown";
        const retailer = props.Retailer || "Unknown";
        const suppliers = splitAndStandardizeSuppliers(
          props.Suppliers ||
            props.suppliers ||
            props.Supplier ||
            props.supplier ||
            props["Supplier(s)"]
        );
        const categories = expandCategories(props.Category || "");

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

  return <div ref={mapContainer} className="w-full h-full" />;
}
