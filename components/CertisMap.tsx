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
    if (mapRef.current) return; // prevent reinitialization

    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-98.5795, 39.8283], // center on USA
      zoom: 3.5,
      projection: "mercator"
    });

    mapRef.current = map;

    map.on("load", async () => {
      try {
        // Respect basePath for GitHub Pages
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app";
        const response = await fetch(`${basePath}/retailers.geojson`);
        if (!response.ok) throw new Error(`Failed to load retailers.geojson: ${response.statusText}`);
        const geojson = await response.json();

        // Add the GeoJSON as a source
        map.addSource("retailers", {
          type: "geojson",
          data: geojson
        });

        // Add a simple circle layer
        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 6,
            "circle-color": "#007cbf",
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff"
          }
        });

      } catch (err) {
        console.error("Error loading retailers.geojson:", err);
      }
    });
  }, [selectedCategories]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
