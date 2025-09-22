"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

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
      style: "mapbox://styles/mapbox/satellite-streets-v12", // ✅ hybrid default
      center: [-93.5, 41.5],
      zoom: 5,
      projection: "mercator",
    });

    mapRef.current.on("load", () => {
      const geoPath = `${basePath}/data/retailers.geojson?cacheBust=${Date.now()}`;
      console.log("🌍 Fetching GeoJSON from:", geoPath);

      fetch(geoPath)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP error ${res.status}`);
          return res.json();
        })
        .then((data) => {
          console.log("✅ GeoJSON loaded, features:", data.features?.length || 0);

          if (!mapRef.current) return;

          if (mapRef.current.getSource("retailers")) {
            mapRef.current.removeLayer("retailer-points");
            mapRef.current.removeSource("retailers");
          }

          mapRef.current.addSource("retailers", {
            type: "geojson",
            data,
          });

          mapRef.current.addLayer({
            id: "retailer-points",
            type: "circle",
            source: "retailers",
            paint: {
              "circle-radius": 5,
              "circle-color": "#FFCC00",
              "circle-stroke-width": 1,
              "circle-stroke-color": "#000",
            },
          });
        })
        .catch((err) => {
          console.error("❌ Failed to load GeoJSON:", err);
        });
    });
  }, []);

  return <div ref={mapContainer} className="w-full h-full" />;
}
