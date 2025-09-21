"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CertisMapProps {
  selectedCategories: string[];
  selectedStates: string[];
  selectedSuppliers: string[];
}

export default function CertisMap({
  selectedCategories,
  selectedStates,
  selectedSuppliers,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.6],
      zoom: 5,
      projection: "mercator", // ✅ force Mercator
    });

    mapRef.current.on("load", async () => {
      const response = await fetch("./data/retailers_styled.geojson");
      const geojson = await response.json();

      // Add source
      mapRef.current!.addSource("retailers", {
        type: "geojson",
        data: geojson,
      });

      // Add circle layer
      mapRef.current!.addLayer({
        id: "retailer-points",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": [
            "match",
            ["get", "MarkerSize"],
            "large",
            8,
            "medium",
            6,
            "small",
            4,
            5,
          ],
          "circle-color": ["get", "MarkerColor"],
          "circle-stroke-color": ["get", "MarkerBorder"],
          "circle-stroke-width": 2,
        },
      });

      // Popup on click
      mapRef.current!.on("click", "retailer-points", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;

        const props = feature.properties as any;
        const coordinates = (feature.geometry as any).coordinates.slice();

        new mapboxgl.Popup()
          .setLngLat(coordinates)
          .setHTML(
            `<strong>${props.Name}</strong><br/>
             ${props.Category}<br/>
             ${props.Address || ""}<br/>
             State: ${props.State || ""}<br/>
             Supplier: ${props.Suppliers || ""}`
          )
          .addTo(mapRef.current!);
      });

      // Change cursor on hover
      mapRef.current!.on("mouseenter", "retailer-points", () => {
        mapRef.current!.getCanvas().style.cursor = "pointer";
      });
      mapRef.current!.on("mouseleave", "retailer-points", () => {
        mapRef.current!.getCanvas().style.cursor = "";
      });
    });
  }, []);

  // ✅ Filtering logic
  useEffect(() => {
    if (!mapRef.current) return;

    const filters: any[] = ["all"];

    if (selectedCategories.length > 0) {
      filters.push(["in", ["get", "Category"], ["literal", selectedCategories]]);
    }
    if (selectedStates.length > 0) {
      filters.push(["in", ["get", "State"], ["literal", selectedStates]]);
    }
    if (selectedSuppliers.length > 0) {
      filters.push(["in", ["get", "Suppliers"], ["literal", selectedSuppliers]]);
    }

    // ✅ Always show Kingpins
    const kingpinFilter: any[] = ["==", ["get", "Category"], "Kingpin"];
    const finalFilter: any[] = ["any", kingpinFilter, filters];

    mapRef.current.setFilter("retailer-points", finalFilter);
  }, [selectedCategories, selectedStates, selectedSuppliers]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
