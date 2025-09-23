// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CertisMapProps {
  geojsonUrl?: string; // defaults to retailers.geojson
  selectedCategories?: string[]; // from page.tsx
}

// ✅ Category color styles (shared with page.tsx)
export const categoryColors: {
  [key: string]: { color: string; outline?: string };
} = {
  Agronomy: { color: "#1f77b4" },
  "Agronomy/Grain": { color: "#17becf" },
  "Office/Service": { color: "#8c564b" },
  Grain: { color: "#ff7f0e" },
  "Grain/Feed": { color: "#bcbd22" },
  Distribution: { color: "#000000" },
  Feed: { color: "#9467bd" },
  Kingpin: { color: "#ff0000", outline: "#ffff00" }, // red with yellow outline
};

export default function CertisMap({
  geojsonUrl = "/retailers.geojson",
  selectedCategories = [],
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Initialize map once
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-94.5, 42.0], // Midwest center
      zoom: 4,
      projection: "mercator", // ✅ force Mercator
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;
  }, []);

  // Load data + apply filters
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    fetch(geojsonUrl)
      .then((res) => res.json())
      .then((data: GeoJSON.FeatureCollection) => {
        if (map.getSource("retailers")) {
          map.removeLayer("retailer-points");
          map.removeSource("retailers");
        }

        map.addSource("retailers", { type: "geojson", data });

        map.addLayer({
          id: "retailer-points",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": [
              "case",
              ["==", ["get", "category"], "Kingpin"],
              9,
              6,
            ],
            "circle-color": [
              "match",
              ["get", "category"],
              ...Object.entries(categoryColors).flatMap(([cat, style]) => [
                cat,
                style.color,
              ]),
              "#cccccc",
            ],
            "circle-stroke-color": [
              "match",
              ["get", "category"],
              ...Object.entries(categoryColors).flatMap(([cat, style]) => [
                cat,
                style.outline || "#ffffff",
              ]),
              "#ffffff",
            ],
            "circle-stroke-width": [
              "case",
              ["==", ["get", "category"], "Kingpin"],
              2,
              1,
            ],
          },
        });

        // ✅ Apply category filter (always keep Kingpins visible)
        const filters: any[] = ["any"];
        if (selectedCategories.length > 0) {
          selectedCategories.forEach((cat) => {
            filters.push(["==", ["get", "category"], cat]);
          });
        }
        filters.push(["==", ["get", "category"], "Kingpin"]);
        map.setFilter("retailer-points", filters);
      })
      .catch((err) => console.error("Error loading geojson:", err));
  }, [geojsonUrl, selectedCategories]);

  return <div ref={mapContainer} className="flex-1" />;
}
