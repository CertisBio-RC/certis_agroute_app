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
      center: [-93, 41], // Midwest-centered
      zoom: 4,
      projection: { name: "mercator" },
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl());

    mapRef.current.on("load", () => {
      mapRef.current?.addSource("retailers", {
        type: "geojson",
        data: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/data/retailers.geojson?cb=${Date.now()}`,
      });

      mapRef.current?.addLayer({
        id: "retailers-layer",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 5,
          "circle-color": "#FFD700",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#000",
        },
      });
    });
  }, []);

  return <div ref={mapContainer} className="w-full h-full" />;
}
