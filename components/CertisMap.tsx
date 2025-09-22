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

  // Load retailers.geojson from public/retailers.geojson
  async function loadRetailers() {
    const res = await fetch("/retailers.geojson");
    if (!res.ok) {
      console.error("❌ Failed to load retailers.geojson");
      return null;
    }
    return res.json();
  }

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-98, 39], // continental USA
      zoom: 4,
      projection: "mercator",
    });

    mapRef.current.on("load", async () => {
      const retailers = await loadRetailers();
      if (!retailers) return;

      // Add retailer points as markers
      for (const feature of retailers.features) {
        const coords = feature.geometry.coordinates;
        const name = feature.properties?.name || "Retailer";

        const marker = new mapboxgl.Marker({ color: "#00853e" })
          .setLngLat(coords)
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(name));

        marker.addTo(mapRef.current!);
      }

      console.log("✅ Retailer markers loaded:", retailers.features.length);
    });
  }, []);

  return <div ref={mapContainer} className="w-full h-full" />;
}
