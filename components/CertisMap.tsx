"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export default function CertisMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12", // Hybrid/Mercator
      center: [-93.5, 41.5], // Center US Midwest
      zoom: 4,
      projection: { name: "mercator" },
    });

    // Load retailers.geojson
    fetch("/retailers.geojson")
      .then((res) => res.json())
      .then((data) => {
        if (!mapRef.current) return;

        mapRef.current.on("load", () => {
          if (mapRef.current?.getSource("retailers")) return;

          mapRef.current.addSource("retailers", {
            type: "geojson",
            data,
          });

          mapRef.current.addLayer({
            id: "retailers-layer",
            type: "circle",
            source: "retailers",
            paint: {
              "circle-radius": 5,
              "circle-color": "#ff0000",
              "circle-stroke-width": 1,
              "circle-stroke-color": "#fff",
            },
          });

          // Auto-fit bounds to data
          const bounds = new mapboxgl.LngLatBounds();
          data.features.forEach((feature: any) => {
            bounds.extend(feature.geometry.coordinates);
          });
          mapRef.current?.fitBounds(bounds, { padding: 40 });
        });
      });
  }, []);

  return <div ref={mapContainer} className="w-full h-full" />;
}
