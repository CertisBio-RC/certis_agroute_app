// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map, Popup, GeoJSONSource } from "mapbox-gl";

type CertisMapProps = {
  categoryColors: Record<string, string>;
  selectedCategories: string[];
  onAddStop: (stop: string) => void;
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

    // Load token dynamically
    fetch("/certis_agroute_app/data/token.txt")
      .then((res) => res.text())
      .then((token) => {
        mapboxgl.accessToken = token.trim();

        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: [-93.5, 41.5],
          zoom: 5,
          projection: { name: "mercator" },
        });

        mapRef.current = map;

        map.on("load", async () => {
          try {
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
                "circle-color": "#87CEFA",
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
              paint: { "text-color": "#000000" },
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
                  "#A9A9A9",
                ],
                "circle-radius": 6,
                "circle-stroke-width": 1,
                "circle-stroke-color": "#ffffff",
              },
            });

            const popup = new Popup({ closeButton: true, closeOnClick: true });

            // Popup + click-to-add-stop
            map.on("click", "unclustered-point", (e) => {
              const features = map.queryRenderedFeatures(e.point, {
                layers: ["unclustered-point"],
              });
              if (!features.length) return;

              const f = features[0];
              const props = f.properties || {};
              const name = props.name || "Unknown";
              const address = props.address || "";
              const category = props.category || "";
              const supplier = props.supplier || "";
              const logo = props.logo || "";

              const logoHTML = logo
                ? `<img src="/certis_agroute_app/icons/${logo}" alt="${name}" style="width:40px;height:40px;margin-bottom:6px;" />`
                : "";

              popup
                .setLngLat((f.geometry as any).coordinates)
                .setHTML(`
                  <div style="font-family:sans-serif;max-width:220px;">
                    ${logoHTML}
                    <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">${name}</div>
                    ${address ? `<div>${address}</div>` : ""}
                    ${category ? `<div><strong>Category:</strong> ${category}</div>` : ""}
                    ${supplier ? `<div><strong>Supplier:</strong> ${supplier}</div>` : ""}
                  </div>
                `)
                .addTo(map);

              onAddStop(name);
            });

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
