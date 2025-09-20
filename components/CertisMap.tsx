"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CertisMapProps {
  selectedCategories: string[];
  onAddStop?: (stop: { name: string; lat: number; lng: number }) => void;
}

export default function CertisMap({
  selectedCategories,
  onAddStop,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.6],
      zoom: 4,
    });

    mapRef.current.on("load", async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/retailers.geojson`
        );
        const geojson = await response.json();

        if (!mapRef.current?.getSource("retailers")) {
          mapRef.current?.addSource("retailers", {
            type: "geojson",
            data: geojson,
          });

          // Add Kingpin layer (red circles with yellow outline)
          mapRef.current?.addLayer({
            id: "kingpin-points",
            type: "circle",
            source: "retailers",
            filter: ["==", "category", "Kingpin"],
            paint: {
              "circle-radius": 6,
              "circle-color": "#ff0000",
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffff00",
            },
          });

          // Add general retailer/distributor points
          mapRef.current?.addLayer({
            id: "retailer-points",
            type: "circle",
            source: "retailers",
            filter: ["!=", "category", "Kingpin"],
            paint: {
              "circle-radius": 5,
              "circle-color": "#ff7f0e",
            },
          });

          // Click handler
          mapRef.current?.on("click", "retailer-points", (e) => {
            const feature = e.features?.[0];
            if (!feature) return;

            const coords = feature.geometry as GeoJSON.Point;
            const [lng, lat] = coords.coordinates;
            const name = feature.properties?.name || "Unknown";

            onAddStop?.({ name, lat, lng });
          });

          mapRef.current?.on("click", "kingpin-points", (e) => {
            const feature = e.features?.[0];
            if (!feature) return;

            const coords = feature.geometry as GeoJSON.Point;
            const [lng, lat] = coords.coordinates;
            const name = feature.properties?.name || "Unknown (Kingpin)";

            onAddStop?.({ name, lat, lng });
          });
        }
      } catch (err) {
        console.error("Failed to load retailers.geojson", err);
      }
    });
  }, [onAddStop]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
