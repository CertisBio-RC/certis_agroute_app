"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

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
      style: "mapbox://styles/mapbox/satellite-streets-v12", // ✅ Hybrid view
      center: [-93.5, 41.5],
      zoom: 5,
      projection: "mercator",
    });

    mapRef.current.on("load", () => {
      console.log("✅ Map loaded, now fetching GeoJSON…");

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

          // 🎨 Add category-based styles
          mapRef.current.addLayer({
            id: "retailer-points",
            type: "circle",
            source: "retailers",
            paint: {
              "circle-radius": [
                "case",
                ["==", ["get", "category"], "Kingpin"],
                7, // 🔴 Kingpin: larger
                5, // default size
              ],
              "circle-color": [
                "match",
                ["get", "category"],
                "Agronomy",
                "#0072B2", // blue
                "Agronomy/Grain",
                "#0072B2", // blue
                "Kingpin",
                "#D55E00", // bright red
                "Office/Service",
                "#009E73", // teal green
                "Grain",
                "#F0E442", // bright yellow
                "Grain/Feed",
                "#F0E442", // bright yellow
                "Distribution",
                "#000000", // black
                "#999999", // fallback grey
              ],
              "circle-stroke-width": [
                "case",
                ["==", ["get", "category"], "Kingpin"],
                2, // Kingpin: thick yellow border
                ["==", ["get", "category"], "Distribution"],
                2, // Distribution: white border
                1, // default
              ],
              "circle-stroke-color": [
                "case",
                ["==", ["get", "category"], "Kingpin"],
                "#FFFF00", // Kingpin border yellow
                ["==", ["get", "category"], "Distribution"],
                "#FFFFFF", // Distribution border white
                "#000000", // default black border
              ],
            },
          });
        })
        .catch((err) => {
          console.error("❌ Failed to load GeoJSON:", err);
        });
    });
  }, []);

  return <div ref={mapContainer} className="w-full h-full" />;
}
