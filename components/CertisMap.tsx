"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

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
    if (!mapContainer.current || mapRef.current) return;

    // Initialize Mapbox map
    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-93.5, 41.5], // Midwest-centered
      zoom: 4.5,
      projection: "mercator", // Force Mercator
    });

    // Load retailers.geojson from /public
    fetch("/retailers.geojson")
      .then((res) => res.json())
      .then((data) => {
        if (!mapRef.current) return;

        mapRef.current.on("load", () => {
          if (!mapRef.current) return;

          // Add GeoJSON source
          if (!mapRef.current.getSource("retailers")) {
            mapRef.current.addSource("retailers", {
              type: "geojson",
              data: data,
            });
          }

          // Add circle layer for waypoints
          if (!mapRef.current.getLayer("retailers-layer")) {
            mapRef.current.addLayer({
              id: "retailers-layer",
              type: "circle",
              source: "retailers",
              paint: {
                "circle-radius": 6,
                "circle-color": "#007cbf",
                "circle-stroke-width": 1,
                "circle-stroke-color": "#ffffff",
              },
            });
          }

          // Fit map to all points
          const bounds = new mapboxgl.LngLatBounds();
          for (const feature of data.features) {
            if (feature.geometry.type === "Point") {
              bounds.extend(feature.geometry.coordinates as [number, number]);
            }
          }
          if (!bounds.isEmpty()) {
            mapRef.current.fitBounds(bounds, { padding: 40 });
          }
        });
      })
      .catch((err) => console.error("Error loading retailers.geojson:", err));
  }, []);

  // Later: apply filters with selectedCategories & selectedSuppliers
  // For now, just ensure baseline map + points render.

  return <div ref={mapContainer} className="map" />;
}
