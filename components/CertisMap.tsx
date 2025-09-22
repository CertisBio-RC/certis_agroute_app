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
      style: "mapbox://styles/mapbox/satellite-streets-v12", // satellite default
      center: [-93.5, 41.7], // US Midwest focus
      zoom: 5,
    });

    mapRef.current.on("load", async () => {
      try {
        // 🚨 Cache-busting query string to always fetch latest GeoJSON
        const resp = await fetch(
          `/certis_agroute_app/data/retailers.geojson?ts=${Date.now()}`
        );
        const data = await resp.json();

        mapRef.current!.addSource("retailers", {
          type: "geojson",
          data,
        });

        mapRef.current!.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 6,
            "circle-color": "#ffcc00",
            "circle-stroke-color": "#000",
            "circle-stroke-width": 1,
          },
        });

        // Optional: add popups on click
        mapRef.current!.on("click", "retailers-layer", (e) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const coords = feature.geometry.type === "Point" ? feature.geometry.coordinates : null;
          const props = feature.properties as { Retailer?: string; Address?: string };

          if (coords) {
            new mapboxgl.Popup()
              .setLngLat(coords as [number, number])
              .setHTML(
                `<strong>${props.Retailer || "Retailer"}</strong><br/>${
                  props.Address || "Address"
                }`
              )
              .addTo(mapRef.current!);

            if (onAddStop && props.Retailer) {
              onAddStop(props.Retailer);
            }
          }
        });
      } catch (err) {
        console.error("❌ Failed to load retailers.geojson", err);
      }
    });
  }, [selectedCategories, onAddStop]);

  return <div ref={mapContainer} className="map-container w-full h-full" />;
}
