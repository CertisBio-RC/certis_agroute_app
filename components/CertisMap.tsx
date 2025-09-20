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

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.6], // Midwest
      zoom: 5,
    });

    // Add zoom controls
    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Fetch retailers.geojson
    mapRef.current.on("load", async () => {
      try {
        const res = await fetch("/certis_agroute_app/retailers.geojson");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Add as a source
        mapRef.current!.addSource("retailers", {
          type: "geojson",
          data,
        });

        // Add as a circle layer
        mapRef.current!.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 6,
            "circle-color": [
              "match",
              ["get", "category"],
              "Kingpin", "red",
              "Distributor", "blue",
              "Retailer", "green",
              "gray" // fallback
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "yellow",
          },
        });

        // Popup on click
        mapRef.current!.on("click", "retailers-layer", (e) => {
          const feature = e.features?.[0];
          if (!feature) return;

          const coords = feature.geometry?.type === "Point"
            ? feature.geometry.coordinates.slice()
            : null;
          const name = feature.properties?.name || "Unknown";

          if (coords) {
            new mapboxgl.Popup()
              .setLngLat(coords as [number, number])
              .setHTML(`<strong>${name}</strong><br/>${feature.properties?.category || ""}`)
              .addTo(mapRef.current!);

            if (onAddStop) onAddStop(name);
          }
        });

        // Change cursor
        mapRef.current!.on("mouseenter", "retailers-layer", () => {
          mapRef.current!.getCanvas().style.cursor = "pointer";
        });
        mapRef.current!.on("mouseleave", "retailers-layer", () => {
          mapRef.current!.getCanvas().style.cursor = "";
        });
      } catch (err) {
        console.error("Failed to load retailers.geojson:", err);
      }
    });
  }, [onAddStop]);

  // React to filters
  useEffect(() => {
    if (!mapRef.current) return;

    if (mapRef.current.getLayer("retailers-layer")) {
      if (selectedCategories.length === 0) {
        // Show all
        mapRef.current.setFilter("retailers-layer", null);
      } else {
        // Filter by category property
        mapRef.current.setFilter("retailers-layer", [
          "in",
          ["get", "category"],
          ["literal", selectedCategories],
        ]);
      }
    }
  }, [selectedCategories]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
