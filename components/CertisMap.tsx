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
      center: [-93.5, 41.6], // Default: Midwest center
      zoom: 5,
    });

    // Example: add stop on map click
    mapRef.current.on("click", (e) => {
      const stopName = `Stop @ ${e.lngLat.lat.toFixed(3)}, ${e.lngLat.lng.toFixed(3)}`;
      if (onAddStop) onAddStop(stopName);
    });
  }, [onAddStop]);

  useEffect(() => {
    if (!mapRef.current) return;

    // Placeholder: filter markers by category
    console.log("Selected categories updated:", selectedCategories);
  }, [selectedCategories]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
