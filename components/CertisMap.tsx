// === PART 1 of 3 START ===
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
  Kingpin: { color: "#FF0000", outline: "#FFFF00" }, // thicker yellow outline handled later
};

// ✅ Normalize category
const normalizeCategory = (cat: string) => {
  switch ((cat || "").trim().toLowerCase()) {
    case "agronomy":
      return "agronomy";
    case "grain/feed":
    case "grainfeed":
      return "grainfeed";
    case "grain":
      return "grain";
    case "feed":
      return "feed";
    case "agronomy/grain":
      return "agronomy/grain";
    case "office/service":
    case "officeservice":
      return "officeservice";
    case "distribution":
      return "distribution";
    case "kingpin":
      return "kingpin";
    default:
      return (cat || "").trim().toLowerCase();
  }
};

// ✅ Expand combined categories
const expandCategories = (cat: string): string[] => {
  const norm = normalizeCategory(cat);
  if (norm === "agronomy/grain") return ["agronomy", "grain"];
  if (norm === "grainfeed") return ["grain", "feed"];
  return [norm];
};

// ✅ Assign display category
const assignDisplayCategory = (cat: string): string => {
  const expanded = expandCategories(cat);
  if (expanded.includes("agronomy")) return "Agronomy";
  if (expanded.includes("grain")) return "Grain/Feed";
  if (expanded.includes("feed")) return "Feed";
  if (expanded.includes("officeservice")) return "Office/Service";
  if (expanded.includes("distribution")) return "Distribution";
  if (expanded.includes("kingpin")) return "Kingpin";
  return "Unknown";
};

// ✅ Text normalization helper
const norm = (val: string) => (val || "").toString().trim().toLowerCase();

// ✅ Supplier normalization map
const SUPPLIER_NAME_MAP: Record<string, string> = {
  chs: "CHS",
  winfield: "Winfield",
  helena: "Helena",
  rosens: "Rosens",
  growmark: "Growmark",
  iap: "IAP",
  "wilbur-ellis": "Wilbur-Ellis",
};

