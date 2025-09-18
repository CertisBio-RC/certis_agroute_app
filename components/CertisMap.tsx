// components/CertisMap.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

interface CertisMapProps {
  categoryColors: Record<string, string>;
  selectedCategories: string[];
  onAddStop: (stop: string) => void;
}

const CertisMap: React.FC<CertisMapProps> = ({
  categoryColors,
  selectedCategories,
  onAddStop,
}) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Persist user’s preferred basemap in localStorage
  const [basemap, setBasemap] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("basemap") || "mapbox://styles/mapbox/satellite-streets-v12";
    }
    return "mapbox://styles/mapbox/satellite-streets-v12";
  });

  useEffect(() => {
    if (!mapContainer.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: basemap,
      center: [-93.5, 42.1], // default Midwest center
      zoom: 5,
      accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN!,
    });

    return () => {
      mapRef.current?.remove();
    };
  }, [basemap]);

  // Handle category updates (placeholder for now)
  useEffect(() => {
    if (!mapRef.current) return;
    console.log("Selected categories:", selectedCategories);
    console.log("Category colors:", categoryColors);
  }, [selectedCategories, categoryColors]);

  return (
    <div className="h-full w-full">
      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
};

export default CertisMap;
