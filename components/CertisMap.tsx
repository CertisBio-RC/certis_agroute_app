"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ========================================
// 🎨 Category Colors (color-blind safe)
// ========================================
const categoryColors: Record<string, { color: string; outline?: string; size?: number }> = {
  "Agronomy": { color: "#1f77b4" },            // Blue
  "Agronomy/Grain": { color: "#1f77b4" },      // Blue
  "Office/Service": { color: "#2ca02c" },      // Teal/green
  "Grain": { color: "#ffdd00", outline: "#000" },   // Bright yellow
  "Grain/Feed": { color: "#ffdd00", outline: "#000" }, // Bright yellow
  "Distribution": { color: "#000000", outline: "#fff" }, // Black with white border
  "Feed": { color: "#9467bd" },                 // Purple fallback
  "Kingpin": { color: "#ff0000", outline: "#ffff00", size: 10 }, // Red + yellow border
};

export interface CertisMapProps {
  selectedCategories: string[];
}

export default function CertisMap({ selectedCategories }: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    // ========================================
    // 🗺️ Init map
    // ========================================
    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-98, 40],
      zoom: 4,
    });

    mapRef.current.on("load", () => {
      console.log("✅ Map loaded");

      // ========================================
      // 📂 Load retailers GeoJSON
      // ========================================
      mapRef.current!.addSource("retailers", {
        type: "geojson",
        data: "data/retailers.geojson",
      });

      // ========================================
      // 🖌️ Add circle layer with category-based styles
      // ========================================
      mapRef.current!.addLayer({
        id: "retailer-points",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "category"], "Kingpin"], 10, // bigger Kingpin
            6,
          ],
          "circle-color": [
            "match",
            ["get", "category"],
            "Agronomy", categoryColors["Agronomy"].color,
            "Agronomy/Grain", categoryColors["Agronomy/Grain"].color,
            "Office/Service", categoryColors["Office/Service"].color,
            "Grain", categoryColors["Grain"].color,
            "Grain/Feed", categoryColors["Grain/Feed"].color,
            "Distribution", categoryColors["Distribution"].color,
            "Feed", categoryColors["Feed"].color,
            "Kingpin", categoryColors["Kingpin"].color,
            "#aaaaaa"
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "category"], "Kingpin"], 2,
            ["==", ["get", "category"], "Distribution"], 2,
            ["==", ["get", "category"], "Grain"], 1,
            ["==", ["get", "category"], "Grain/Feed"], 1,
            0
          ],
          "circle-stroke-color": [
            "match",
            ["get", "category"],
            "Kingpin", categoryColors["Kingpin"].outline || "#000",
            "Distribution", categoryColors["Distribution"].outline || "#000",
            "Grain", categoryColors["Grain"].outline || "#000",
            "Grain/Feed", categoryColors["Grain/Feed"].outline || "#000",
            "#000000"
          ]
        }
      });

      // ========================================
      // 🏷️ Tooltip
      // ========================================
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
      mapRef.current!.on("mouseenter", "retailer-points", (e) => {
        mapRef.current!.getCanvas().style.cursor = "pointer";
        if (!e.features?.length) return;

        const feature = e.features[0];
        const { name, address, category } = feature.properties as any;

        popup
          .setLngLat((feature.geometry as any).coordinates)
          .setHTML(`<strong>${name}</strong><br/>${address}<br/><em>${category}</em>`)
          .addTo(mapRef.current!);
      });

      mapRef.current!.on("mouseleave", "retailer-points", () => {
        mapRef.current!.getCanvas().style.cursor = "";
        popup.remove();
      });
    });
  }, []);

  // ========================================
  // 🎨 Apply category filter (Kingpins always visible)
  // ========================================
  useEffect(() => {
    if (!mapRef.current) return;

    if (mapRef.current.getLayer("retailer-points")) {
      let filter: mapboxgl.Expression | null;

      if (selectedCategories.length === 0) {
        // ✅ Show everything
        filter = null;
      } else {
        // ✅ Show selected categories OR always Kingpin
        filter = [
          "any",
          ["in", ["get", "category"], ["literal", selectedCategories]],
          ["==", ["get", "category"], "Kingpin"]
        ];
      }

      mapRef.current.setFilter("retailer-points", filter as any);
      console.log("🔎 Applied filter:", filter);
    }
  }, [selectedCategories]);

  return <div ref={mapContainer} className="w-full h-full rounded-lg shadow-lg" />;
}

export { categoryColors };
