// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD FINAL (Stop Type Correction)
//   • Restores full Stop fields required by page.tsx
//   • Kingpins (PNG) — TOP, HQ — MIDDLE, Retailers — BOTTOM
//   • Bailey-compliant filtering (retailer intersection, state-only kingpin)
//   • Add-to-Trip now passes name/address/city/state/zip/lat/lon
//   • Mapbox GL JS v3 — satellite-streets-v12 — Mercator
//   • Static export safe
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ================================================================
// 🎨 CATEGORY COLORS — Gold Parity Palette
// ================================================================
export const categoryColors: Record<string, string> = {
  "Agronomy": "#4CAF50",
  "Distribution": "#2196F3",
  "Grain/Feed": "#FF9800",
  "C-Store/Service/Energy": "#9C27B0",
  "Corporate HQ": "#FF0000",
  "Kingpin": "#000000",
  "Unknown": "#607D8B"
};

// ================================================================
// 🧭 FULL STOP TYPE — MATCHES page.tsx REQUIREMENTS
// ================================================================
export type Stop = {
  name: string;
  longitude: number;
  latitude: number;
  address: string;
  city: string;
  state: string;
  zip: string;
};

// ================================================================
// 🧭 COMPONENT PROPS
// ================================================================
interface CertisMapProps {
  homeLocation: LngLatLike | null;
  tripStops: Stop[];
  tripMode: "entered" | "optimized";
  onAddStop: (s: Stop) => void;
  onOptimizedRoute: (coords: [number, number][]) => void;

  selectedState: string | null;
  selectedRetailer: string | null;
  selectedCategory: string | null;
  selectedSupplier: string | null;

  onStatesLoaded?: (list: string[]) => void;
  onRetailersLoaded?: (list: string[]) => void;
  onCategoriesLoaded?: (list: string[]) => void;
  onSuppliersLoaded?: (list: string[]) => void;
}

// ================================================================
// 📌 MAIN COMPONENT
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
      const retailers = await (await fetch("/data/retailers.geojson")).json();
      const kingpins = await (await fetch("/data/kingpin.geojson")).json();

      // Sources
      map.addSource("retailers", { type: "geojson", data: retailers });
      map.addSource("kingpins", { type: "geojson", data: kingpins });

      // KINGPIN PNG (TOP)
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

      // HQ — MIDDLE
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

      // RETAILERS — BOTTOM
      map.addLayer({
        id: "retailer-layer",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 6,
          "circle-color": ["coalesce", ["get", "color"], "#607D8B"],
          "circle-stroke-color": "#000",
          "circle-stroke-width": 0.8
        },
        filter: ["!=", ["get", "Category"], "Corporate HQ"]
      });

      // Dropdown values
      const listState = [...new Set(retailers.features.map((f: any) => f.properties.State))].sort().filter(Boolean);
      const listRetailer = [...new Set(retailers.features.map((f: any) => f.properties.Retailer))].sort().filter(Boolean);
      const listCategory = [...new Set(retailers.features.map((f: any) => f.properties.Category))].sort().filter(Boolean);
      const listSupplier = [...new Set(
        retailers.features.flatMap((f: any) =>
          (f.properties.Supplier || "").split(",").map((x: string) => x.trim())
        )
      )].sort().filter(Boolean);

      onStatesLoaded?.(listState);
      onRetailersLoaded?.(listRetailer);
      onCategoriesLoaded?.(listCategory);
      onSuppliersLoaded?.(listSupplier);

      // =====================================================================
      // 🛠️ RETAILER POPUP (Add-to-Trip)
      // =====================================================================
      map.on("click", "retailer-layer", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        const coords = f.geometry.coordinates as [number, number];

        const popupHtml = `
          <div style="font-size:14px;">
            <b>${p.Name}</b><br>${p.Address}<br>
            <button id="trip-btn" style="margin-top:6px;background:#2196F3;color:white;padding:4px 8px;border-radius:4px;">Add to Trip</button>
          </div>
        `;

        const popup = new mapboxgl.Popup().setLngLat(coords).setHTML(popupHtml).addTo(map);

        popup.on("open", () => {
          const btn = document.getElementById("trip-btn");
          if (!btn) return;

          btn.onclick = () => {
            onAddStop({
              name: p.Name,
              longitude: coords[0],
              latitude: coords[1],
              address: p.Address,
              city: p.City,
              state: p.State,
              zip: p.Zip
            });
            popup.remove();
          };
        });
      });

      // =====================================================================
      // 🛠️ KINGPIN POPUP (Add-to-Trip)
      // =====================================================================
      map.on("click", "kingpin-layer", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        const coords = f.geometry.coordinates as [number, number];

        const popupHtml = `
          <div style="font-size:14px;">
            <b>${p.Name}</b><br>${p.Address}<br>
            <button id="trip-btn2" style="margin-top:6px;background:#2196F3;color:white;padding:4px 8px;border-radius:4px;">Add to Trip</button>
          </div>
        `;

        const popup = new mapboxgl.Popup().setLngLat(coords).setHTML(popupHtml).addTo(map);

        popup.on("open", () => {
          const btn = document.getElementById("trip-btn2");
          if (!btn) return;

          btn.onclick = () => {
            onAddStop({
              name: p.Name,
              longitude: coords[0],
              latitude: coords[1],
              address: p.Address,
              city: p.City,
              state: p.State,
              zip: p.Zip
            });
            popup.remove();
          };
        });
      });
    });

    return () => map.remove();
  }, []);

  // ================================================================
  // 🧭 FILTERING — GOLD BASELINE
  // ================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Retailers — intersection
    const retailerFilter: any[] = ["all"];

    if (selectedState) retailerFilter.push(["==", ["get", "State"], selectedState]);
    if (selectedRetailer) retailerFilter.push(["==", ["get", "Retailer"], selectedRetailer]);
    if (selectedCategory) retailerFilter.push(["==", ["get", "Category"], selectedCategory]);
    if (selectedSupplier) retailerFilter.push(["in", selectedSupplier, ["get", "Supplier"]]);

    map.setFilter("retailer-layer", retailerFilter);

    // HQ (same intersection, plus category)
    const hqFilter = ["all", ...retailerFilter.slice(1)];
    hqFilter.push(["==", ["get", "Category"], "Corporate HQ"]);
    map.setFilter("hq-layer", hqFilter);

    // Kingpins — state only
    const kpFilter: any[] = ["all"];
    if (selectedState) kpFilter.push(["==", ["get", "State"], selectedState]);
    map.setFilter("kingpin-layer", kpFilter);

  }, [selectedState, selectedRetailer, selectedCategory, selectedSupplier]);

  // ================================================================
  // 📍 HOME MARKER
  // ================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !homeLocation) return;

    (map as any)._homeMarker?.remove();

    const el = document.createElement("img");
    el.src = "/icons/Blue_Home.png";
    el.style.width = "28px";

    const mk = new mapboxgl.Marker({ element: el })
      .setLngLat(homeLocation)
      .addTo(map);

    (map as any)._homeMarker = mk;

  }, [homeLocation]);

  // ================================================================
  // 📦 RENDER
  // ================================================================
  return (
    <div
      ref={mapContainer}
      style={{ width: "100%", height: "100%", borderRadius: "12px", overflow: "hidden" }}
    />
  );
}
