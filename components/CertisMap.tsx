"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

type CertisMapProps = {
  categoryColors: Record<string, string>;
  selectedCategories: string[];
  onAddStop: (stop: string) => void;
};

const CertisMap: React.FC<CertisMapProps> = ({
  categoryColors,
  selectedCategories,
  onAddStop,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [basemap, setBasemap] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("basemapStyle") || "satellite-streets-v12";
    }
    return "satellite-streets-v12";
  });

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: `mapbox://styles/mapbox/${basemap}`,
      center: [-96.5, 40.5],
      zoom: 4,
    });

    mapRef.current = map;

    map.on("load", () => {
      console.log("Map loaded");

      // Load retailers.geojson
      map.addSource("retailers", {
        type: "geojson",
        data: "/retailers.geojson",
      });

      // Default circle layer for all non-Kingpin categories
      map.addLayer({
        id: "retailers-layer",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 6,
          "circle-stroke-width": 1,
          "circle-color": [
            "match",
            ["get", "Category"],
            ...Object.entries(categoryColors).flat(),
            "#888",
          ],
          "circle-stroke-color": "#000",
        },
        filter: ["!=", ["get", "Category"], "Kingpin"], // exclude Kingpins
      });

      // Kingpin special layer (bright red fill + yellow outline)
      map.addLayer({
        id: "kingpin-layer",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 8,
          "circle-color": "#FF0000",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#FFFF00",
        },
        filter: ["==", ["get", "Category"], "Kingpin"], // only Kingpins
      });

      // Add interactivity
      map.on("click", "retailers-layer", (e) => {
        if (e.features && e.features[0]) {
          const props = e.features[0].properties as any;
          onAddStop(props.Name || "Unknown");
        }
      });

      map.on("click", "kingpin-layer", (e) => {
        if (e.features && e.features[0]) {
          const props = e.features[0].properties as any;
          onAddStop(props.Name || "Unknown Kingpin");
        }
      });
    });

    return () => {
      map.remove();
    };
  }, [basemap, categoryColors, onAddStop]);

  // Update filter when selectedCategories changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const filter =
      selectedCategories.length > 0
        ? ["all", ["!=", ["get", "Category"], "Kingpin"], ["in", ["get", "Category"], ["literal", selectedCategories]]]
        : ["!=", ["get", "Category"], "Kingpin"]; // hide all non-Kingpin if no categories selected

    if (map.getLayer("retailers-layer")) {
      map.setFilter("retailers-layer", filter);
    }
  }, [selectedCategories]);

  // Persist basemap choice
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("basemapStyle", basemap);
    }
  }, [basemap]);

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-2 right-2 z-10 space-x-2 bg-white/80 dark:bg-black/60 p-2 rounded-lg shadow">
        <button
          className="px-2 py-1 rounded bg-blue-600 text-white text-xs"
          onClick={() => setBasemap("streets-v12")}
        >
          Streets
        </button>
        <button
          className="px-2 py-1 rounded bg-green-600 text-white text-xs"
          onClick={() => setBasemap("outdoors-v12")}
        >
          Outdoors
        </button>
        <button
          className="px-2 py-1 rounded bg-purple-600 text-white text-xs"
          onClick={() => setBasemap("light-v11")}
        >
          Light
        </button>
        <button
          className="px-2 py-1 rounded bg-gray-800 text-white text-xs"
          onClick={() => setBasemap("dark-v11")}
        >
          Dark
        </button>
        <button
          className="px-2 py-1 rounded bg-yellow-600 text-white text-xs"
          onClick={() => setBasemap("satellite-streets-v12")}
        >
          Hybrid
        </button>
      </div>
      <div ref={mapContainerRef} className="w-full h-full rounded-xl" />
    </div>
  );
};

export default CertisMap;
