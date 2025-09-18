"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "../utils/token";

// Define props so page.tsx can pass data in
interface CertisMapProps {
  categoryColors: Record<string, string>;
  selectedCategories: string[];
  onAddStop: (stop: string) => void;
}

mapboxgl.accessToken = MAPBOX_TOKEN;

export default function CertisMap({
  categoryColors,
  selectedCategories,
  onAddStop,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;
    if (mapRef.current) return; // prevent double init

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.5], // Iowa center fallback
      zoom: 5,
      accessToken: MAPBOX_TOKEN,
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Example hook-up for markers based on selectedCategories
    mapRef.current.on("load", () => {
      console.log("✅ Map loaded with categories:", selectedCategories);
      console.log("✅ Category colors:", categoryColors);

      // This is where you would normally add data layers/filters
      // Using categoryColors + selectedCategories props

      // For debug only: call onAddStop with a fake stop
      if (onAddStop) {
        onAddStop("Debug Stop - Map Loaded");
      }
    });

    return () => {
      mapRef.current?.remove();
    };
  }, [categoryColors, selectedCategories, onAddStop]);

  return (
    <div
      ref={mapContainer}
      style={{ width: "100%", height: "100vh" }}
      id="map"
    />
  );
}
