"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export default function CertisMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    if (!mapRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [-93.5, 41.6], // Centered over Midwest
        zoom: 4,
        projection: { name: "mercator" },
      });

      // Load waypoints from GeoJSON
      mapRef.current.on("load", () => {
        mapRef.current!.addSource("retailers", {
          type: "geojson",
          data: "/data/retailers.geojson",
        });

        mapRef.current!.addLayer({
          id: "retailer-points",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 6,
            "circle-color": "#1E90FF",
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
          },
        });
      });
    }
  }, []);

  return <div ref={mapContainer} className="map" />;
}
