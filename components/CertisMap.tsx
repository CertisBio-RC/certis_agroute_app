// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CertisMapProps {
  selectedCategories: string[];
  selectedStates: string[];
  selectedSuppliers: string[];
  selectedRetailers: string[];
  onStatesLoaded?: (states: string[]) => void;
  onRetailersLoaded?: (retailers: string[]) => void;
  onRetailerSummary?: (
    summaries: { state: string; retailer: string; count: number }[]
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
      center: [-98, 39],
      zoom: 4,
      projection: "mercator",
    });

    // TODO: Load your GeoJSON here
    // Example: fetch retailers, set states/retailers lists
    // fetch("/retailers.geojson").then(res => res.json()).then(data => { ... })
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    // Fake data placeholder until real dataset is wired in
    const fakeFeatures = [
      { properties: { state: "SD", retailer: "AgTegra", category: "Agronomy" } },
      { properties: { state: "SD", retailer: "AgTegra", category: "Office/Service" } },
      { properties: { state: "IA", retailer: "CHS", category: "Agronomy" } },
    ];

    // Filter features by selections
    const filtered = fakeFeatures.filter((f) => {
      const s = f.properties.state;
      const r = f.properties.retailer;
      const c = f.properties.category;

      const stateOk =
        selectedStates.length === 0 || selectedStates.includes(s);
      const retailerOk =
        selectedRetailers.length === 0 || selectedRetailers.includes(r);
      const categoryOk =
        selectedCategories.length === 0 || selectedCategories.includes(c);

      return stateOk && retailerOk && categoryOk;
    });

    // Build summary for each selected retailer
    if (onRetailerSummary) {
      const summaries: { state: string; retailer: string; count: number }[] = [];
      selectedRetailers.forEach((r) => {
        selectedStates.forEach((st) => {
          const matches = filtered.filter(
            (f) => f.properties.retailer === r && f.properties.state === st
          );
          if (matches.length > 0) {
            summaries.push({ state: st, retailer: r, count: matches.length });
          }
        });
      });
      onRetailerSummary(summaries);
    }
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
