// components/CertisMap.tsx
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

  // ✅ Load retailers.geojson from /public at runtime
  async function loadRetailers() {
    try {
      const res = await fetch("/retailers.geojson");
      if (!res.ok) throw new Error("Failed to fetch retailers.geojson");
      return res.json();
    } catch (err) {
      console.error("Error loading retailers.geojson:", err);
      return { type: "FeatureCollection", features: [] };
    }
  }

  useEffect(() => {
    if (mapRef.current) return; // prevent double init

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 42], // default center (Midwest-ish)
      zoom: 4,
      projection: "mercator", // ✅ force Mercator projection
    });

    mapRef.current.on("load", async () => {
      const data = await loadRetailers();

      if (!mapRef.current) return;

      // ✅ Add source
      mapRef.current.addSource("retailers", {
        type: "geojson",
        data,
      });

      // ✅ Add layer for points
      mapRef.current.addLayer({
        id: "retailer-points",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 6,
          "circle-color": "#007cbf",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // ✅ Fit bounds to all points
      if (data.features && data.features.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        data.features.forEach((f: any) => {
          if (f.geometry?.coordinates) {
            bounds.extend(f.geometry.coordinates as [number, number]);
          }
        });
        mapRef.current.fitBounds(bounds, { padding: 50 });
      }
    });
  }, []);

  return <div ref={mapContainer} className="w-full h-full" />;
}
