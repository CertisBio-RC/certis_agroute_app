// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ✅ Exported category colors for legend in page.tsx
export const categoryColors: Record<
  string,
  { color: string; outline?: string }
> = {
  Agronomy: { color: "#FFD700", outline: "#000" }, // yellow
  "Grain/Feed": { color: "#228B22", outline: "#000" }, // green
  "Office/Service": { color: "#1E90FF", outline: "#000" }, // blue
  Kingpin: { color: "#FF0000", outline: "#FFFF00" }, // red w/ yellow border
};

export interface CertisMapProps {
  selectedCategories: string[];
  selectedStates: string[];
  selectedSuppliers: string[];
  selectedRetailers: string[];
  onStatesLoaded?: (states: string[]) => void;
  onRetailersLoaded?: (retailers: string[]) => void;
  onRetailerSummary?: (
    summaries: { state: string; retailer: string; count: number }[]
  ) => void;
}

export default function CertisMap({
  selectedCategories,
  selectedStates,
  selectedSuppliers,
  selectedRetailers,
  onStatesLoaded,
  onRetailersLoaded,
  onRetailerSummary,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // ✅ Build correct path for local + GitHub Pages
  const geojsonPath =
    process.env.NEXT_PUBLIC_GEOJSON_URL ||
    `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/retailers.geojson`;

  // ========================================
  // 🌍 Initialize Map
  // ========================================
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-98.5795, 39.8283], // center on US
      zoom: 4,
      projection: "mercator", // ✅ force flat map
    });

    mapRef.current = map;

    map.on("load", async () => {
      try {
        const response = await fetch(geojsonPath);
        const data = await response.json();

        // Extract states & retailers (for sidebar)
        const stateSet = new Set<string>();
        const retailerSet = new Set<string>();

        for (const feature of data.features) {
          const state = feature.properties?.State;
          const retailer = feature.properties?.Retailer;
          if (state) stateSet.add(state as string);
          if (retailer) retailerSet.add(retailer as string);
        }

        onStatesLoaded?.(Array.from(stateSet).sort());
        onRetailersLoaded?.(Array.from(retailerSet).sort());

        // Add GeoJSON source
        map.addSource("retailers", {
          type: "geojson",
          data,
        });

        // ✅ Main retailer circles (EXCLUDES Kingpins)
        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 6,
            "circle-color": [
              "match",
              ["get", "Category"],
              "Agronomy",
              categoryColors.Agronomy.color,
              "Grain/Feed",
              categoryColors["Grain/Feed"].color,
              "Office/Service",
              categoryColors["Office/Service"].color,
              "#1d4ed8", // fallback
            ],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
          },
          filter: ["!=", ["get", "Category"], "Kingpin"], // ✅ exclude Kingpins
        });

        // ✅ Separate Kingpin layer (always visible)
        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 8,
            "circle-color": categoryColors.Kingpin.color,
            "circle-stroke-width": 2,
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
          filter: ["==", ["get", "Category"], "Kingpin"],
        });

        // ========================================
        // 🖱️ Hover + Mobile Popups
        // ========================================
        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
        });

        function buildPopupHTML(props: any) {
          return `
            <div style="font-size: 13px; background:#1a1a1a; color:#f5f5f5; padding:6px; border-radius:4px;">
              <strong>${props.Retailer || "Unknown"}</strong><br/>
              <em>${props.Name || ""}</em><br/>
              ${props.Address || ""} ${props.City || ""} ${props.State || ""} ${props.Zip || ""}<br/>
              Supplier: ${props.Suppliers || "N/A"}
            </div>
          `;
        }

        // Hover (desktop) for retailers
        map.on("mouseenter", "retailers-layer", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const geom = e.features?.[0].geometry as GeoJSON.Point;
          const coords = geom?.coordinates.slice() as [number, number];
          const props = e.features?.[0].properties;
          if (coords && props) {
            popup.setLngLat(coords).setHTML(buildPopupHTML(props)).addTo(map);
          }
        });

        map.on("mouseleave", "retailers-layer", () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });

        // Hover (desktop) for kingpins
        map.on("mouseenter", "kingpins-layer", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const geom = e.features?.[0].geometry as GeoJSON.Point;
          const coords = geom?.coordinates.slice() as [number, number];
          const props = e.features?.[0].properties;
          if (coords && props) {
            popup.setLngLat(coords).setHTML(buildPopupHTML(props)).addTo(map);
          }
        });

        map.on("mouseleave", "kingpins-layer", () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });

        // Click (mobile fallback) for retailers
        map.on("click", "retailers-layer", (e) => {
          const geom = e.features?.[0].geometry as GeoJSON.Point;
          const coords = geom?.coordinates.slice() as [number, number];
          const props = e.features?.[0].properties;
          if (coords && props) {
            new mapboxgl.Popup()
              .setLngLat(coords)
              .setHTML(buildPopupHTML(props))
              .addTo(map);
          }
        });

        // Click (mobile fallback) for kingpins
        map.on("click", "kingpins-layer", (e) => {
          const geom = e.features?.[0].geometry as GeoJSON.Point;
          const coords = geom?.coordinates.slice() as [number, number];
          const props = e.features?.[0].properties;
          if (coords && props) {
            new mapboxgl.Popup()
              .setLngLat(coords)
              .setHTML(buildPopupHTML(props))
              .addTo(map);
          }
        });
      } catch (err) {
        console.error("Failed to load GeoJSON", err);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded]);

  // ========================================
  // 🔄 Apply filters dynamically
  // ========================================
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const source = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!source) return;

    fetch(geojsonPath)
      .then((res) => res.json())
      .then((data) => {
        // ✅ Normalize strings for comparisons
        const norm = (val: string) => (val || "").toString().trim().toLowerCase();

        const filtered = {
          type: "FeatureCollection" as const,
          features: data.features.filter((f: any) => {
            const props = f.properties || {};

            // Kingpins always bypass filters
            if (props.Category === "Kingpin") return true;

            const stateMatch =
              selectedStates.length === 0 ||
              selectedStates.map(norm).includes(norm(props.State));
            const retailerMatch =
              selectedRetailers.length === 0 ||
              selectedRetailers.map(norm).includes(norm(props.Retailer));
            const categoryMatch =
              selectedCategories.length === 0 ||
              selectedCategories.map(norm).includes(norm(props.Category));
            const supplierMatch =
              selectedSuppliers.length === 0 ||
              selectedSuppliers.map(norm).includes(norm(props.Suppliers));

            return stateMatch && retailerMatch && categoryMatch && supplierMatch;
          }),
        };

        source.setData(filtered);

        // ========================================
        // 📊 Summarize locations by state + retailer
        // ========================================
        if (onRetailerSummary) {
          const summaryMap = new Map<
            string,
            { state: string; retailer: string; count: number }
          >();

          for (const f of filtered.features) {
            const state = f.properties?.State || "Unknown";
            const retailer = f.properties?.Retailer || "Unknown";
            const key = `${state}-${retailer}`;

            if (!summaryMap.has(key)) {
              summaryMap.set(key, { state, retailer, count: 0 });
            }
            summaryMap.get(key)!.count += 1;
          }

          onRetailerSummary(Array.from(summaryMap.values()));
        }
      });
  }, [
    geojsonPath,
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers,
    onRetailerSummary,
  ]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
