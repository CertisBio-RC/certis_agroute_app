// ============================================================================
// 💠 CERTIS AGROUTE "GOLD FINAL" — NON-DESTRUCTIVE FILTERING + HOME MARKER
//    • In-memory filtering (intersection-based, NEVER destructive)
//    • Kingpins remain visible independently of filters
//    • Home ZIP marker rendered ONLY when provided (Option 1 behavior)
//    • Uses BasePath automatically for static export / GitHub Pages
// ============================================================================

"use client";

import { useEffect, useRef, useState, useCallback, memo } from "react";
import mapboxgl, { Map, Marker, LngLatLike } from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// ********************************************************************************
// TYPES
// ********************************************************************************
export interface Stop {
  label: string;
  address: string;
  coords: [number, number];
}

export interface CertisMapProps {
  selectedCategories: string[];
  selectedStates: string[];
  selectedSuppliers: string[];
  selectedRetailers: string[];
  homeCoords: [number, number] | null;

  onStatesLoaded: (states: string[]) => void;
  onRetailersLoaded: (retailers: string[]) => void;
  onSuppliersLoaded: (suppliers: string[]) => void;
  onRetailerSummary: (
    summary: {
      retailer: string;
      count: number;
      suppliers: string[];
      categories: string[];
      states: string[];
    }[]
  ) => void;

  onAddStop: (stop: Stop) => void;
  tripStops: Stop[];
  tripMode: "entered" | "optimize";
}

// ********************************************************************************
// CATEGORY COLORS (UI legend uses same palette)
// ********************************************************************************
export const categoryColors: Record<
  string,
  { color: string; border?: string }
> = {
  Agronomy: { color: "#0ea5e9" },
  Grain: { color: "#16a34a" },
  Feed: { color: "#ca8a04" },
  Office: { color: "#6d28d9" },
  Service: { color: "#d946ef" },
  Distribution: { color: "#c2410c" },
  Kingpin: { color: "#ff0000" }, // 🔥 Kingpins always red
};

// Normalizer
const norm = (val: string) => (val || "").toString().trim().toLowerCase();

