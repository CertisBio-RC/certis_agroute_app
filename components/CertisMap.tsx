"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export default function CertisMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return; // prevent reinit

    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12", // hybrid
      center: [-93.5, 41.5], // Midwest-ish
      zoom: 4,
      projection: { name: "mercator" }, // enforce mercator
    });

    mapRef.current = map;

    // Load GeoJSON waypoints
    map.on("load", async () => {
      try {
        const response = await fetch("/retailers.geojson");
        const data = await response.json();

        map.addSource("retailers", {
          type: "geojson",
          data,
        });

        map.addLayer({
          id: "retailer-points",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 6,
            "circle-color": "#2563eb", // blue markers
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });

        // Fit map to all points
        const bounds = new mapboxgl.LngLatBounds();
        data.features.forEach((f: any) =>
          bounds.extend(f.geometry.coordinates)
        );
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 50, duration: 1000 });
        }
      } catch (err) {
        console.error("Failed to load retailers.geojson", err);
      }
    });
  }, []);

  return <div ref={mapContainer} className="map-container" />;
}
