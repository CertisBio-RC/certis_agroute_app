"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface Stop {
  name: string;
  lat: number;
  lng: number;
}

export interface CertisMapProps {
  selectedCategories: string[];
  onAddStop?: (stop: Stop) => void;
}

export default function CertisMap({ selectedCategories, onAddStop }: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.6], // Midwest default
      zoom: 4,
      projection: { name: "mercator" } // ✅ Force Mercator projection
    });

    // Example marker (debug/test)
    const marker = new mapboxgl.Marker({ color: "blue" })
      .setLngLat([-93.5, 41.6])
      .setPopup(new mapboxgl.Popup().setHTML("<h3>Certis Example Stop</h3>"))
      .addTo(mapRef.current);

    if (onAddStop) {
      marker.getElement().addEventListener("click", () => {
        onAddStop({ name: "Certis Example Stop", lat: 41.6, lng: -93.5 });
      });
    }
  }, [onAddStop]);

  return (
    <div
      ref={mapContainer}
      style={{ width: "100%", height: "100vh" }}
    />
  );
}
