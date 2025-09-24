// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CategoryStyle {
  color: string;
  outline?: string;
}

export const categoryColors: Record<string, CategoryStyle> = {
  Agronomy: { color: "#1f77b4" },
  "Office/Service": { color: "#ff7f0e" },
  "Retail/Storefront": { color: "#2ca02c" },
  Warehouse: { color: "#9467bd" },
  Kingpin: { color: "#ff0000", outline: "#ffff00" }, // Always visible
};

export interface CertisMapProps {
  selectedCategories: string[];
  selectedStates: string[];
  selectedSuppliers: string[];
  selectedRetailers: string[];
  onStatesLoaded?: (states: string[]) => void;
  onRetailersLoaded?: (retailers: string[]) => void;
  onRetailerSummary?: (
    summary: { state: string; retailer: string; locations: number }[]
  ) => void; // ✅ new callback
  geojsonUrl?: string;
}

export default function CertisMap({
  selectedCategories,
  selectedStates,
  selectedSuppliers,
  selectedRetailers,
  onStatesLoaded,
  onRetailersLoaded,
  onRetailerSummary,
  geojsonUrl = "/retailers.geojson",
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // ========================================
  // 🗺️ Initialize Map
  // ========================================
  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-96, 40],
      zoom: 3.5,
    });

    mapRef.current.on("load", async () => {
      try {
        const res = await fetch(geojsonUrl);
        const data = await res.json();

        // Extract unique states & retailers for sidebar filters
        const states = Array.from(
          new Set(
            data.features
              .map((f: any) => f.properties.State)
              .filter(Boolean)
          )
        ).sort();
        const retailers = Array.from(
          new Set(
            data.features
              .map((f: any) => f.properties.Retailer)
              .filter(Boolean)
          )
        ).sort();

        onStatesLoaded?.(states);
        onRetailersLoaded?.(retailers);

        mapRef.current?.addSource("retailers", {
          type: "geojson",
          data,
        });

        mapRef.current?.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 6,
            "circle-color": [
              "match",
              ["get", "Category"],
              ...Object.entries(categoryColors).flatMap(([key, val]) => [
                key,
                val.color,
              ]),
              "#ccc",
            ],
            "circle-stroke-color": [
              "case",
              ["==", ["get", "Category"], "Kingpin"],
              "#ffff00",
              "#000000",
            ],
            "circle-stroke-width": [
              "case",
              ["==", ["get", "Category"], "Kingpin"],
              3,
              1,
            ],
          },
        });
      } catch (err) {
        console.error("Error loading GeoJSON:", err);
      }
    });
  }, [geojsonUrl, onStatesLoaded, onRetailersLoaded]);

  // ========================================
  // 🎛️ Apply Filters + Compute Retailer Summary
  // ========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("retailers")) return;

    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource;

    fetch(geojsonUrl)
      .then((res) => res.json())
      .then((data) => {
        const filtered = data.features.filter((f: any) => {
          const { State, Retailer, Category } = f.properties;

          const stateOk =
            selectedStates.length === 0 || selectedStates.includes(State);
          const retailerOk =
            selectedRetailers.length === 0 ||
            selectedRetailers.includes(Retailer);
          const categoryOk =
            Category === "Kingpin" ||
            selectedCategories.length === 0 ||
            selectedCategories.includes(Category);

          return stateOk && retailerOk && categoryOk;
        });

        // ✅ Update the map
        src.setData({
          type: "FeatureCollection",
          features: filtered,
        });

        // ✅ Compute retailer summary (state + retailer + total count)
        if (onRetailerSummary) {
          const summaryMap = new Map<string, number>();
          for (const f of filtered) {
            const { State, Retailer } = f.properties;
            const key = `${State}||${Retailer}`;
            summaryMap.set(key, (summaryMap.get(key) || 0) + 1);
          }

          const summary = Array.from(summaryMap.entries()).map(
            ([key, count]) => {
              const [state, retailer] = key.split("||");
              return { state, retailer, locations: count };
            }
          );

          onRetailerSummary(summary);
        }
      })
      .catch((err) => console.error("Filter error:", err));
  }, [
    selectedStates,
    selectedRetailers,
    selectedCategories,
    geojsonUrl,
    onRetailerSummary,
  ]);

  return <div ref={mapContainer} className="map-container w-full h-full" />;
}
