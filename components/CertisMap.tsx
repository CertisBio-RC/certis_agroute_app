"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface CertisMapProps {
  selectedStates: string[];
  selectedCategories: string[];
  selectedRetailer: string;
  selectedSuppliers: string[];
  tripStops: string[];
  setTripStops: (stops: string[]) => void;
}

export default function CertisMap({
  selectedStates,
  selectedCategories,
  selectedRetailer,
  selectedSuppliers,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93, 42],
      zoom: 4,
      projection: { name: "mercator" },
    });

    mapRef.current.on("load", () => {
      console.log("✅ Map loaded");
      // Placeholder — layer/markers will be added here later
    });
  }, []);

  return <div ref={mapContainer} className="absolute inset-0" />;
}
