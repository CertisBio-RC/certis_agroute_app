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
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-93.5, 41.5],
      zoom: 5,
      projection: "mercator", // ✅ enforce Mercator
    });

    // Load retailers.geojson with basePath
    fetch(`${basePath}/data/retailers.geojson?cacheBust=${Date.now()}`)
      .then((res) => res.json())
      .then((data) => {
        if (mapRef.current) {
          mapRef.current.on("load", () => {
            if (mapRef.current?.getSource("retailers")) {
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
                "circle-color": "#FF6600",
                "circle-stroke-width": 1,
                "circle-stroke-color": "#fff",
              },
            });
          });
        }
      });
  }, []);

  return <div ref={mapContainer} className="w-full h-full" />;
}
