// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { FeatureCollection, Feature, Geometry } from "geojson";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ✅ Exported category colors (used in page.tsx legend)
export const categoryColors: Record<
  string,
  { color: string; outline?: string }
> = {
  Agronomy: { color: "#FFD700", outline: "#000" }, // yellow
  "Grain/Feed": { color: "#228B22", outline: "#000" }, // green
  "Office/Service": { color: "#1E90FF", outline: "#000" }, // blue
  Kingpin: { color: "#FF0000", outline: "#FFFF00" }, // red w/ yellow border
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
  ) => void;
}

export default function CertisMap({
  selectedCategories,
  selectedStates,
  selectedSuppliers,
  selectedRetailers,
  onStatesLoaded,
  onRetailersLoaded,
  onRetailerSummary,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-98.5795, 39.8283],
      zoom: 3,
    });

    mapRef.current.on("load", async () => {
      try {
        const response = await fetch(
          process.env.NEXT_PUBLIC_GEOJSON_URL || "/retailers.geojson"
        );
        const data: FeatureCollection = await response.json();

        // Extract states & retailers
        const stateSet = new Set<string>();
        const retailerSet = new Set<string>();

        for (const feature of data.features) {
          const state = feature.properties?.State;
          const retailer = feature.properties?.Retailer;
          if (state) stateSet.add(state as string);
          if (retailer) retailerSet.add(retailer as string);
        }

        const states = Array.from(stateSet) as string[];
        const retailers = Array.from(retailerSet) as string[];

        onStatesLoaded?.(states.sort());
        onRetailersLoaded?.(retailers.sort());

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
            "circle-color": "#1d4ed8",
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
          },
        });
      } catch (err) {
        console.error("Failed to load GeoJSON", err);
      }
    });
  }, [onStatesLoaded, onRetailersLoaded]);

  // ========================================
  // 🔄 Apply filters dynamically
  // ========================================
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const source = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!source) return;

    fetch(process.env.NEXT_PUBLIC_GEOJSON_URL || "/retailers.geojson")
      .then((res) => res.json())
      .then((data: FeatureCollection) => {
        const filtered: FeatureCollection<Geometry, any> = {
          type: "FeatureCollection",
          features: data.features.filter((f: Feature) => {
            const props = f.properties || {};
            const stateMatch =
              selectedStates.length === 0 ||
              selectedStates.includes(props.State);
            const retailerMatch =
              selectedRetailers.length === 0 ||
              selectedRetailers.includes(props.Retailer);
            const categoryMatch =
              selectedCategories.length === 0 ||
              selectedCategories.includes(props.Category);
            const supplierMatch =
              selectedSuppliers.length === 0 ||
              selectedSuppliers.includes(props.Supplier);
            return stateMatch && retailerMatch && categoryMatch && supplierMatch;
          }),
        };

        source.setData(filtered);

        // ========================================
        // 📊 Summarize locations by state + retailer
        // ========================================
        if (onRetailerSummary) {
          const summaryMap = new Map<
            string,
            { state: string; retailer: string; locations: number }
          >();

          for (const f of filtered.features) {
            const state = f.properties?.State || "Unknown";
            const retailer = f.properties?.Retailer || "Unknown";
            const key = `${state}-${retailer}`;

            if (!summaryMap.has(key)) {
              summaryMap.set(key, { state, retailer, locations: 0 });
            }
            summaryMap.get(key)!.locations += 1;
          }

          onRetailerSummary(Array.from(summaryMap.values()));
        }
      });
  }, [
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers,
    onRetailerSummary,
  ]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
