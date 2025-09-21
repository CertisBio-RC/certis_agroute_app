// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CertisMapProps {
  selectedCategories: string[];
  selectedSuppliers: string[];
}

export default function CertisMap({ selectedCategories, selectedSuppliers }: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  // Utility: clear existing markers
  const clearMarkers = () => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  };

  // Utility: add markers with filters
  const addMarkers = async (map: mapboxgl.Map) => {
    clearMarkers();

    try {
      const resp = await fetch("./data/retailers.geojson");
      const data = await resp.json();

      data.features.forEach((feature: any) => {
        const { name, category, suppliers } = feature.properties;
        const [lng, lat] = feature.geometry.coordinates;

        // ✅ Apply category filter
        if (selectedCategories.length > 0 && !selectedCategories.includes(category)) {
          if (category !== "Kingpin") return; // Kingpin always visible
        }

        // ✅ Apply supplier filter
        if (selectedSuppliers.length > 0 && !selectedSuppliers.includes(suppliers)) {
          if (category !== "Kingpin") return; // Kingpin always visible
        }

        // ✅ Color by category (optimized for red/green color vision)
        let color = "#808080";
        let size = 0.6;

        switch (category) {
          case "Agronomy":
            color = "#1f77b4"; // blue
            break;
          case "Grain":
            color = "#ff7f0e"; // orange
            break;
          case "Agronomy/Grain":
            color = "#2ca02c"; // green
            break;
          case "Office/Service":
            color = "#9467bd"; // purple
            break;
          case "Kingpin":
            color = "#ff0000"; // bright red
            size = 0.8; // larger
            break;
        }

        const el = document.createElement("div");
        el.style.width = `${20 * size}px`;
        el.style.height = `${20 * size}px`;
        el.style.borderRadius = "50%";
        el.style.backgroundColor = color;
        if (category === "Kingpin") {
          el.style.border = "3px solid yellow";
        } else {
          el.style.border = "2px solid white";
        }

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([lng, lat])
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(`${name} (${category})`))
          .addTo(map);

        markersRef.current.push(marker);
      });
    } catch (err) {
      console.error("❌ Failed to load retailers.geojson", err);
    }
  };

  // Initialize map
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.6],
      zoom: 5,
      projection: "mercator", // ✅ enforce Mercator
    });

    mapRef.current = map;

    // ✅ Only add markers once style is fully loaded
    map.on("load", () => {
      console.log("✅ Map style loaded, adding markers...");
      addMarkers(map);
    });
  }, []);

  // Re-render markers when filters change
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    // ✅ Ensure style is loaded before applying markers
    if (map.isStyleLoaded()) {
      addMarkers(map);
    } else {
      map.once("load", () => addMarkers(map));
    }
  }, [selectedCategories, selectedSuppliers]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
