"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

type CertisMapProps = {
  categoryColors: Record<string, string>;
  selectedCategories: string[];
  onAddStop: (stop: string) => void;
};

const CertisMap: React.FC<CertisMapProps> = ({
  categoryColors,
  selectedCategories,
  onAddStop,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Restore persisted basemap style
  const [mapStyle, setMapStyle] = useState(
    localStorage.getItem("mapStyle") || "mapbox://styles/mapbox/satellite-streets-v12"
  );

  const handleStyleChange = (style: string) => {
    setMapStyle(style);
    localStorage.setItem("mapStyle", style);
    if (mapRef.current) {
      mapRef.current.setStyle(style);
      mapRef.current.once("styledata", () => {
        addRetailerLayers(mapRef.current!); // Re-add layers after style change
      });
    }
  };

  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyle,
      center: [-96, 40],
      zoom: 4,
    });

    mapRef.current = map;

    map.on("load", () => {
      setMapLoaded(true);

      map.addSource("retailers", {
        type: "geojson",
        data: "/retailers.geojson",
      });

      addRetailerLayers(map);
    });

    return () => {
      map.remove();
    };
  }, []);

  // Add normal categories + Kingpin layer
  const addRetailerLayers = (map: mapboxgl.Map) => {
    // Clear old layers first
    Object.keys(categoryColors).forEach((cat) => {
      if (map.getLayer(cat)) map.removeLayer(cat);
    });
    if (map.getLayer("kingpins")) map.removeLayer("kingpins");

    // Normal category layers
    Object.entries(categoryColors).forEach(([category, color]) => {
      map.addLayer({
        id: category,
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 6,
          "circle-color": color,
          "circle-stroke-color": "#000",
          "circle-stroke-width": 1,
        },
        filter: ["==", ["get", "Category"], category],
      });
    });

    // Kingpins: always visible
    map.addLayer({
      id: "kingpins",
      type: "circle",
      source: "retailers",
      paint: {
        "circle-radius": 8,
        "circle-color": "#ff0000", // Bright red
        "circle-stroke-color": "#ffff00", // Yellow outline
        "circle-stroke-width": 3,
      },
      filter: ["==", ["get", "Category"], "Kingpin"],
    });

    // Click handler for adding stops
    map.on("click", (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [...Object.keys(categoryColors), "kingpins"],
      });
      if (!features.length) return;
      const props = features[0].properties;
      if (props?.Name) {
        onAddStop(props.Name);
      }
    });
  };

  // Toggle visibility of non-Kingpin layers
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    Object.keys(categoryColors).forEach((category) => {
      if (mapRef.current?.getLayer(category)) {
        const visibility = selectedCategories.includes(category)
          ? "visible"
          : "none";
        mapRef.current.setLayoutProperty(category, "visibility", visibility);
      }
    });
  }, [selectedCategories, mapLoaded, categoryColors]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full" />

      {/* Basemap Style Switcher */}
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <button
          onClick={() => handleStyleChange("mapbox://styles/mapbox/streets-v12")}
          className="px-2 py-1 bg-blue-500 text-white rounded"
        >
          Streets
        </button>
        <button
          onClick={() => handleStyleChange("mapbox://styles/mapbox/outdoors-v12")}
          className="px-2 py-1 bg-green-600 text-white rounded"
        >
          Outdoors
        </button>
        <button
          onClick={() => handleStyleChange("mapbox://styles/mapbox/light-v11")}
          className="px-2 py-1 bg-purple-500 text-white rounded"
        >
          Light
        </button>
        <button
          onClick={() => handleStyleChange("mapbox://styles/mapbox/dark-v11")}
          className="px-2 py-1 bg-gray-800 text-white rounded"
        >
          Dark
        </button>
        <button
          onClick={() =>
            handleStyleChange("mapbox://styles/mapbox/satellite-streets-v12")
          }
          className="px-2 py-1 bg-yellow-600 text-white rounded"
        >
          Hybrid
        </button>
      </div>
    </div>
  );
};

export default CertisMap;
