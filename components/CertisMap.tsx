"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl, { Map, Marker, Popup } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string;

type CertisMapProps = {
  categoryColors: Record<string, string>;
  selectedCategories: string[];
  onAddStop: (stop: string) => void;
};

export default function CertisMap({
  categoryColors,
  selectedCategories,
  onAddStop,
}: CertisMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const [basemap, setBasemap] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("basemap") || "streets-v12";
    }
    return "streets-v12";
  });

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: `mapbox://styles/mapbox/${basemap}`,
      center: [-93.5, 41.6],
      zoom: 5,
      projection: "mercator",
    });

    mapRef.current = map;

    map.on("load", () => {
      // Fetch GeoJSON data
      fetch("/retailers.geojson")
        .then((res) => res.json())
        .then((data) => {
          for (const feature of data.features) {
            const { geometry, properties } = feature;
            if (!geometry || geometry.type !== "Point") continue;

            const [lng, lat] = geometry.coordinates;
            const category = properties.Category;
            const name = properties.Name || "Unknown";

            const color =
              category === "Kingpin"
                ? "#FF0000"
                : categoryColors[category] || "#999";

            const outline =
              category === "Kingpin" ? "2px solid yellow" : "none";

            if (
              category === "Kingpin" ||
              selectedCategories.includes(category)
            ) {
              const el = document.createElement("div");
              el.style.width = "14px";
              el.style.height = "14px";
              el.style.borderRadius = "50%";
              el.style.backgroundColor = color;
              el.style.border = outline;

              const marker = new mapboxgl.Marker(el)
                .setLngLat([lng, lat])
                .setPopup(
                  new Popup().setHTML(
                    `<strong>${name}</strong><br/>${category}`
                  )
                )
                .addTo(map);

              el.addEventListener("click", () => {
                onAddStop(name);
              });
            }
          }
        });
    });

    return () => {
      map.remove();
    };
  }, [basemap, categoryColors, selectedCategories, onAddStop]);

  const handleBasemapChange = (style: string) => {
    setBasemap(style);
    if (typeof window !== "undefined") {
      localStorage.setItem("basemap", style);
    }
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Basemap toggle */}
      <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 shadow-md rounded-lg p-2 space-x-2">
        <button
          onClick={() => handleBasemapChange("streets-v12")}
          className={`px-3 py-1 rounded ${
            basemap === "streets-v12"
              ? "bg-blue-500 text-white"
              : "bg-gray-200 dark:bg-gray-700 dark:text-white"
          }`}
        >
          Streets
        </button>
        <button
          onClick={() => handleBasemapChange("satellite-streets-v12")}
          className={`px-3 py-1 rounded ${
            basemap === "satellite-streets-v12"
              ? "bg-blue-500 text-white"
              : "bg-gray-200 dark:bg-gray-700 dark:text-white"
          }`}
        >
          Hybrid
        </button>
      </div>
    </div>
  );
}
