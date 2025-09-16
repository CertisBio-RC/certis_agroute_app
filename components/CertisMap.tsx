// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map, Popup, GeoJSONSource } from "mapbox-gl";

type CertisMapProps = {
  categoryColors: Record<string, string>;
  selectedCategories: string[];
  onAddStop: (stop: string) => void; // fixed typing
};

export default function CertisMap({
  categoryColors,
  selectedCategories,
  onAddStop,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    // Load token dynamically from public/data/token.txt
    fetch("/certis_agroute_app/data/token.txt")
      .then((res) => res.text())
      .then((token) => {
        mapboxgl.accessToken = token.trim();

        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: [-93.5, 41.5], // Midwest-ish
          zoom: 5,
        });

        mapRef.current = map;

        map.on("load", async () => {
          try {
            // Load retailers.geojson
            const resp = await fetch(
              "/certis_agroute_app/data/retailers.geojson"
            );
            const data = await resp.json();

            map.addSource("retailers", {
              type: "geojson",
              data,
              cluster: true,
              clusterMaxZoom: 12,
              clusterRadius: 40,
            });

            // Cluster circles
            map.addLayer({
              id: "clusters",
              type: "circle",
              source: "retailers",
              filter: ["has", "point_count"],
              paint: {
                "circle-color": "#87CEFA", // light blue
                "circle-radius": [
                  "step",
                  ["get", "point_count"],
                  15,
                  20,
                  20,
                  50,
                  25,
                ],
              },
            });

            // Cluster count labels
            map.addLayer({
              id: "cluster-count",
              type: "symbol",
              source: "retailers",
              filter: ["has", "point_count"],
              layout: {
                "text-field": "{point_count_abbreviated}",
                "text-size": 12,
              },
              paint: {
                "text-color": "#000000",
              },
            });

            // Unclustered points
            map.addLayer({
              id: "unclustered-point",
              type: "circle",
              source: "retailers",
              filter: ["!", ["has", "point_count"]],
              paint: {
                "circle-color": [
                  "match",
                  ["get", "category"],
                  ...Object.entries(categoryColors).flat(),
                  "#A9A9A9", // fallback
                ],
                "circle-radius": 6,
                "circle-stroke-width": 1,
                "circle-stroke-color": "#ffffff",
              },
            });

            // Popup + click-to-add-stop
            const popup = new Popup({ closeButton: true, closeOnClick: true });

            map.on("click", "unclustered-point", (e) => {
              const features = map.queryRenderedFeatures(e.point, {
                layers: ["unclustered-point"],
              });
              if (!features.length) return;

              const f = features[0];
              const name = f.properties?.name || "Unknown";

              popup
                .setLngLat((f.geometry as any).coordinates)
                .setHTML(`<strong>${name}</strong>`)
                .addTo(map);

              // Add stop
              onAddStop(name);
            });

            // Cursor change
            map.on("mouseenter", "unclustered-point", () => {
              map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", "unclustered-point", () => {
              map.getCanvas().style.cursor = "";
            });
          } catch (err) {
            console.error("Failed to load retailers data:", err);
          }
        });
      })
      .catch((err) => console.error("Failed to load token:", err));
  }, [categoryColors, onAddStop]);

  // Filter updates
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const src = map.getSource("retailers") as GeoJSONSource | undefined;

    if (!src) return;

    // Apply filter based on selectedCategories
    if (selectedCategories.length === 0) {
      map.setFilter("unclustered-point", null);
    } else {
      map.setFilter("unclustered-point", [
        "in",
        ["get", "category"],
        ["literal", selectedCategories],
      ]);
    }
  }, [selectedCategories]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
