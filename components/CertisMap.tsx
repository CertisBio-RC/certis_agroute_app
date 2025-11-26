// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD FINAL (Nov 2025 Reset)
//   • Bailey-compliant intersection filtering
//   • Kingpins (PNG) — TOP layer
//   • Corporate HQ — 7 px circle, red/yellow
//   • Retailers — 6 px category-colored circles
//   • Add-to-Trip fully intact
//   • Mapbox GL JS v3 — satellite-streets-v12 — Mercator
//   • Static export safe
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ================================================================
// 🎨 CATEGORY COLORS — Gold Parity Palette (Authoritative)
// ================================================================
export const categoryColors: Record<string, string> = {
  "Agronomy": "#4CAF50",
  "Distribution": "#2196F3",
  "Grain/Feed": "#FF9800",
  "C-Store/Service/Energy": "#9C27B0",
  "Corporate HQ": "#FF0000",   // Stroke #FFFF00 applied in layer
  "Kingpin": "#000000",        // Not used—Kingpin is PNG
  "Unknown": "#607D8B"
};

// ================================================================
// 🧭 TYPE DEFINITIONS
// ================================================================
interface Stop {
  name: string;
  longitude: number;
  latitude: number;
}

interface CertisMapProps {
  homeLocation: LngLatLike | null;
  tripStops: Stop[];
  tripMode: "entered" | "optimized";
  onAddStop: (s: Stop) => void;
  onOptimizedRoute: (coords: [number, number][]) => void;

  // Filtering props
  selectedState: string | null;
  selectedRetailer: string | null;
  selectedCategory: string | null;
  selectedSupplier: string | null;

  // Loader for dropdown lists
  onStatesLoaded?: (list: string[]) => void;
  onRetailersLoaded?: (list: string[]) => void;
  onCategoriesLoaded?: (list: string[]) => void;
  onSuppliersLoaded?: (list: string[]) => void;
}

