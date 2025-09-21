// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Base path for GitHub Pages (set in next.config.js)
const basePath = process.env.NEXT_PUBLIC_BASEPATH || "";

export interface CertisMapProps {
  selectedCategories: string[];
  onAddStop?: (stop: string) => void;
}

export default function CertisMap({ selectedCategories, onAddStop }: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.6], // Default Midwest center
      zoom: 5,
    });
  }, []);

  // Reload markers whenever categories change
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const loadRetailers = async () => {
      try {
        const res = await fetch(`${basePath}/retailers.geojson`);
        if (!res.ok) throw new Error("Failed to load retailers.geojson");
        const data = await res.json();

        for (const feature of data.features) {
          const { coordinates } = feature.geometry;
          const { name, category } = feature.properties;

          // Only add if category is selected (or if no filters are chosen, show all)
          if (
            selectedCategories.length === 0 ||
            selectedCategories.includes(category)
          ) {
            const marker = new mapboxgl.Marker()
              .setLngLat(coordinates)
              .setPopup(new mapboxgl.Popup().setText(name))
              .addTo(mapRef.current!);

            markersRef.current.push(marker);

            if (onAddStop) {
              marker.getElement().addEventListener("click", () => {
                onAddStop(name);
              });
            }
          }
        }
      } catch (err) {
        console.error("Error loading retailers:", err);
      }
    };

    loadRetailers();
  }, [selectedCategories, onAddStop]);

  return (
    <div className="w-full h-[600px] relative">
      {/* Header overlay with logo */}
      <div className="absolute top-2 left-2 z-10 bg-white rounded shadow p-2 flex items-center space-x-2">
        <img
          src={`${basePath}/certis-logo.png`}
          alt="Certis Biologicals Logo"
          className="h-10 w-auto"
        />
        <span className="font-bold text-sm">Certis AgRoute Planner</span>
      </div>

      {/* Map container */}
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}
