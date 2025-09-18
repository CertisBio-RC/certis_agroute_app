"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl, { Map, Popup } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// ✅ Centralized token
import { MAPBOX_TOKEN } from "../utils/token";

interface CertisMapProps {
  categoryColors: Record<string, string>;
  selectedCategories: string[];
  onAddStop: (stop: string) => void;
}

const CertisMap: React.FC<CertisMapProps> = ({
  categoryColors,
  selectedCategories,
  onAddStop,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<Popup | null>(null);

  const [geojson, setGeojson] = useState<any>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // ✅ Use token.ts helper
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.6091, 41.6005],
      zoom: 5,
    });

    mapRef.current = map;

    map.on("load", async () => {
      const response = await fetch("/data/retailers.geojson");
      const data = await response.json();
      setGeojson(data);

      map.addSource("retailers", {
        type: "geojson",
        data,
      });

      map.addLayer({
        id: "retailer-points",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "category"], "Kingpin"],
            9,
            6,
          ],
          "circle-color": [
            "case",
            ["==", ["get", "category"], "Kingpin"],
            "#ff0000",
            [
              "match",
              ["get", "category"],
              Object.keys(categoryColors),
              ["coalesce", ["get", "color"], "#888888"],
              "#888888",
            ],
          ],
          "circle-stroke-color": [
            "case",
            ["==", ["get", "category"], "Kingpin"],
            "#ffff00",
            "#ffffff",
          ],
          "circle-stroke-width": 2,
        },
      });
    });

    // Hover popup
    map.on("mousemove", "retailer-points", (e) => {
      map.getCanvas().style.cursor = "pointer";

      const feature = e.features?.[0];
      if (!feature) return;

      const { name, address, category, supplier, retailer } = feature.properties;

      const popupContent = `
        <div style="font-size:14px">
          <img src="/icons/${retailer}.png" alt="${retailer}" style="max-width:50px;max-height:50px" />
          <div><strong>${name}</strong></div>
          <div>${address}</div>
          <div><strong>Category:</strong> ${category}</div>
          <div><strong>Supplier:</strong> ${supplier}</div>
        </div>
      `;

      if (!popupRef.current) {
        popupRef.current = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
        });
      }

      popupRef.current
        .setLngLat((e.lngLat as any).toArray())
        .setHTML(popupContent)
        .addTo(map);
    });

    map.on("mouseleave", "retailer-points", () => {
      map.getCanvas().style.cursor = "";
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    });

    // Click → add stop
    map.on("click", "retailer-points", (e) => {
      const feature = e.features?.[0];
      if (feature) {
        onAddStop(feature.properties.name);
      }
    });

    return () => {
      map.remove();
    };
  }, [categoryColors, selectedCategories, onAddStop]);

  return <div ref={mapContainerRef} className="w-full h-full rounded-lg" />;
};

export default CertisMap;

