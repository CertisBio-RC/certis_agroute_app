"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// ✅ Category → Color mapping (colorblind-friendly)
export const categoryColors: Record<string, string> = {
  Kingpin: "#E41A1C",       // red
  Retailer: "#377EB8",      // blue
  "Agronomy Location": "#4DAF4A", // green
  Coop: "#984EA3",          // purple
  Distributor: "#FF7F00",   // orange
  Other: "#A65628",         // brown
};

export interface CertisMapProps {
  selectedCategories: string[];
  onAddStop?: (stop: string) => void;
}

export default function CertisMap({ selectedCategories, onAddStop }: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    // Initialize Map
    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12", // hybrid map
      center: [-93.5, 41.5],
      zoom: 5,
      projection: "mercator",
    });

    mapRef.current.on("load", () => {
      console.log("✅ Map loaded, fetching GeoJSON...");

      fetch(`${basePath}/data/retailers.geojson?cacheBust=${Date.now()}`)
        .then((res) => res.json())
        .then((data) => {
          if (!mapRef.current) return;

          // Remove existing source/layer if they exist
          if (mapRef.current.getSource("retailers")) {
            if (mapRef.current.getLayer("retailer-points")) {
              mapRef.current.removeLayer("retailer-points");
            }
            mapRef.current.removeSource("retailers");
          }

          // Add GeoJSON source
          mapRef.current.addSource("retailers", {
            type: "geojson",
            data,
          });

          // Add circle layer with color-coded categories
          mapRef.current.addLayer({
            id: "retailer-points",
            type: "circle",
            source: "retailers",
            paint: {
              "circle-radius": 6,
              "circle-stroke-width": 1,
              "circle-stroke-color": "#000",
              "circle-color": [
                "match",
                ["get", "Category"],
                ...Object.entries(categoryColors).flat(),
                "#FFFFFF", // default (white) if no match
              ],
            },
          });

          console.log("✅ Retailer layer added.");
        })
        .catch((err) => {
          console.error("❌ Failed to load GeoJSON:", err);
        });
    });
  }, []);

  return <div ref={mapContainer} className="w-full h-full" />;
}
