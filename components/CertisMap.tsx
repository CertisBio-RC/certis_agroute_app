"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

type CertisMapProps = {
  selectedCategories: string[];
};

export default function CertisMap({ selectedCategories }: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [basemap, setBasemap] = useState<string>("hybrid");

  // Restore saved basemap
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("basemap");
      if (saved) setBasemap(saved);
    }
  }, []);

  // Init map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style:
        basemap === "streets"
          ? "mapbox://styles/mapbox/streets-v12"
          : "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.5], // Midwest default center
      zoom: 4,
      projection: { name: "mercator" },
    });

    const map = mapRef.current;

    // Load data
    map.on("load", async () => {
      try {
        const res = await fetch("/retailers.geojson");
        const geojson = await res.json();

        if (!map.getSource("retailers")) {
          map.addSource("retailers", {
            type: "geojson",
            data: geojson,
          });
        }

        // Normal categories
        map.addLayer({
          id: "retailers-circle",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 6,
            "circle-color": [
              "match",
              ["get", "Category"],
              "Retailer", "#1f77b4",
              "Dealer", "#ff7f0e",
              "Distributor", "#2ca02c",
              "Supplier", "#9467bd",
              "#7f7f7f"
            ],
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1,
          },
          filter: ["all", ["!=", ["get", "Category"], "Kingpin"]],
        });

        // Kingpins special layer
        map.addLayer({
          id: "kingpins",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 8,
            "circle-color": "#ff0000",
            "circle-stroke-color": "#ffff00",
            "circle-stroke-width": 2,
          },
          filter: ["==", ["get", "Category"], "Kingpin"],
        });
      } catch (err) {
        console.error("Error loading retailers.geojson", err);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [basemap]);

  // Update filters when categories change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getLayer("retailers-circle")) {
      map.setFilter("retailers-circle", [
        "all",
        ["!=", ["get", "Category"], "Kingpin"],
        ["in", ["get", "Category"], ["literal", selectedCategories]],
      ]);
    }
  }, [selectedCategories]);

  const switchBasemap = (style: string) => {
    setBasemap(style);
    if (typeof window !== "undefined") {
      localStorage.setItem("basemap", style);
    }
    if (mapRef.current) {
      mapRef.current.setStyle(
        style === "streets"
          ? "mapbox://styles/mapbox/streets-v12"
          : "mapbox://styles/mapbox/satellite-streets-v12"
      );
    }
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full rounded-2xl" />
      <div className="absolute bottom-2 left-2 flex gap-2">
        <button
          onClick={() => switchBasemap("streets")}
          className={`px-2 py-1 rounded ${basemap === "streets" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
        >
          Streets
        </button>
        <button
          onClick={() => switchBasemap("hybrid")}
          className={`px-2 py-1 rounded ${basemap === "hybrid" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
        >
          Hybrid
        </button>
      </div>
    </div>
  );
}
