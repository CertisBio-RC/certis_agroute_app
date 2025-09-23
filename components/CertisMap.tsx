"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// 🎨 Category color palette (color-blind safe)
export const categoryColors: Record<string, string> = {
  Agronomy: "#1f77b4", // blue
  "Agronomy/Grain": "#1f77b4", // blue
  Kingpin: "#ff0000", // red (special formatting below)
  "Office/Service": "#20b2aa", // teal green
  Grain: "#ffd700", // bright yellow
  "Grain/Feed": "#ffd700", // bright yellow
  Distribution: "#000000", // black
};

export interface CertisMapProps {
  selectedCategories: string[];
  onAddStop?: (stop: string) => void;
}

export default function CertisMap({ selectedCategories, onAddStop }: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12", // ✅ hybrid
      center: [-93.5, 41.5],
      zoom: 5,
      projection: "mercator",
    });

    mapRef.current.on("load", () => {
      fetch(`${basePath}/data/retailers.geojson?cacheBust=${Date.now()}`)
        .then((res) => res.json())
        .then((data) => {
          if (!mapRef.current) return;

          if (mapRef.current.getSource("retailers")) {
            mapRef.current.removeLayer("retailer-points");
            mapRef.current.removeSource("retailers");
          }

          mapRef.current.addSource("retailers", {
            type: "geojson",
            data,
          });

          // 🖌 Circle style with category-based colors
          mapRef.current.addLayer({
            id: "retailer-points",
            type: "circle",
            source: "retailers",
            paint: {
              "circle-radius": [
                "case",
                ["==", ["get", "category"], "Kingpin"], 7, // larger size
                5,
              ],
              "circle-color": [
                "case",
                ["==", ["get", "category"], "Kingpin"], "#ff0000", // bright red
                ["==", ["get", "category"], "Agronomy"], categoryColors["Agronomy"],
                ["==", ["get", "category"], "Agronomy/Grain"], categoryColors["Agronomy/Grain"],
                ["==", ["get", "category"], "Office/Service"], categoryColors["Office/Service"],
                ["==", ["get", "category"], "Grain"], categoryColors["Grain"],
                ["==", ["get", "category"], "Grain/Feed"], categoryColors["Grain/Feed"],
                ["==", ["get", "category"], "Distribution"], categoryColors["Distribution"],
                "#aaaaaa", // fallback gray
              ],
              "circle-stroke-width": [
                "case",
                ["==", ["get", "category"], "Kingpin"], 2,
                ["==", ["get", "category"], "Distribution"], 2,
                1,
              ],
              "circle-stroke-color": [
                "case",
                ["==", ["get", "category"], "Kingpin"], "#ffff00", // yellow border
                ["==", ["get", "category"], "Distribution"], "#ffffff", // white border
                "#000000", // default black border
              ],
            },
          });
        })
        .catch((err) => console.error("❌ Failed to load GeoJSON:", err));
    });
  }, []);

  return <div ref={mapContainer} className="w-full h-full" />;
}
