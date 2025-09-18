"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface CertisMapProps {
  categoryColors: Record<string, string>;
  selectedCategories: string[];
  onAddStop: (stop: string) => void;
}

export default function CertisMap({
  categoryColors,
  selectedCategories,
  onAddStop,
}: CertisMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    console.log("🗺️ Mapbox token at runtime:", token);

    if (!token) {
      console.error("❌ No Mapbox token found!");
      return;
    }

    if (mapRef.current) return; // prevent re-init

    mapboxgl.accessToken = token;

    try {
      const map = new mapboxgl.Map({
        container: mapContainerRef.current!,
        style: "mapbox://styles/mapbox/streets-v11",
        center: [-93.5, 42.0], // Iowa/Midwest center
        zoom: 5,
      });

      mapRef.current = map;

      map.on("load", () => {
        console.log("✅ Mapbox map loaded");
        onAddStop("Debug Stop - Map Loaded");
      });
    } catch (err) {
      console.error("⚠️ Error initializing Mapbox map:", err);
    }
  }, [onAddStop]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
}
