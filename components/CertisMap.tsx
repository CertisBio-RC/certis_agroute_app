// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

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
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.5], // Midwest center
      zoom: 4,
    });

    // Load retailer markers
    const loadRetailers = async () => {
      try {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
        const response = await fetch(`${basePath}/data/retailers.geojson`);
        if (!response.ok) throw new Error(`Failed to load retailers.geojson: ${response.status}`);
        const geojson = await response.json();

        if (!mapRef.current.getSource("retailers")) {
          mapRef.current.addSource("retailers", {
            type: "geojson",
            data: geojson,
          });

          mapRef.current.addLayer({
            id: "retailer-points",
            type: "circle",
            source: "retailers",
            paint: {
              "circle-radius": 6,
              "circle-color": "#FF6600",
              "circle-stroke-width": 1,
              "circle-stroke-color": "#ffffff",
            },
          });

          // Click handler for adding stops
          mapRef.current.on("click", "retailer-points", (e) => {
            if (!e.features || e.features.length === 0) return;
            const feature = e.features[0];
            const name = feature.properties?.name || "Unknown";
            if (onAddStop) onAddStop(name);
          });

          // Tooltip on hover
          mapRef.current.on("mouseenter", "retailer-points", () => {
            mapRef.current.getCanvas().style.cursor = "pointer";
          });
          mapRef.current.on("mouseleave", "retailer-points", () => {
            mapRef.current.getCanvas().style.cursor = "";
          });
        }
      } catch (err) {
        console.error("Error loading retailers.geojson:", err);
      }
    };

    mapRef.current.on("load", () => {
      loadRetailers();
    });
  }, [onAddStop]);

  return <div ref={mapContainer} className="w-full h-[600px] rounded-xl shadow-lg" />;
}
