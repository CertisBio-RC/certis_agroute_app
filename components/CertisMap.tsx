"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface CertisMapProps {
  categoryColors: Record<string, string>;
  selectedCategories: string[];
}

export default function CertisMap({
  categoryColors,
  selectedCategories,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [basemap, setBasemap] = useState<string>("satellite-streets-v12");

  // Load basemap preference
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("basemap");
      if (saved) setBasemap(saved);
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: `mapbox://styles/mapbox/${basemap}`,
      center: [-93.5, 41.9], // Midwest center
      zoom: 5,
      projection: "mercator",
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl());

    mapRef.current.on("load", () => {
      if (!mapRef.current) return;

      // Load GeoJSON data
      mapRef.current.addSource("retailers", {
        type: "geojson",
        data: "/retailers.geojson",
      });

      // Category-based layer
      mapRef.current.addLayer({
        id: "retailers-layer",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "match",
            ["get", "Category"],
            ...Object.entries(categoryColors).flat(),
            "#ccc",
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
        },
        filter: ["in", ["get", "Category"], ["literal", selectedCategories]],
      });

      // Kingpin overlay (always visible)
      mapRef.current.addLayer({
        id: "kingpins-layer",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 8,
          "circle-color": "#FF0000",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#FFD700",
        },
        filter: ["==", ["get", "Category"], "Kingpin"],
      });
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [basemap, categoryColors, selectedCategories]);

  // Persist basemap
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("basemap", basemap);
    }
  }, [basemap]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
