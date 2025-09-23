// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CertisMapProps {
  selectedCategories: string[];
  selectedStates: string[];
}

// ✅ Exportable state list for sidebar filter
export let availableStates: string[] = [];

// ✅ categoryColors is INTERNAL ONLY (not exported)
const categoryColors: Record<string, { color: string; outline: string }> = {
  Dealer: { color: "#1f77b4", outline: "#0d3d66" },
  Retailer: { color: "#ff7f0e", outline: "#a64e00" },
  Supplier: { color: "#2ca02c", outline: "#145214" },
  Warehouse: { color: "#d62728", outline: "#7f1d1d" },
  Other: { color: "#9467bd", outline: "#4a2a7f" },
  Kingpin: { color: "#ff0000", outline: "#ffff00" }, // reserved styling
};

export default function CertisMap({ selectedCategories, selectedStates }: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.7],
      zoom: 4.2,
      projection: { name: "mercator" }, // ✅ keep mercator
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    mapRef.current.on("load", async () => {
      try {
        const response = await fetch(`${basePath}/retailers.geojson`);
        if (!response.ok) throw new Error(`Failed to fetch GeoJSON: ${response.status}`);
        const geojson = await response.json();

        if (!geojson || !geojson.features) {
          console.warn("⚠️ No valid features found in retailers.geojson");
          return;
        }

        // Collect unique states for export
        const states = new Set<string>();
        geojson.features.forEach((f: any) => {
          if (f.properties?.State) states.add(f.properties.State);
        });
        availableStates = Array.from(states).sort();
        console.log("📍 Available states:", availableStates);

        // Clean old sources/layers
        if (mapRef.current!.getSource("retailers")) {
          mapRef.current!.removeLayer("retailer-points");
          if (mapRef.current!.getLayer("kingpins")) {
            mapRef.current!.removeLayer("kingpins");
          }
          mapRef.current!.removeSource("retailers");
        }

        mapRef.current!.addSource("retailers", {
          type: "geojson",
          data: geojson,
        });

        // Retailer points (filterable)
        mapRef.current!.addLayer({
          id: "retailer-points",
          type: "circle",
          source: "retailers",
          filter: ["all", ["!=", ["get", "Category"], "Kingpin"]],
          paint: {
            "circle-radius": 5,
            "circle-color": [
              "match",
              ["get", "Category"],
              ...Object.entries(categoryColors).flatMap(([cat, style]) => [cat, style.color]),
              "#cccccc",
            ],
            "circle-stroke-color": [
              "match",
              ["get", "Category"],
              ...Object.entries(categoryColors).flatMap(([cat, style]) => [cat, style.outline]),
              "#000000",
            ],
            "circle-stroke-width": 1,
          },
        });

        // Kingpins (always visible, bigger, bright red/yellow)
        mapRef.current!.addLayer({
          id: "kingpins",
          type: "circle",
          source: "retailers",
          filter: ["==", ["get", "Category"], "Kingpin"],
          paint: {
            "circle-radius": 6,
            "circle-color": "#ff0000",
            "circle-stroke-color": "#ffff00",
            "circle-stroke-width": 2,
          },
        });

        // Popup for non-kingpins
        mapRef.current!.on("click", "retailer-points", (e) => {
          const coords = (e.features?.[0].geometry as any).coordinates.slice();
          const props = e.features?.[0].properties;
          if (!props) return;

          new mapboxgl.Popup()
            .setLngLat(coords)
            .setHTML(`
              <div style="font-weight:bold; margin-bottom:4px;">${props["Long Name"] || props["Name"]}</div>
              <div>${props["Address"] || ""}</div>
              <div>${props["City"] || ""}, ${props["State"] || ""} ${props["Zip"] || ""}</div>
              <div><b>Category:</b> ${props["Category"] || "N/A"}</div>
              <div><b>Suppliers:</b> ${props["Suppliers"] || "N/A"}</div>
            `)
            .addTo(mapRef.current!);
        });
      } catch (err) {
        console.error("❌ Error loading geojson:", err);
      }
    });
  }, []);

  // Apply filters dynamically
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.getLayer("retailer-points")) return;

    const categoryFilter =
      selectedCategories.length > 0
        ? ["in", ["get", "Category"], ["literal", selectedCategories]]
        : true;

    const stateFilter =
      selectedStates.length > 0
        ? ["in", ["get", "State"], ["literal", selectedStates]]
        : true;

    mapRef.current.setFilter("retailer-points", [
      "all",
      ["!=", ["get", "Category"], "Kingpin"],
      categoryFilter,
      stateFilter,
    ]);
  }, [selectedCategories, selectedStates]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
