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
      center: [-93.5, 41.5], // Midwest default
      zoom: 4,
      projection: "mercator", // ✅ enforce Mercator
    });

    const map = mapRef.current;

    // ✅ Build correct GeoJSON URL with cache-busting
    const geoUrl = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/retailers.geojson?${Date.now()}`;

    map.on("load", () => {
      map.addSource("retailers", {
        type: "geojson",
        data: geoUrl,
      });

      map.addLayer({
        id: "retailers-layer",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 5,
          "circle-color": "#FFD700", // gold markers
          "circle-stroke-width": 1,
          "circle-stroke-color": "#333",
        },
      });
    });

    return () => {
      map.remove();
    };
  }, [selectedCategories, onAddStop]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
