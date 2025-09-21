"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CertisMapProps {
  selectedStates: string[];
  selectedCategories: string[];
  selectedSuppliers: string[];
  searchRetailer: string;
  onAddStop?: (stop: string) => void;
}

export default function CertisMap({
  selectedStates,
  selectedCategories,
  selectedSuppliers,
  searchRetailer,
  onAddStop,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.7], // Midwest-ish center
      zoom: 4,
      projection: { name: "mercator" },
    });

    const map = mapRef.current;

    map.on("load", async () => {
      const response = await fetch("./retailers.geojson");
      const geojson = await response.json();

      map.addSource("retailers", {
        type: "geojson",
        data: geojson,
      });

      map.addLayer({
        id: "retailer-points",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "category"], "Kingpin"],
            8,
            6,
          ],
          "circle-color": [
            "match",
            ["get", "category"],
            "Agronomy",
            "#1b9e77",
            "Grain",
            "#4575b4",
            "Agronomy/Grain",
            "#66c2a5",
            "Office/Service",
            "#636363",
            "Kingpin",
            "#e31a1c",
            "#252525",
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

      // Click → add stop
      map.on("click", "retailer-points", (e) => {
        if (!e.features || !e.features.length) return;
        const feature = e.features[0];
        const { longName, city, state } = feature.properties as {
          longName: string;
          city: string;
          state: string;
        };
        if (onAddStop) {
          onAddStop(`${longName} (${city}, ${state})`);
        }
      });
    });
  }, [onAddStop]);

  // Filtering
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const filters: any[] = ["all"];

    if (selectedStates.length > 0) {
      filters.push(["in", ["get", "state"], ["literal", selectedStates]]);
    }
    if (selectedCategories.length > 0) {
      filters.push(["in", ["get", "category"], ["literal", selectedCategories]]);
    }
    if (selectedSuppliers.length > 0) {
      filters.push(["in", ["get", "supplier"], ["literal", selectedSuppliers]]);
    }
    if (searchRetailer) {
      filters.push([
        "in",
        searchRetailer.toLowerCase(),
        ["downcase", ["get", "longName"]],
      ]);
    }

    // Kingpin always visible
    const finalFilter: any = ["any", ["==", ["get", "category"], "Kingpin"], filters];

    map.setFilter("retailer-points", finalFilter);
  }, [selectedStates, selectedCategories, selectedSuppliers, searchRetailer]);

  return <div ref={mapContainer} className="map-container" />;
}
