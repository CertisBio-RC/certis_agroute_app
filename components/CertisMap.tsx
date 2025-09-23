// components/CertisMap.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CertisMapProps {
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

export default function CertisMap({ geojsonUrl = "/retailers.geojson" }: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const categories: { [key: string]: string } = {
    Agronomy: "#1f77b4",
    "Agronomy/Grain": "#17becf",
    "Office/Service": "#8c564b",
    Grain: "#ff7f0e",
    "Grain/Feed": "#bcbd22",
    Distribution: "#000000",
    Feed: "#9467bd",
    Kingpin: "#ff0000", // red base, stroke applied separately
  };

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
      map.removeLayer("retailer-points");
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
          ...Object.entries(categories).flat(),
          "#cccccc",
        ],
        "circle-stroke-color": [
          "case",
          ["==", ["get", "category"], "Kingpin"],
          "#ffff00", // yellow border for Kingpins
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
    // Kingpins bypass filter
    filters.push(["==", ["get", "category"], "Kingpin"]);

    map.setFilter("retailer-points", filters);
  }, [data, selectedCategories]);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleSelectAll = () => setSelectedCategories(Object.keys(categories).filter(c => c !== "Kingpin"));
  const handleClearAll = () => setSelectedCategories([]);

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <div className="w-72 bg-gray-900 text-white p-4 overflow-y-auto">
        <img src="/certis-logo.png" alt="Certis Logo" className="w-40 mb-4" />
        <h2 className="text-lg font-bold mb-2">Categories</h2>
        <div className="flex gap-2 mb-3">
          <button
            onClick={handleSelectAll}
            className="bg-blue-600 px-2 py-1 rounded text-sm"
          >
            Select All
          </button>
          <button
            onClick={handleClearAll}
            className="bg-gray-600 px-2 py-1 rounded text-sm"
          >
            Clear All
          </button>
        </div>
        <ul>
          {Object.entries(categories).map(([cat, color]) => (
            <li key={cat} className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id={cat}
                checked={cat === "Kingpin" ? true : selectedCategories.includes(cat)}
                disabled={cat === "Kingpin"} // Kingpins always on
                onChange={() => handleCategoryChange(cat)}
              />
              <label htmlFor={cat} className="flex items-center gap-1">
                <span
                  className="inline-block w-4 h-4 rounded"
                  style={{
                    backgroundColor: color,
                    border: cat === "Kingpin" ? "2px solid yellow" : "1px solid white",
                  }}
                />
                {cat}
              </label>
            </li>
          ))}
        </ul>

        {/* ✅ Restore Left Side Retailer Tiles */}
        {data && (
          <div className="mt-4">
            <h2 className="text-lg font-bold mb-2">Retailers</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
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
                    {f.properties.address && (
                      <div>{f.properties.address}</div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Map container */}
      <div ref={mapContainer} className="flex-1" />
    </div>
  );
}