// ✅ Supplier cleanup functions
function standardizeSupplier(raw: string): string {
  const key = (raw || "").trim().toLowerCase();
  if (SUPPLIER_NAME_MAP[key]) return SUPPLIER_NAME_MAP[key];
  return raw
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function splitAndStandardizeSuppliers(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(standardizeSupplier);
}

// ✅ Stop + Props
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

// === PART 2 of 3 START ===

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

        // Assign DisplayCategory for all features
        for (const f of data.features) {
          f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
        }

        const stateSet = new Set<string>();
        const retailerSet = new Set<string>();
        const supplierSet = new Set<string>();

        for (const f of data.features) {
          const st = f.properties?.State;
          const r = f.properties?.Retailer;
          const sRaw = f.properties?.Suppliers;
          if (st) stateSet.add(st);
          if (r) retailerSet.add(r);
          splitAndStandardizeSuppliers(sRaw).forEach((s) => supplierSet.add(s));
        }

        onStatesLoaded?.(Array.from(stateSet).sort());
        onRetailersLoaded?.(Array.from(retailerSet).sort());
        onSuppliersLoaded?.(Array.from(supplierSet).sort());

        map.addSource("retailers", { type: "geojson", data });

        // ✅ Non-Kingpin points
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

        // ✅ Kingpins (now thicker outlines + larger radius)
        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 9,
            "circle-color": categoryColors.Kingpin.color,
            "circle-stroke-width": 5, // ⬅️ heavier outline
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
          filter: ["==", ["get", "DisplayCategory"], "Kingpin"],
        });

        // ✅ Popup setup
        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          maxWidth: "none",
        });

        // Build popup HTML
        function buildPopupHTML(props: any, coords: [number, number]) {
          const retailer = props.Retailer || "Unknown";
          const siteName = props.Name || "";
          const category = props.DisplayCategory || "N/A";
          const stopLabel = siteName ? `${retailer} – ${siteName}` : retailer;
          const suppliers = splitAndStandardizeSuppliers(props.Suppliers).join(", ") || "N/A";
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
              Suppliers: ${suppliers}
            </div>
          `;

          // Handle +Add to Trip
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

        // Bind popup hover + click for both layers
        function bindPopup(layerId: string) {
          map.on("mouseenter", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const coords = (e.features?.[0].geometry as GeoJSON.Point)?.coordinates.slice() as [number, number];
            const props = e.features?.[0].properties;
            if (coords && props)
              popup.setLngLat(coords).setHTML(buildPopupHTML(props, coords)).addTo(map);
          });

          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
          });

          map.on("click", layerId, (e) => {
            const coords = (e.features?.[0].geometry as GeoJSON.Point)?.coordinates.slice() as [number, number];
            const props = e.features?.[0].properties;
            if (coords && props)
              new mapboxgl.Popup({ maxWidth: "none" })
                .setLngLat(coords)
                .setHTML(buildPopupHTML(props, coords))
                .addTo(map);
          });
        }

        bindPopup("retailers-layer");
        bindPopup("kingpins-layer");
      } catch (err) {
        console.error("❌ Failed to load GeoJSON", err);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onAddStop]);

// === PART 2 of 3 END ===
// === PART 3 of 3 START ===

  // ✅ Real-time filtering
  useEffect(() => {
    if (!mapRef.current || !geoDataRef.current) return;
    const map = mapRef.current;
    const data = geoDataRef.current;
    const source = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!source) return;

    for (const f of data.features) {
      f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
    }

    const filtered = {
      type: "FeatureCollection" as const,
      features: data.features.filter((f: any) => {
        const props = f.properties || {};
        // Kingpins always visible
        if (props.DisplayCategory === "Kingpin") return true;

        // Apply filters only when user selections exist
        const stateMatch =
          selectedStates.length === 0 ||
          selectedStates.map(norm).includes(norm(props.State));
        const retailerMatch =
          selectedRetailers.length === 0 ||
          selectedRetailers.map(norm).includes(norm(props.Retailer));
        const categoryMatch =
          selectedCategories.length === 0 ||
          selectedCategories.includes(norm(props.DisplayCategory));
        const supplierList = splitAndStandardizeSuppliers(props.Suppliers).map(norm);
        const supplierMatch =
          selectedSuppliers.length === 0 ||
          selectedSuppliers.map(norm).some((s) => supplierList.includes(s));

        return stateMatch && retailerMatch && categoryMatch && supplierMatch;
      }),
    };

    source.setData(filtered);

    // Build retailer summary for sidebar
    if (onRetailerSummary) {
      const summaryMap = new Map<
        string,
        { retailer: string; count: number; suppliers: string[]; categories: string[]; states: string[] }
      >();

      for (const f of filtered.features) {
        const props = f.properties || {};
        if (props.DisplayCategory === "Kingpin") continue;
        const state = props.State || "Unknown";
        const retailer = props.Retailer || "Unknown";
        const suppliers = splitAndStandardizeSuppliers(props.Suppliers);
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

  // ✅ Trip-route rendering
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (tripStops.length < 2) {
      ["trip-route", "trip-stops-circle", "trip-stops-label"].forEach((layer) => {
        if (map.getLayer(layer)) map.removeLayer(layer);
        if (map.getSource(layer)) map.removeSource(layer);
      });
      return;
    }

    const coordsParam = tripStops.map((s) => s.coords.join(",")).join(";");
    const url =
      tripMode === "optimize"
        ? `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordsParam}?geometries=geojson&roundtrip=false&source=first&destination=last&access_token=${mapboxgl.accessToken}`
        : `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsParam}?geometries=geojson&access_token=${mapboxgl.accessToken}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        const route =
          tripMode === "optimize" ? data.trips?.[0]?.geometry : data.routes?.[0]?.geometry;
        if (!route) return;

        if (map.getLayer("trip-route")) {
          map.removeLayer("trip-route");
          map.removeSource("trip-route");
        }

        map.addSource("trip-route", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: route, properties: {} }],
          },
        });

        map.addLayer({
          id: "trip-route",
          type: "line",
          source: "trip-route",
          paint: { "line-color": "#1E90FF", "line-width": 4 },
        });

        // Plot stop markers + numbers
        const stopsGeoJSON: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: tripStops.map((s, i) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: s.coords },
            properties: { order: i + 1, label: s.label },
          })),
        };

        if (map.getLayer("trip-stops-circle")) map.removeLayer("trip-stops-circle");
        if (map.getLayer("trip-stops-label")) map.removeLayer("trip-stops-label");
        if (map.getSource("trip-stops")) map.removeSource("trip-stops");

        map.addSource("trip-stops", { type: "geojson", data: stopsGeoJSON });

        map.addLayer({
          id: "trip-stops-circle",
          type: "circle",
          source: "trip-stops",
          paint: {
            "circle-radius": 14,
            "circle-color": "#1E90FF",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 3,
          },
        });

        map.addLayer({
          id: "trip-stops-label",
          type: "symbol",
          source: "trip-stops",
          layout: {
            "text-field": ["get", "order"],
            "text-size": 12,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-anchor": "center",
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#000000",
            "text-halo-width": 1,
          },
        });
      })
      .catch((err) => console.error("Directions/Optimization API error:", err));
  }, [tripStops, tripMode, onOptimizedRoute]);

  // ✅ Render Map Container
  return <div ref={mapContainer} className="w-full h-full" />;
}

// === END OF FILE ===
