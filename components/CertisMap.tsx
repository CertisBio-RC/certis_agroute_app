"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl, { Map, Popup } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN } from "../utils/token"; // ✅ updated import

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

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.6091, 41.6005],
      zoom: 5,
      accessToken: MAPBOX_TOKEN, // ✅ baked into bundle
    });

    mapRef.current = map;

    map.on("load", async () => {
      const response = await fetch("/data/retailers.geojson");
      const data = await response.json();
      setGeojson(data);

      map.addSource("retailers", { type: "geojson", data });

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

    // Popup + click logic unchanged …

    return () => {
      map.remove();
    };
  }, [categoryColors, selectedCategories, onAddStop]);

  return <div ref={mapContainerRef} className="w-full h-full rounded-lg" />;
};

export default CertisMap;
