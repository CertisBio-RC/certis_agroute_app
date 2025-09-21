"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface CertisMapProps {
  selectedCategories: string[];
  selectedSuppliers: string[];
}

export default function CertisMap({ selectedCategories, selectedSuppliers }: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12", // Hybrid default
      projection: { name: "mercator" },
      center: [-93.5, 41.7], // Midwest default
      zoom: 4,
    });

    // Load GeoJSON waypoints
    fetch("/retailers.geojson")
      .then((res) => res.json())
      .then((data) => {
        if (!mapRef.current) return;

        mapRef.current.on("load", () => {
          if (!mapRef.current) return;

          // Add source
          if (!mapRef.current.getSource("retailers")) {
            mapRef.current.addSource("retailers", {
              type: "geojson",
              data: data,
            });
          }

          // Add circle layer
          if (!mapRef.current.getLayer("retailer-points")) {
            mapRef.current.addLayer({
              id: "retailer-points",
              type: "circle",
              source: "retailers",
              paint: {
                "circle-radius": 5,
                "circle-color": "#007cbf",
                "circle-stroke-width": 1,
                "circle-stroke-color": "#fff",
              },
            });
          }

          // Fit map to bounds
          const bounds = new mapboxgl.LngLatBounds();
          data.features.forEach((f: any) => {
            bounds.extend(f.geometry.coordinates);
          });
          if (!bounds.isEmpty()) {
            mapRef.current.fitBounds(bounds, { padding: 50 });
          }
        });
      });
  }, []);

  return <div ref={mapContainer} className="w-full h-full" />;
}