// ================================================================
// 📌 MAIN MAP COMPONENT
// ================================================================
export default function CertisMap({
  homeLocation,
  tripStops,
  tripMode,
  onAddStop,
  onOptimizedRoute,
  selectedState,
  selectedRetailer,
  selectedCategory,
  selectedSupplier,
  onStatesLoaded,
  onRetailersLoaded,
  onCategoriesLoaded,
  onSuppliersLoaded
}: CertisMapProps) {

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // ================================================================
  // 🗺️ INITIAL MAP LOAD
  // ================================================================
  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.0, 42.0],
      zoom: 5,
      projection: "mercator"
    });

    mapRef.current = map;

    map.on("load", async () => {
      // Load geojson
      const retailers = await (await fetch("/data/retailers.geojson")).json();
      const kingpins = await (await fetch("/data/kingpin.geojson")).json();

      // Add sources
      map.addSource("retailers", {
        type: "geojson",
        data: retailers
      });

      map.addSource("kingpins", {
        type: "geojson",
        data: kingpins
      });

      // KINGPIN TOP LAYER — PNG ICON
      map.loadImage("/icons/kingpin.png", (err, img) => {
        if (!err && img && !map.hasImage("kingpin-icon")) {
          map.addImage("kingpin-icon", img);
        }
      });

      map.addLayer({
        id: "kingpin-layer",
        type: "symbol",
        source: "kingpins",
        layout: {
          "icon-image": "kingpin-icon",
          "icon-size": 0.55,
          "icon-allow-overlap": true
        }
      });

      // CORPORATE HQ — 7 px RED/YELLOW CIRCLE — MIDDLE LAYER
      map.addLayer({
        id: "hq-layer",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 7,
          "circle-color": "#FF0000",
          "circle-stroke-color": "#FFFF00",
          "circle-stroke-width": 1.5
        },
        filter: ["==", ["get", "Category"], "Corporate HQ"]
      });

      // RETAILERS — 6 px category circles — BOTTOM LAYER
      map.addLayer({
        id: "retailer-layer",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "coalesce",
            ["get", "color"],
            "#607D8B"
          ],
          "circle-stroke-color": "#000",
          "circle-stroke-width": 0.8
        },
        filter: ["!=", ["get", "Category"], "Corporate HQ"]
      });

      // Save categories, states, suppliers for dropdowns
      const listState = [...new Set(retailers.features.map((f: any) => f.properties.State))].sort().filter(Boolean);
      const listRetailer = [...new Set(retailers.features.map((f: any) => f.properties.Retailer))].sort().filter(Boolean);
      const listCategory = [...new Set(retailers.features.map((f: any) => f.properties.Category))].sort().filter(Boolean);
      const listSupplier = [...new Set(retailers.features.flatMap((f: any) => (f.properties.Supplier || "").split(",").map((x: string) => x.trim())))]
        .sort()
        .filter(Boolean);

      onStatesLoaded?.(listState);
      onRetailersLoaded?.(listRetailer);
      onCategoriesLoaded?.(listCategory);
      onSuppliersLoaded?.(listSupplier);

      // ========================================================================
      // 🛠️ POPUP + ADD-TO-TRIP
      // ========================================================================
      map.on("click", "retailer-layer", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;

        const coords = f.geometry.coordinates as [number, number];
        const popupHtml = `
          <div style="font-size:14px;">
            <b>${p.Name}</b><br>
            ${p.Address}<br>
            <button id="trip-btn" style="margin-top:6px;background:#2196F3;color:white;padding:4px 8px;border-radius:4px;">Add to Trip</button>
          </div>
        `;

        const popup = new mapboxgl.Popup({ closeOnClick: true })
          .setLngLat(coords)
          .setHTML(popupHtml)
          .addTo(map);

        popup.on("open", () => {
          const btn = document.getElementById("trip-btn");
          if (btn) {
            btn.onclick = () => {
              onAddStop({
                name: p.Name,
                longitude: coords[0],
                latitude: coords[1]
              });
              popup.remove();
            };
          }
        });
      });

      // Kingpin popup
      map.on("click", "kingpin-layer", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;

        const coords = f.geometry.coordinates as [number, number];
        const popupHtml = `
          <div style="font-size:14px;">
            <b>${p.Name}</b><br>
            ${p.Address}<br>
            <button id="trip-btn2" style="margin-top:6px;background:#2196F3;color:white;padding:4px 8px;border-radius:4px;">Add to Trip</button>
          </div>
        `;

        const popup = new mapboxgl.Popup({ closeOnClick: true })
          .setLngLat(coords)
          .setHTML(popupHtml)
          .addTo(map);

        popup.on("open", () => {
          const btn = document.getElementById("trip-btn2");
          if (btn) {
            btn.onclick = () => {
              onAddStop({
                name: p.Name,
                longitude: coords[0],
                latitude: coords[1]
              });
              popup.remove();
            };
          }
        });
      });
    });

    return () => map.remove();
  }, []);

  // ================================================================
  // 🧭 FILTERING — GOLD BASELINE (Intersection for Retailers)
  // ================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const retailerFilter: any[] = ["all"];

    if (selectedState) {
      retailerFilter.push(["==", ["get", "State"], selectedState]);
    }
    if (selectedRetailer) {
      retailerFilter.push(["==", ["get", "Retailer"], selectedRetailer]);
    }
    if (selectedCategory) {
      retailerFilter.push(["==", ["get", "Category"], selectedCategory]);
    }
    if (selectedSupplier) {
      retailerFilter.push(["in",
        selectedSupplier,
        ["get", "Supplier"]]
      );
    }

    // Retailers (intersection)
    map.setFilter("retailer-layer", retailerFilter);

    // HQ filter inherits same logic (same source)
    const hqFilter = ["all", ...retailerFilter.slice(1)];
    hqFilter.push(["==", ["get", "Category"], "Corporate HQ"]);
    map.setFilter("hq-layer", hqFilter);

    // Kingpins — ONLY STATE filter
    const kpFilter = ["all"];
    if (selectedState) {
      kpFilter.push(["==", ["get", "State"], selectedState]);
    }
    map.setFilter("kingpin-layer", kpFilter);

  }, [selectedState, selectedRetailer, selectedCategory, selectedSupplier]);

  // ================================================================
  // 📍 HOME MARKER
  // ================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !homeLocation) return;

    // Remove any old marker
    (map as any)._homeMarker?.remove();

    // Add new
    const el = document.createElement("img");
    el.src = "/icons/Blue_Home.png";
    el.style.width = "28px";

    const mk = new mapboxgl.Marker({ element: el })
      .setLngLat(homeLocation)
      .addTo(map);

    (map as any)._homeMarker = mk;

  }, [homeLocation]);

  // ================================================================
  // 📦 RENDER MAP
  // ================================================================
  return (
    <div
      ref={mapContainer}
      style={{ width: "100%", height: "100%", borderRadius: "12px", overflow: "hidden" }}
    />
  );
}
