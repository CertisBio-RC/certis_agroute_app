"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export interface CertisMapProps {
  selectedCategories: string[];
  onAddStop?: (stop: string) => void;
}

export const categoryColors: Record<
  string,
  { color: string; stroke: string; size: number }
> = {
  Agronomy: { color: "#1f77b4", stroke: "#ffffff", size: 5 }, // blue
  "Agronomy/Grain": { color: "#1f77b4", stroke: "#ffffff", size: 5 }, // blue
  Kingpin: { color: "#ff0000", stroke: "#ffff00", size: 7 }, // bright red, yellow border, larger
  "Office/Service": { color: "#008080", stroke: "#ffffff", size: 5 }, // teal
  Grain: { color: "#ffd700", stroke: "#000000", size: 5 }, // bright yellow
  "Grain/Feed": { color: "#ffd700", stroke: "#000000", size: 5 }, // bright yellow
  Distribution: { color: "#000000", stroke: "#ffffff", size: 5 }, // black w/ white border
};

export default function CertisMap({
  selectedCategories,
  onAddStop,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12", // hybrid
      center: [-93.5, 41.5],
      zoom: 5,
      projection: "mercator",
    });

    mapRef.current.on("load", () => {
      fetch(`${basePath}/data/retailers.geojson?cacheBust=${Date.now()}`)
        .then((res) => res.json())
        .then((data) => {
          if (!mapRef.current) return;

          if (mapRef.current.getSource("retailers")) {
            mapRef.current.removeLayer("retailer-points");
            mapRef.current.removeSource("retailers");
          }

          mapRef.current.addSource("retailers", {
            type: "geojson",
            data,
          });

          mapRef.current.addLayer({
            id: "retailer-points",
            type: "circle",
            source: "retailers",
            paint: {
              "circle-radius": [
                "case",
                ["==", ["get", "category"], "Kingpin"],
                categoryColors["Kingpin"].size,
                [
                  "match",
                  ["get", "category"],
                  "Agronomy",
                  categoryColors["Agronomy"].size,
                  "Agronomy/Grain",
                  categoryColors["Agronomy/Grain"].size,
                  "Office/Service",
                  categoryColors["Office/Service"].size,
                  "Grain",
                  categoryColors["Grain"].size,
                  "Grain/Feed",
                  categoryColors["Grain/Feed"].size,
                  "Distribution",
                  categoryColors["Distribution"].size,
                  5,
                ],
              ],
              "circle-color": [
                "match",
                ["get", "category"],
                "Kingpin",
                categoryColors["Kingpin"].color,
                "Agronomy",
                categoryColors["Agronomy"].color,
                "Agronomy/Grain",
                categoryColors["Agronomy/Grain"].color,
                "Office/Service",
                categoryColors["Office/Service"].color,
                "Grain",
                categoryColors["Grain"].color,
                "Grain/Feed",
                categoryColors["Grain/Feed"].color,
                "Distribution",
                categoryColors["Distribution"].color,
                "#cccccc",
              ],
              "circle-stroke-color": [
                "match",
                ["get", "category"],
                "Kingpin",
                categoryColors["Kingpin"].stroke,
                "Agronomy",
                categoryColors["Agronomy"].stroke,
                "Agronomy/Grain",
                categoryColors["Agronomy/Grain"].stroke,
                "Office/Service",
                categoryColors["Office/Service"].stroke,
                "Grain",
                categoryColors["Grain"].stroke,
                "Grain/Feed",
                categoryColors["Grain/Feed"].stroke,
                "Distribution",
                categoryColors["Distribution"].stroke,
                "#000000",
              ],
              "circle-stroke-width": 2,
            },
          });
        });
    });
  }, []);

  return <div ref={mapContainer} className="w-full h-full" />;
}
