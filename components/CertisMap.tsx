// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CertisMapProps {
  selectedCategories: string[];
  selectedStates: string[];
}

// ✅ Exportable state list for sidebar filter
export let availableStates: string[] = [];

// ✅ Grouped category colors
const categoryColors: Record<string, { color: string; outline: string }> = {
  "Agronomy": { color: "#ffd700", outline: "#a67c00" },      // yellow
  "Grain/Feed": { color: "#ff7f0e", outline: "#a64e00" },   // orange
  "Office/Service": { color: "#1f78ff", outline: "#0d3d99" } // bright blue
  // 🚨 Kingpins handled separately
};

export default function CertisMap({ selectedCategories, selectedStates }: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.7],
      zoom: 4.2,
      projection: { name: "mercator" },
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    mapRef.current.on("load", async () => {
      try {
        const response = await fetch(`${basePath}/retailers.geojson`);
        if (!response.ok) throw new Error(`Failed to fetch GeoJSON: ${response.status}`);
        const rawGeojson = await response.json();

        if (!rawGeojson || !rawGeojson.features) {
          console.warn("⚠️ No valid features found in retailers.geojson");
          return;
        }

        // Normalize categories into groups
        const normalizedGeojson = {
          ...rawGeojson,
          features: rawGeojson.features.map((f: any) => {
            const rawCat = f.properties?.category || "";
            let grouped = "Other";

            if (rawCat === "Kingpin") {
              grouped = "Kingpin";
            } else if (rawCat === "Agronomy" || rawCat === "Agronomy/Grain") {
              grouped = "Agronomy";
            } else if (["Grain", "Feed", "Grain/Feed"].includes(rawCat)) {
              grouped = "Grain/Feed";
            } else if (rawCat === "Office/Service") {
              grouped = "Office/Service";
            }

            return {
              ...f,
              properties: {
                ...f.properties,
                groupedCategory: grouped,
              },
            };
          }),
        };

        // Collect unique states
        const states = new Set<string>();
        normalizedGeojson.features.forEach((f: any) => {
          if (f.properties?.state) states.add(f.properties.state);
        });
        availableStates = Array.from(states).sort();
        console.log("📍 Available states:", availableStates);

        // Clean old sources/layers
        if (mapRef.current!.getSource("retailers")) {
          if (mapRef.current!.getLayer("retailer-points")) {
            mapRef.current!.removeLayer("retailer-points");
          }
          if (mapRef.current!.getLayer("kingpins")) {
            mapRef.current!.removeLayer("kingpins");
          }
          mapRef.current!.removeSource("retailers");
        }

        mapRef.current!.addSource("retailers", {
          type: "geojson",
          data: normalizedGeojson,
        });

        // Build explicit match arrays based on groupedCategory
        const colorMatch: (string | any)[] = ["match", ["get", "groupedCategory"]];
        const outlineMatch: (string | any)[] = ["match", ["get", "groupedCategory"]];
        for (const [cat, style] of Object.entries(categoryColors)) {
          colorMatch.push(cat, style.color);
          outlineMatch.push(cat, style.outline);
        }
        colorMatch.push("#cccccc"); // default color
        outlineMatch.push("#000000"); // default outline

        // Retailer points (all non-Kingpin categories)
        mapRef.current!.addLayer({
          id: "retailer-points",
          type: "circle",
          source: "retailers",
          filter: ["all", ["!=", ["get", "groupedCategory"], "Kingpin"]],
          paint: {
            "circle-radius": 5,
            "circle-color": colorMatch as any,
            "circle-stroke-color": outlineMatch as any,
            "circle-stroke-width": 1,
          },
        });

        // Kingpins (always visible, 6px, bright red/yellow)
        mapRef.current!.addLayer({
          id: "kingpins",
          type: "circle",
          source: "retailers",
          filter: ["==", ["get", "groupedCategory"], "Kingpin"],
          paint: {
            "circle-radius": 6,
            "circle-color": "#ff0000",
            "circle-stroke-color": "#ffff00",
            "circle-stroke-width": 2,
          },
        });

        // Hover popup for non-kingpins
        mapRef.current!.on("mouseenter", "retailer-points", (e) => {
          mapRef.current!.getCanvas().style.cursor = "pointer";

          const coords = (e.features?.[0].geometry as any).coordinates.slice();
          const props = e.features?.[0].properties;
          if (!props) return;

          if (popupRef.current) {
            popupRef.current.remove();
          }

          popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
            .setLngLat(coords)
            .setHTML(`
              <div style="font-weight:bold; margin-bottom:4px;">${props["name"] || ""}</div>
              <div>${props["address"] || ""}</div>
              <div>${props["city"] || ""}, ${props["state"] || ""} ${props["zip"] || ""}</div>
              <div><b>Category:</b> ${props["groupedCategory"] || "N/A"}</div>
              <div><b>Retailer:</b> ${props["retailer"] || "N/A"}</div>
              <div><b>Suppliers:</b> ${props["suppliers"] || "N/A"}</div>
            `)
            .addTo(mapRef.current!);
        });

        mapRef.current!.on("mouseleave", "retailer-points", () => {
          mapRef.current!.getCanvas().style.cursor = "";
          if (popupRef.current) {
            popupRef.current.remove();
            popupRef.current = null;
          }
        });
      } catch (err) {
        console.error("❌ Error loading geojson:", err);
      }
    });
  }, []);

  // Apply filters dynamically
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.getLayer("retailer-points")) return;

    const categoryFilter =
      selectedCategories.length > 0
        ? ["in", ["get", "groupedCategory"], ["literal", selectedCategories]]
        : true;

    const stateFilter =
      selectedStates.length > 0
        ? ["in", ["get", "state"], ["literal", selectedStates]]
        : true;

    mapRef.current.setFilter("retailer-points", [
      "all",
      ["!=", ["get", "groupedCategory"], "Kingpin"],
      categoryFilter,
      stateFilter,
    ]);
  }, [selectedCategories, selectedStates]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
