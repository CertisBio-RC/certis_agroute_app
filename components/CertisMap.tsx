// components/CertisMap.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css"; // ✅ ensure Mapbox CSS loads

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CertisMapProps {
  geojsonUrl?: string; // defaults to retailers.geojson
  selectedCategories?: string[]; // passed in from page.tsx
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

// ✅ Export color map so page.tsx can render checkboxes
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
  geojsonUrl = "/retailers.geojson",
  selectedCategories = [],
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);

  // ✅ Resolve basePath for GH Pages
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const resolvedUrl = `${basePath}${geojsonUrl}`;

  // ✅ Load GeoJSON once
  useEffect(() => {
    console.log("[CertisMap] Fetching GeoJSON:", resolvedUrl);
    fetch(resolvedUrl)
      .then((res) => res.json())
      .then((json) => {
        console.log("[CertisMap] GeoJSON loaded. Feature count:", json.features?.length || 0);
        setData(json);
      })
      .catch((err) => console.error("[CertisMap] Error loading geojson:", err));
  }, [resolvedUrl]);

  // ✅ Initialize map once
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-94.5, 42.0], // Midwest center
      zoom: 4,
      projection: "mercator", // ✅ force Mercator
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    console.log("[CertisMap] Map initialized (Mercator).");

    // ✅ Add temporary debug marker at Midwest center
    new mapboxgl.Marker({ color: "red" })
      .setLngLat([-94.5, 42.0])
      .setPopup(new mapboxgl.Popup().setText("Debug Marker: Center of Map"))
      .addTo(mapRef.current);

    console.log("[CertisMap] Debug marker added at center.");
  }, []);

  // ✅ Add/update source & layer whenever data or filters change
  useEffect(() => {
    if (!mapRef.current || !data) return;
    const map = mapRef.current;

    // Remove old layers/sources safely
    if (map.getLayer("retailer-points")) {
      map.removeLayer("retailer-points");
    }
    if (map.getSource("retailers")) {
      map.removeSource("retailers");
    }

    console.log("[CertisMap] Adding source + layer with", data.features.length, "features.");
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
          9, // Kingpins larger
          6,
        ],
        "circle-color": [
          "match",
          ["get", "category"],
          ...Object.entries(categoryColors).flatMap(([cat, style]) => [cat, style.color]),
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

    // ✅ Apply filter: Kingpins always visible, others per selectedCategories
    let filters: any[] = ["any"];
    if (selectedCategories.length > 0) {
      selectedCategories.forEach((cat) => {
        filters.push(["==", ["get", "category"], cat]);
      });
    }
    filters.push(["==", ["get", "category"], "Kingpin"]);

    console.log("[CertisMap] Applying filter:", JSON.stringify(filters));
    map.setFilter("retailer-points", filters);
  }, [data, selectedCategories]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
