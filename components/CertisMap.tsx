"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CertisMapProps {
  selectedCategories: string[];
  selectedSuppliers: string[];
  selectedStates: string[];
  retailerSearch: string;
  onAddStop?: (stop: string) => void;
}

export default function CertisMap({
  selectedCategories,
  selectedSuppliers,
  selectedStates,
  retailerSearch,
  onAddStop,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.9],
      zoom: 5,
      projection: { name: "mercator" },
    });

    mapRef.current = map;

    map.on("load", async () => {
      try {
        const response = await fetch("./data/retailers.geojson");
        const data = await response.json();

        map.addSource("retailers", {
          type: "geojson",
          data,
        });

        // ✅ Circle markers styled
        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": [
              "case",
              ["==", ["get", "category"], "Kingpin"],
              10,
              6,
            ],
            "circle-color": [
              "case",
              ["==", ["get", "category"], "Kingpin"],
              "#FF0000",
              ["==", ["get", "category"], "Agronomy"],
              "#1f77b4",
              ["==", ["get", "category"], "Grain"],
              "#2ca02c",
              ["==", ["get", "category"], "Agronomy/Grain"],
              "#9467bd",
              ["==", ["get", "category"], "Office/Service"],
              "#ff7f0e",
              "#7f7f7f",
            ],
            "circle-stroke-width": [
              "case",
              ["==", ["get", "category"], "Kingpin"],
              2,
              1,
            ],
            "circle-stroke-color": [
              "case",
              ["==", ["get", "category"], "Kingpin"],
              "#FFFF00",
              "#FFFFFF",
            ],
          },
        });

        // ✅ Popup + add stop on click
        map.on("click", "retailers-layer", (e) => {
          const feature = e.features?.[0];
          if (!feature) return;

          const { name, category, address, supplier, state } =
            feature.properties as any;

          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-size:14px;">
                <strong>${name}</strong><br/>
                ${category}<br/>
                ${supplier || ""}<br/>
                ${state || ""}<br/>
                ${address || ""}
              </div>`
            )
            .addTo(map);

          if (onAddStop && name) {
            onAddStop(name);
          }
        });

        // ✅ Fit map to bounds
        const bounds = new mapboxgl.LngLatBounds();
        data.features.forEach((f: any) => {
          if (f.geometry?.coordinates) {
            bounds.extend(f.geometry.coordinates as [number, number]);
          }
        });
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 50, animate: true });
        }
      } catch (err) {
        console.error("Failed to load retailers.geojson", err);
      }
    });
  }, [onAddStop]);

  // ✅ Apply filters when props change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("retailers")) return;

    const filters: any[] = ["all"];

    // Category filter (Kingpin always shown)
    if (selectedCategories.length > 0) {
      filters.push([
        "any",
        ["in", ["get", "category"], ["literal", selectedCategories]],
        ["==", ["get", "category"], "Kingpin"],
      ]);
    }

    // Supplier filter
    if (selectedSuppliers.length > 0) {
      filters.push(["in", ["get", "supplier"], ["literal", selectedSuppliers]]);
    }

    // State filter
    if (selectedStates.length > 0) {
      filters.push(["in", ["get", "state"], ["literal", selectedStates]]);
    }

    // Retailer search (case insensitive substring match)
    if (retailerSearch.trim() !== "") {
      filters.push([
        "in",
        ["downcase", ["get", "name"]],
        ["literal", [retailerSearch.toLowerCase()]],
      ]);
    }

    map.setFilter("retailers-layer", filters);
  }, [selectedCategories, selectedSuppliers, selectedStates, retailerSearch]);

  return (
    <div className="relative w-full h-screen flex-1">
      {/* Certis logo overlay */}
      <div className="absolute top-2 left-2 z-10 bg-white/80 rounded-lg p-2 shadow-md">
        <a
          href="https://www.certisbio.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="./certis-logo.png"
            alt="Certis Biologicals"
            className="h-10 w-auto"
          />
        </a>
      </div>

      {/* Map container */}
      <div ref={mapContainer} className="w-full h-full rounded-lg shadow-md" />
    </div>
  );
}
