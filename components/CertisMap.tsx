"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app";

// ✅ Category color legend
export const categoryColors: Record<string, { color: string; outline?: string }> = {
  Agronomy: { color: "#FFD700", outline: "#000" },
  "Grain/Feed": { color: "#228B22", outline: "#000" },
  Feed: { color: "#8B4513", outline: "#000" },
  "Office/Service": { color: "#1E90FF", outline: "#000" },
  Distribution: { color: "#FF8C00", outline: "#000" },
  Kingpin: { color: "#FF0000", outline: "#FFFF00" },
};

const norm = (v: string) => (v || "").toString().trim().toLowerCase();

// ✅ Normalize category values
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

// ✅ Normalize supplier names
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

// ✅ Handle messy supplier columns
function splitAndStandardizeSuppliers(raw?: string, props?: Record<string, any>): string[] {
  if (raw && raw.trim() !== "") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(standardizeSupplier);
  }
  // fallback: check any key that contains "supplier"
  if (props) {
    for (const key of Object.keys(props)) {
      if (key.toLowerCase().includes("supplier")) {
        const val = props[key];
        if (typeof val === "string" && val.trim() !== "") {
          return val
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map(standardizeSupplier);
        }
      }
    }
  }
  return [];
}

// ✅ Type definitions
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

// ✅ Main map component
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

  // ✅ Initialize Map
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

        // assign clean categories
        for (const f of data.features) {
          f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
        }

        // Collect state/retailer/supplier lists
        const stateSet = new Set<string>();
        const retailerSet = new Set<string>();
        const supplierSet = new Set<string>();

        for (const f of data.features) {
          const st = f.properties?.State;
          const r = f.properties?.Retailer;
          const sRaw = f.properties?.Suppliers || "";
          if (st) stateSet.add(st);
          if (r) retailerSet.add(r);
          splitAndStandardizeSuppliers(sRaw, f.properties).forEach((s) => supplierSet.add(s));
        }

        onStatesLoaded?.(Array.from(stateSet).sort());
        onRetailersLoaded?.(Array.from(retailerSet).sort());
        onSuppliersLoaded?.(Array.from(supplierSet).sort());

        map.addSource("retailers", { type: "geojson", data });

        // Regular points (non-Kingpin)
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
            "circle-radius": 8,
            "circle-color": categoryColors.Kingpin.color,
            "circle-stroke-width": 3,
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
          filter: ["==", ["get", "DisplayCategory"], "Kingpin"],
        });

        // Popup logic
        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          maxWidth: "none",
        });

        function buildPopupHTML(props: any, coords: [number, number]) {
          const retailer = props.Retailer || "Unknown";
          const siteName = props.Name || "";
          const category = props.DisplayCategory || "N/A";
          const suppliers = splitAndStandardizeSuppliers(props.Suppliers, props).join(", ") || "N/A";
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
            const coords = (feature.geometry as any)?.coordinates as [number, number];
            const props = feature.properties;
            if (coords && props) popup.setLngLat(coords).setHTML(buildPopupHTML(props, coords)).addTo(map);
          });
          });

          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
          });
        }

        bindPopup("retailers-layer");
        bindPopup("kingpins-layer");
      } catch (err) {
        console.error("Map load error:", err);
      }
    });

    return () => map.remove();
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onAddStop]);

  // ✅ Filtering + Rendering
  useEffect(() => {
    const map = mapRef.current;
    const geoData = geoDataRef.current;
    if (!map || !geoData) return;

    const baseFeatures = geoData.features;

    // Keep Kingpins always
    const kingpins = baseFeatures.filter(
      (f: any) => f.properties?.DisplayCategory === "Kingpin"
    );

    // Filter by state
    let filtered = baseFeatures.filter(
      (f: any) =>
        !f.properties?.DisplayCategory ||
        f.properties?.DisplayCategory !== "Kingpin"
    );

    if (selectedStates.length > 0) {
      filtered = filtered.filter((f: any) =>
        selectedStates.includes(f.properties?.State)
      );
    }

    // Build retailer list based on selected state(s)
    const filteredRetailers = Array.from(
      new Set(filtered.map((f: any) => f.properties?.Retailer))
    ).sort();

    onRetailersLoaded?.(filteredRetailers);

    // Show only when user checks retailers
    if (selectedRetailers.length > 0) {
      filtered = filtered.filter((f: any) =>
        selectedRetailers.includes(f.properties?.Retailer)
      );
    } else {
      filtered = [];
    }

    // Category filter (Agronomy default)
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((f: any) => {
        const cat = assignDisplayCategory(f.properties?.Category || "");
        return selectedCategories.includes(cat);
      });
    } else {
      filtered = filtered.filter(
        (f: any) => assignDisplayCategory(f.properties?.Category || "") === "Agronomy"
      );
    }

    // Supplier filter
    if (selectedSuppliers.length > 0) {
      filtered = filtered.filter((f: any) => {
        const suppliers = splitAndStandardizeSuppliers(f.properties?.Suppliers, f.properties);
        return suppliers.some((s) => selectedSuppliers.includes(s));
      });
    }

    // Combine visible data
    const combined = {
      ...geoData,
      features: [...kingpins, ...filtered],
    };

    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (src) src.setData(combined);
  }, [
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers,
    onRetailersLoaded,
  ]);

  // ✅ Draw trip stops
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getLayer("trip-line")) {
      map.removeLayer("trip-line");
    }
    if (map.getSource("trip-line")) {
      map.removeSource("trip-line");
    }
    if (map.getLayer("trip-points")) {
      map.removeLayer("trip-points");
    }
    if (map.getSource("trip-points")) {
      map.removeSource("trip-points");
    }

    if (tripStops.length === 0) return;

    const coords = tripStops.map((s) => s.coords);
    const lineGeo: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: {},
        },
      ],
    };

    const pointsGeo: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: tripStops.map((s, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: s.coords },
        properties: { label: s.label, index: i + 1 },
      })),
    };

    map.addSource("trip-line", { type: "geojson", data: lineGeo });
    map.addLayer({
      id: "trip-line",
      type: "line",
      source: "trip-line",
      paint: {
        "line-color": "#00FFFF",
        "line-width": 3,
      },
    });

    map.addSource("trip-points", { type: "geojson", data: pointsGeo });
    map.addLayer({
      id: "trip-points",
      type: "symbol",
      source: "trip-points",
      layout: {
        "icon-image": "marker-15",
        "icon-size": 1.2,
        "text-field": ["get", "index"],
        "text-size": 14,
        "text-offset": [0, 1.2],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#00FFFF",
      },
    });
  }, [tripStops]);

  return (
    <div
      ref={mapContainer}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
      }}
    />
  );
}
