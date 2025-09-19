"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "../utils/token";

mapboxgl.accessToken = MAPBOX_TOKEN;

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

  // Default to hybrid/satellite view
  const [mapStyle, setMapStyle] = useState(
    "mapbox://styles/mapbox/satellite-streets-v12"
  );

  // Restore saved basemap from localStorage (only in browser)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedStyle = localStorage.getItem("mapStyle");
      if (savedStyle) {
        setMapStyle(savedStyle);
      }
    }
  }, []);

  // Save to localStorage whenever style changes (only in browser)
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("mapStyle", mapStyle);
    }
  }, [mapStyle]);

  // Initialize Mapbox map
  useEffect(() => {
    if (mapRef.current) return; // prevent double init

    if (mapContainerRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: mapStyle,
        center: [-93.5, 41.5], // Midwest center
        zoom: 5,
      });

      mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

      mapRef.current.on("click", (e) => {
        const coords = `${e.lngLat.lng.toFixed(4)}, ${e.lngLat.lat.toFixed(4)}`;
        onAddStop(coords);
      });
    }
  }, []);

  // Update style dynamically
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setStyle(mapStyle);
    }
  }, [mapStyle]);

  return (
    <div className="flex flex-col h-full">
      {/* Map container */}
      <div ref={mapContainerRef} className="flex-1 h-[600px] rounded-lg shadow" />

      {/* Basemap selector styled like sidebar controls */}
      <div className="mt-2 flex space-x-2">
        <button
          onClick={() => setMapStyle("mapbox://styles/mapbox/streets-v12")}
          className={`px-3 py-1 rounded ${
            mapStyle.includes("streets") && !mapStyle.includes("satellite")
              ? "bg-blue-600 text-white"
              : "bg-gray-200 dark:bg-gray-700"
          }`}
        >
          Streets
        </button>
        <button
          onClick={() =>
            setMapStyle("mapbox://styles/mapbox/satellite-streets-v12")
          }
          className={`px-3 py-1 rounded ${
            mapStyle.includes("satellite")
              ? "bg-blue-600 text-white"
              : "bg-gray-200 dark:bg-gray-700"
          }`}
        >
          Hybrid
        </button>
        <button
          onClick={() => setMapStyle("mapbox://styles/mapbox/light-v11")}
          className={`px-3 py-1 rounded ${
            mapStyle.includes("light")
              ? "bg-blue-600 text-white"
              : "bg-gray-200 dark:bg-gray-700"
          }`}
        >
          Light
        </button>
        <button
          onClick={() => setMapStyle("mapbox://styles/mapbox/dark-v11")}
          className={`px-3 py-1 rounded ${
            mapStyle.includes("dark")
              ? "bg-blue-600 text-white"
              : "bg-gray-200 dark:bg-gray-700"
          }`}
        >
          Dark
        </button>
      </div>
    </div>
  );
}
