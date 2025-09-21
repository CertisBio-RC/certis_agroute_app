"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export default function CertisMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.5], // Midwest center
      zoom: 4.5,
      projection: { name: "mercator" },
    });

    mapRef.current.on("load", () => {
      mapRef.current!.addSource("retailers", {
        type: "geojson",
        data: "/data/retailers.geojson",
      });

      mapRef.current!.addLayer({
        id: "retailers-layer",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "category"], "Kingpin"],
            10,
            6,
          ],
          "circle-color": [
            "match",
            ["get", "category"],
            "Agronomy", "#1f77b4",
            "Grain", "#2ca02c",
            "Agronomy/Grain", "#9467bd",
            "Office/Service", "#ff7f0e",
            "Kingpin", "#ff0000",
            "#7f7f7f"
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "category"], "Kingpin"],
            2,
            1,
          ],
          "circle-stroke-color": [
            "case",
            ["==", ["get", "category"], "Kingpin"],
            "#ffff00",
            "#000000",
          ],
        },
      });
    });
  }, []);

  return <div ref={mapContainer} className="w-full h-full" />;
}
