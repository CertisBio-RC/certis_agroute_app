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

// ✅ Known category colors
const categoryColors: Record<string, { color: string; outline: string }> = {
  Dealer: { color: "#1f77b4", outline: "#0d3d66" },
  Retailer: { color: "#ff7f0e", outline: "#a64e00" },
  Supplier: { color: "#2ca02c", outline: "#145214" },
  Warehouse: { color: "#d62728", outline: "#7f1d1d" },
  Other: { color: "#9467bd", outline: "#4a2a7f" },
  Kingpin: { color: "#ff0000", outline: "#ffff00" }, // reserved styling
};

// 🎨 Rainbow fallback for unknown categories
const rainbowPalette = [
  "#1f77b4", // blue
  "#ff7f0e", // orange
  "#2ca02c", // green
  "#d62728", // red
  "#9467bd", // purple
  "#8c564b", // brown
  "#e377c2", // pink
  "#7f7f7f", // gray
  "#bcbd22", // olive
  "#17becf", // cyan
];

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
      projection: { name: "mercator" },
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

        // Collect unique states + categories
        const states = new Set<string>();
        const categories = new Set<string>();
        geojson.features.forEach((f: any) => {
          if (f.properties?.State) states.add(f.properties.State);
          if (f.properties?.Category) categories.add(f.properties.Category);
        });
        availableStates = Array.from(states).sort();
        console.log("📍 Available states:", availableStates);
        console.log("🎨 Unique categories found in GeoJSON:", Array.from(categories));

        // Assign fallback rainbow colors to unknown categories
        const unknownCategories = Array.from(categories).filter(
          (c) => !Object.keys(categoryColors).includes(c)
        );
        console.log("🌈 Assigning fallback colors to:", unknownCategories);

        unknownCategories.forEach((cat, i) => {
          const color = rainbowPalette[i % rainbowPalette.length];
          categoryColors[cat] = { color, outline: "#000000" };
        });

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

        // Build explicit match arrays
        const colorMatch: any[] = ["match", ["get", "Category"]];
        const outlineMatch: any[] = ["match", ["get", "Category"]];
        for (const [cat, style] of Object.entries(categoryColors)) {
          colorMatch.push(cat, style.color);
          outlineMatch.push(cat, style.outline);
        }
        colorMatch.push("#cccccc"); // default
        outlineMatch.push("#000000"); // default

        // Retailer points (filterable)
        mapRef.current!.addLayer({
          id: "retailer-points",
          type: "circle",
          source: "retailers",
          filter: ["all", ["!=", ["get", "Category"], "Kingpin"]],
          paint: {
            "circle-radius": 5,
            "circle-color": colorMatch,
            "circle-stroke-color": outlineMatch,
            "circle-stroke-width": 1,
          },
        });

        // Kingpins (always visible, 6px, bright red/yellow)
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
