// components/CertisMap.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ✅ Match the base path used in page.tsx
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export interface CertisMapProps {
  selectedCategories: string[];
}

export const categoryColors: Record<
  string,
  { color: string; outline?: string }
> = {
  Agronomy: { color: "#1f77b4" },
  "Agronomy/Grain": { color: "#17becf" },
  "Office/Service": { color: "#ff7f0e" },
  Grain: { color: "#ffbb78" },
  "Grain/Feed": { color: "#bcbd22" },
  Distribution: { color: "#2ca02c" },
  Feed: { color: "#9467bd" },
  Kingpin: { color: "#d62728" },
};

export default function CertisMap({ selectedCategories }: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    if (mapRef.current) return; // prevent double init

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.5], // Midwest center
      zoom: 4,
    });

    // ✅ Fetch retailers.geojson with basePath awareness
    fetch(`${basePath}/retailers.geojson`)
      .then((res) => res.json())
      .then((geojson) => {
        setData(geojson);

        if (mapRef.current && geojson.features) {
          mapRef.current.on("load", () => {
            if (!mapRef.current?.getSource("retailers")) {
              mapRef.current?.addSource("retailers", {
                type: "geojson",
                data: geojson,
              });

              mapRef.current?.addLayer({
                id: "retailers-circle",
                type: "circle",
                source: "retailers",
                paint: {
                  "circle-radius": 5,
                  "circle-color": [
                    "match",
                    ["get", "Category"],
                    ...Object.entries(categoryColors).flatMap(([cat, style]) => [
                      cat,
                      style.color,
                    ]),
                    "#ccc", // default
                  ],
                  "circle-stroke-color": "#000",
                  "circle-stroke-width": 0.5,
                },
              });
            }
          });
        }
      })
      .catch((err) =>
        console.error("❌ Error loading retailers.geojson:", err)
      );
  }, []);

  // ✅ Update visibility when categories change
  useEffect(() => {
    if (!mapRef.current || !data) return;

    const visibilityFilter = [
      "in",
      ["get", "Category"],
      ["literal", selectedCategories],
    ];

    if (mapRef.current.getLayer("retailers-circle")) {
      mapRef.current.setFilter("retailers-circle", [
        "any",
        [
          "match",
          ["get", "Category"],
          selectedCategories,
          true,
          false,
        ],
      ]);
    }
  }, [selectedCategories, data]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
