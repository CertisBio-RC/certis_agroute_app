"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

// Mapbox token from env
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CertisMapProps {
  selectedCategories: string[];
  selectedSuppliers: string[];
}

export default function CertisMap({
  selectedCategories,
  selectedSuppliers,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return; // Prevent re-init

    // Initialize map
    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-93.5, 41.5], // Midwest-ish default
      zoom: 4,
      projection: "mercator", // ✅ Always Mercator
    });

    // Add zoom + rotation controls
    mapRef.current.addControl(new mapboxgl.NavigationControl());

    // Load retailer data
    mapRef.current.on("load", async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/retailers.geojson`
        );
        const data = await response.json();

        // Add source
        if (!mapRef.current?.getSource("retailers")) {
          mapRef.current?.addSource("retailers", {
            type: "geojson",
            data,
          });
        }

        // Add layer for points
        if (!mapRef.current?.getLayer("retailer-points")) {
          mapRef.current?.addLayer({
            id: "retailer-points",
            type: "circle",
            source: "retailers",
            paint: {
              "circle-radius": 6,
              "circle-stroke-width": 1.5,
              "circle-color": [
                "match",
                ["get", "category"],
                "Agronomy",
                "#1f77b4",
                "Grain",
                "#2ca02c",
                "Agronomy/Grain",
                "#ff7f0e",
                "Office/Service",
                "#9467bd",
                "Kingpin",
                "#ff0000",
                "#7f7f7f", // default
              ],
              "circle-stroke-color": [
                "case",
                ["==", ["get", "category"], "Kingpin"],
                "#ffff00", // Yellow border for Kingpin
                "#ffffff",
              ],
              "circle-radius": [
                "case",
                ["==", ["get", "category"], "Kingpin"],
                8,
                6,
              ],
            },
          });
        }
      } catch (err) {
        console.error("Failed to load retailers.geojson", err);
      }
    });
  }, []);

  return <div ref={mapContainer} className="map-container" />;
}
