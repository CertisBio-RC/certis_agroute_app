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
      style: "mapbox://styles/mapbox/satellite-streets-v12", // ✅ hybrid default
      center: [-93.5, 41.5],
      zoom: 5,
      projection: "mercator",
    });

    mapRef.current.on("load", () => {
      console.log("✅ Map loaded, now fetching GeoJSON...");

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

          // 🎨 Category-based styling
          mapRef.current.addLayer({
            id: "retailer-points",
            type: "circle",
            source: "retailers",
            paint: {
              "circle-radius": [
                "case",
                ["==", ["get", "Category"], "Kingpin"], 7, // bigger for Kingpin
                5,
              ],
              "circle-color": [
                "match",
                ["get", "Category"],
                "Kingpin", "#FF0000",       // 🔴 red
                "Coop", "#1f77b4",         // 🟦 blue
                "Retailer", "#2ca02c",     // 🟩 green
                "Distributor", "#9467bd",  // 🟪 purple
                /* other */ "#ffffff",     // ⚪ white
              ],
              "circle-stroke-width": [
                "case",
                ["==", ["get", "Category"], "Kingpin"], 2,
                1,
              ],
              "circle-stroke-color": [
                "case",
                ["==", ["get", "Category"], "Kingpin"], "#FFFF00", // Kingpin → yellow border
                "#000000", // default → black border
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
