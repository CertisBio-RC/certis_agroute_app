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

    fetch("/certis_agroute_app/data/token.txt")
      .then((res) => res.text())
      .then((token) => {
        mapboxgl.accessToken = token.trim();

        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: [-93.5, 41.5],
          zoom: 5,
          projection: "mercator", // force Mercator
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

            map.on("click", "unclustered-point", (e) => {
              const features = map.queryRenderedFeatures(e.point, {
                layers: ["unclustered-point"],
              });
              if (!features.length) return;

              const f = features[0];
              const props = f.properties || {};
              const coords = (f.geometry as any).coordinates;

              const name = props.name || "Unknown";
              const address = props.address || "";
              const category = props.category || "";
              const supplier = props.supplier || "";
              const logo = props.logo || "";

              const html = `
                <div style="min-width:200px">
                  ${logo ? `<img src="${logo}" alt="logo" style="max-width:80px; margin-bottom:6px;" />` : ""}
                  <div><strong>${name}</strong></div>
                  ${address ? `<div>${address}</div>` : ""}
                  ${category ? `<div><em>Category:</em> ${category}</div>` : ""}
                  ${supplier ? `<div><em>Supplier:</em> ${supplier}</div>` : ""}
                </div>
              `;

              popup.setLngLat(coords).setHTML(html).addTo(map);

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
