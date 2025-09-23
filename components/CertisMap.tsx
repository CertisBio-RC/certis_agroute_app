// components/CertisMap.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CertisMapProps {
  selectedCategories: string[];
  geojsonUrl?: string; // defaults to retailers.geojson
}

interface RetailerFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    category: string;
  };
}

// ✅ Exported so page.tsx can build its legend
export const categoryColors: {
  [key: string]: { color: string; outline?: string };
} = {
  Agronomy: { color: "#1f77b4" },
  "Agronomy/Grain": { color: "#17becf" },
  "Office/Service": { color: "#8c564b" },
  Grain: { color: "#ff7f0e" },
  "Grain/Feed": { color: "#bcbd22" },
  Distribution: { color: "#000000" },
  Feed: { color: "#9467bd" },
  Kingpin: { color: "#ff0000", outline: "#ffff00" }, // red with yellow outline
};

export default function CertisMap({
  selectedCategories,
  geojsonUrl = "/retailers.geojson",
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);

  // Load GeoJSON once
  useEffect(() => {
    fetch(geojsonUrl)
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch((err) => console.error("Error loading geojson:", err));
  }, [geojsonUrl]);

  // Initialize map once
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-94.5, 42.0], // Midwest center
      zoom: 4,
      projection: "mercator", // ✅ force mercator
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
  }, []);

  // Update layers when data or filters change
  useEffect(() => {
    if (!mapRef.current || !data) return;

    const map = mapRef.current;

    // Remove old source/layer if exists
    if (map.getSource("retailers")) {
      if (map.getLayer("retailer-points")) {
        map.removeLayer("retailer-points");
      }
      map.removeSource("retailers");
    }

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
          9, // larger for Kingpins
          6,
        ],
        "circle-color": [
          "match",
          ["get", "category"],
          ...Object.entries(categoryColors).flatMap(([cat, style]) => [
            cat,
            style.color,
          ]),
          "#cccccc",
        ],
        "circle-stroke-color": [
          "match",
          ["get", "category"],
          ...Object.entries(categoryColors).flatMap(([cat, style]) => [
            cat,
            style.outline || "#ffffff",
          ]),
          "#ffffff",
        ],
        "circle-stroke-width": [
          "case",
          ["==", ["get", "category"], "Kingpin"],
          2,
          1,
        ],
      },
    });

    // ✅ Apply category filter (except Kingpins always visible)
    const filters: any[] = ["any"];
    if (selectedCategories.length > 0) {
      selectedCategories.forEach((cat) => {
        filters.push(["==", ["get", "category"], cat]);
      });
    }
    filters.push(["==", ["get", "category"], "Kingpin"]);

    map.setFilter("retailer-points", filters);
  }, [data, selectedCategories]);

  return (
    <div className="flex h-full w-full">
      {/* Map container */}
      <div ref={mapContainer} className="flex-1" />

      {/* ✅ Restore Left Side Retailer Tiles */}
      {data && (
        <div className="w-80 bg-gray-900 text-white p-4 overflow-y-auto">
          <h2 className="text-lg font-bold mb-2">Retailers</h2>
          <div className="space-y-2 max-h-[90vh] overflow-y-auto pr-1">
            {(data.features as RetailerFeature[])
              .filter(
                (f) =>
                  selectedCategories.includes(f.properties.category) ||
                  f.properties.category === "Kingpin"
              )
              .map((f, i) => (
                <div
                  key={i}
                  className="bg-gray-800 p-2 rounded shadow text-sm"
                >
                  <div className="font-bold">{f.properties.name}</div>
                  <div>
                    {f.properties.city}, {f.properties.state}
                  </div>
                  {f.properties.address && <div>{f.properties.address}</div>}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
