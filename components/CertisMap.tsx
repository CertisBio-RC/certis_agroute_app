"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// 🎨 Category colors
const categoryColors: Record<
  string,
  { color: string; stroke: string; radius: number }
> = {
  Agronomy: { color: "#1f77b4", stroke: "#ffffff", radius: 5 },
  "Agronomy/Grain": { color: "#1f77b4", stroke: "#ffffff", radius: 5 },
  Distribution: { color: "#000000", stroke: "#ffffff", radius: 5 },
  Feed: { color: "#9467bd", stroke: "#ffffff", radius: 5 },
  Grain: { color: "#ff7f0e", stroke: "#000000", radius: 5 },
  "Grain/Feed": { color: "#ff7f0e", stroke: "#000000", radius: 5 },
  "Office/Service": { color: "#17becf", stroke: "#ffffff", radius: 5 },
  Kingpin: { color: "#e31a1c", stroke: "#ffcc00", radius: 7 }, // ⭐ Special
};

export interface CertisMapProps {
  selectedCategories: string[];
}

export default function CertisMap({ selectedCategories }: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12", // ✅ hybrid
      center: [-93.5, 41.5],
      zoom: 5,
      projection: "mercator",
    });

    mapRef.current.on("load", () => {
      console.log("✅ Map loaded, now fetching GeoJSON...");

      fetch(`${basePath}/data/retailers.geojson?cacheBust=${Date.now()}`)
        .then((res) => res.json())
        .then((data) => {
          console.log(`✅ Loaded ${data.features.length} features`);

          if (!mapRef.current) return;

          // Remove old layers/sources if reloaded
          if (mapRef.current.getSource("retailers")) {
            if (mapRef.current.getLayer("retailer-points")) {
              mapRef.current.removeLayer("retailer-points");
            }
            mapRef.current.removeSource("retailers");
          }

          mapRef.current.addSource("retailers", { type: "geojson", data });

          mapRef.current.addLayer({
            id: "retailer-points",
            type: "circle",
            source: "retailers",
            paint: {
              "circle-radius": [
                "case",
                ["==", ["get", "category"], "Kingpin"],
                categoryColors["Kingpin"].radius,
                [
                  "coalesce",
                  ["get", "radius"],
                  5,
                ],
              ],
              "circle-color": [
                "match",
                ["get", "category"],
                "Agronomy",
                categoryColors["Agronomy"].color,
                "Agronomy/Grain",
                categoryColors["Agronomy/Grain"].color,
                "Distribution",
                categoryColors["Distribution"].color,
                "Feed",
                categoryColors["Feed"].color,
                "Grain",
                categoryColors["Grain"].color,
                "Grain/Feed",
                categoryColors["Grain/Feed"].color,
                "Office/Service",
                categoryColors["Office/Service"].color,
                "Kingpin",
                categoryColors["Kingpin"].color,
                "#888888", // fallback
              ],
              "circle-stroke-width": 2,
              "circle-stroke-color": [
                "match",
                ["get", "category"],
                "Kingpin",
                categoryColors["Kingpin"].stroke,
                "#000000",
              ],
            },
          });
        })
        .catch((err) => {
          console.error("❌ Failed to load GeoJSON:", err);
        });
    });
  }, []);

  // 🔄 Filter visibility by category (except Kingpins always visible)
  useEffect(() => {
    if (!mapRef.current) return;

    const filter =
      selectedCategories.length > 0
        ? ["any", ["==", ["get", "category"], "Kingpin"], ["in", ["get", "category"], ["literal", selectedCategories]]]
        : true;

    if (mapRef.current.getLayer("retailer-points")) {
      mapRef.current.setFilter("retailer-points", filter);
      console.log("🔎 Applied filter:", filter);
    }
  }, [selectedCategories]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