// ********************************************************************************
// MAIN MAP COMPONENT
// ********************************************************************************
function CertisMap({
  selectedCategories,
  selectedStates,
  selectedSuppliers,
  selectedRetailers,
  homeCoords,

  onStatesLoaded,
  onRetailersLoaded,
  onSuppliersLoaded,
  onRetailerSummary,

  onAddStop,
  tripStops,
  tripMode,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const homeMarkerRef = useRef<Marker | null>(null);

  const [geojson, setGeojson] = useState<any>(null);

  // ===========================================================================
  // INITIALIZE MAP (ONCE)
  // ===========================================================================
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapRef.current = new Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-94.5, 42.0], // Iowa center-ish
      zoom: 5,
      attributionControl: false,
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");
  }, []);

  // ===========================================================================
  // LOAD RETAILERS.GEOJSON (ONCE)
  // ===========================================================================
  useEffect(() => {
    async function loadGeojson() {
      const url = `${basePath}/data/retailers.geojson`;

      const res = await fetch(url);
      const data = await res.json();
      setGeojson(data);

      // Populate UI lists (NOT filtered — NON-DESTRUCTIVE)
      const retailers = new Set<string>();
      const suppliers = new Set<string>();
      const states = new Set<string>();

      data.features.forEach((f: any) => {
        retailers.add(f.properties.Retailer || "Unknown");
        suppliers.add(f.properties.Supplier || "N/A");
        states.add(f.properties.State || "");
      });

      onStatesLoaded([...states].sort());
      onRetailersLoaded([...retailers].sort());
      onSuppliersLoaded([...suppliers].sort());
    }

    loadGeojson();
  }, []);

  // ===========================================================================
  // CLEAR MARKERS
  // ===========================================================================
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (homeMarkerRef.current) {
      homeMarkerRef.current.remove();
      homeMarkerRef.current = null;
    }
  }, []);

  // ===========================================================================
  // APPLY FILTERS + DRAW MARKERS
  // ===========================================================================
  useEffect(() => {
    if (!geojson || !mapRef.current) return;
    clearMarkers();

    const summaryMap: Record<
      string,
      { retailers: string; suppliers: Set<string>; categories: Set<string>; states: Set<string> }
    > = {};

    geojson.features.forEach((f: any) => {
      const props = f.properties || {};
      const coords = f.geometry?.coordinates as [number, number];

      if (!coords) return;

      const cat = norm(props.Category || "");
      const retailer = props.Retailer || "Unknown";
      const supplier = props.Supplier || "N/A";
      const state = norm(props.State || "");

      // ============================================================
      // FILTERING LOGIC (INTERSECTION — NEVER DESTRUCTIVE!)
      // ============================================================
      if (
        selectedStates.length > 0 &&
        !selectedStates.includes(state)
      ) return;

      if (
        selectedCategories.length > 0 &&
        !selectedCategories.includes(cat) &&
        cat !== "kingpin"
      ) return;

      if (
        selectedSuppliers.length > 0 &&
        !selectedSuppliers.includes(supplier)
      ) return;

      if (
        selectedRetailers.length > 0 &&
        !selectedRetailers.includes(norm(retailer))
      ) return;

      // ============================================================
      // DRAW MARKER
      // ============================================================
      const config = categoryColors[props.Category] || categoryColors.Agronomy;

      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.background = config.color;
      el.style.border = props.Category === "Kingpin" ? "3px solid white" : "2px solid white";
      el.style.cursor = "pointer";

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(coords as LngLatLike)
        .setPopup(
          new mapboxgl.Popup().setHTML(
            `
              <b>${retailer}</b><br/>
              ${props.Name}<br/>
              ${props.Address}<br/>
              ${props.City}, ${props.State} ${props.Zip}<br/>
              <i>${props.Category}</i>
            `
          )
        )
        .addTo(mapRef.current!);

      markersRef.current.push(marker);

      // Allow click to add to Trip Planner
      el.addEventListener("click", () => {
        onAddStop({
          label: retailer,
          address: `${props.Address}, ${props.City}, ${props.State} ${props.Zip}`,
          coords,
        });
      });

      // Build channel summary
      if (!summaryMap[retailer]) {
        summaryMap[retailer] = {
          retailers: retailer,
          suppliers: new Set(),
          categories: new Set(),
          states: new Set(),
        };
      }

      summaryMap[retailer].suppliers.add(supplier);
      summaryMap[retailer].categories.add(props.Category);
      summaryMap[retailer].states.add(props.State);
    });

    onRetailerSummary(
      Object.values(summaryMap).map((s) => ({
        retailer: s.retailers,
        count: [...s.states].length,
        suppliers: [...s.suppliers],
        categories: [...s.categories],
        states: [...s.states],
      }))
    );

    // =======================================================================
    // HOME ZIP MARKER (ONLY WHEN SET — Option 1 behavior)
    // =======================================================================
    if (homeCoords) {
      const el = document.createElement("div");
      el.style.width = "28px";
      el.style.height = "28px";
      el.style.backgroundImage = `url(${basePath}/icons/Blue_Home.png)`;
      el.style.backgroundSize = "contain";
      el.style.cursor = "pointer";

      homeMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat(homeCoords as LngLatLike)
        .setPopup(new mapboxgl.Popup().setHTML(`<b>Home (${homeCoords})</b>`))
        .addTo(mapRef.current!);
    }
  }, [
    geojson,
    selectedCategories,
    selectedStates,
    selectedSuppliers,
    selectedRetailers,
    homeCoords,
  ]);

  // ===========================================================================
  // TRIP ROUTE (not required yet, placeholder)
  // ===========================================================================

  return <div ref={mapContainer} className="w-full h-full" />;
}

export default memo(CertisMap);
