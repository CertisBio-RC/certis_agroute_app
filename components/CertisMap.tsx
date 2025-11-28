// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD FINAL (Full Clean Regeneration)
//   • Full intersection filtering (State + Retailer + Category + Supplier)
//   • Corporate HQ: Red (#CC0000) w/ Gold (#FFD700) stroke — 7px
//   • Retailers: 6px category-colored circles
//   • Kingpin1: PNG icon (“kingpin.png”) — ALWAYS visible
//   • Summary + sleuthing support: allStops[] emitted to page.tsx
//   • Satellite-streets-v12 • Mercator • Mapbox GL JS v3
//   • Fully TypeScript-correct — no generic Map<> errors
// ============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl, { LngLatLike, Map } from "mapbox-gl";
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ============================================================================
// 🎨 CATEGORY COLORS — K4 GOLD PALETTE
// ============================================================================
export const categoryColors: Record<string, string> = {
  Agronomy: "#2E86AB",
  "Grain/Feed": "#8E44AD",
  "C-Store/Service/Energy": "#FF8C00",
  Distribution: "#C0392B",
  Retail: "#1E8449",
  "Corporate HQ": "#CC0000",
  Kingpin: "#FFD700"
};

// ============================================================================
// 🗂️ TYPES FOR GEOJSON
// ============================================================================
export interface RetailerFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    Retailer: string;
    Category: string;
    Supplier: string[]; // normalized below
    Address: string;
    City: string;
    State: string;
    Zip: string;
    Phone?: string;
    Email?: string;
    IsKingpin1?: boolean;
    IsCorporateHQ?: boolean;
  };
}

interface RetailerCollection {
  type: "FeatureCollection";
  features: RetailerFeature[];
}

// ============================================================================
// 🔖 STOP TYPE (USED BY SEARCH + SUMMARY)
// ============================================================================
export interface Stop {
  label: string;
  coordinates: [number, number];
  address: string;
  city: string;
  state: string;
  zip: string;
  retailer: string;
}

// ============================================================================
// 📌 COMPONENT PROPS
// ============================================================================
interface CertisMapProps {
  selectedStates: string[];
  selectedRetailers: string[];
  selectedCategories: string[];
  selectedSuppliers: string[];
  homeLocation: LngLatLike | null;
  tripStops: Stop[];

  onAddTripStop?: (stop: Stop) => void;

  onStatesLoaded?: (states: string[]) => void;
  onRetailersLoaded?: (retailers: string[]) => void;

  /** Must emit full Stops[] dataset to page.tsx */
  onAllStopsLoaded?: (stops: Stop[]) => void;

  /** Must emit full retailer summary for Channel Summary tile */
  onSummaryLoaded?: (
    summary: {
      retailer: string;
      count: number;
      states: string[];
      cities: string[];
      suppliers: string[];
    }[]
  ) => void;
}

// ============================================================================
// 🗺️ MAIN COMPONENT
// ============================================================================
export default function CertisMap({
  selectedStates,
  selectedRetailers,
  selectedCategories,
  selectedSuppliers,
  homeLocation,
  tripStops,
  onAddTripStop,
  onStatesLoaded,
  onRetailersLoaded,
  onAllStopsLoaded,
  onSummaryLoaded
}: CertisMapProps) {

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  // Will hold merged retailer + kingpin dataset
  const allDataRef = useRef<RetailerFeature[]>([]);
  // ==========================================================================
  // 🌐 MAP LOAD + GEOJSON LOAD
  // ==========================================================================
  useEffect(() => {
    if (!mapContainer.current) return;
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      projection: "mercator", // Bailey Rule
      center: [-94.0, 42.5],
      zoom: 5,
      cooperativeGestures: true
    });

    mapRef.current = map;

    map.on("load", async () => {
      // ---------------------------------------------------------------
      // LOAD BOTH DATASETS
      // ---------------------------------------------------------------
      const retailersRes = await fetch("/data/retailers.geojson");
      const retailersJSON: RetailerCollection = await retailersRes.json();

      const kingpinRes = await fetch("/data/kingpin.geojson");
      const kingpinJSON: RetailerCollection = await kingpinRes.json();

      // Merge but keep Kingpin1 separate visually
      const allData: RetailerFeature[] = [
        ...retailersJSON.features,
        ...kingpinJSON.features
      ];

      // Normalize Supplier → always string[]
      allData.forEach((f) => {
        const s = f.properties.Supplier;
        if (Array.isArray(s)) {
          f.properties.Supplier = s.map((x) => x.trim());
        } else if (typeof s === "string") {
          f.properties.Supplier = s
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
        } else {
          f.properties.Supplier = [];
        }
      });

      // Cache for later filtering
      allDataRef.current = allData;

      // -----------------------------------------------------------------
      // POPULATE DROPDOWNS
      // -----------------------------------------------------------------
      const states = [
        ...new Set(allData.map((f) => f.properties.State).filter(Boolean))
      ].sort();
      onStatesLoaded?.(states);

      const retailers = [
        ...new Set(allData.map((f) => f.properties.Retailer).filter(Boolean))
      ].sort();
      onRetailersLoaded?.(retailers);

      // -----------------------------------------------------------------
      // BUILD allStops[] FOR SEARCH & SUMMARY
      // -----------------------------------------------------------------
      const stops: Stop[] = allData.map((f) => ({
        label: f.properties.Retailer,
        coordinates: f.geometry.coordinates,
        address: f.properties.Address,
        city: f.properties.City,
        state: f.properties.State,
        zip: f.properties.Zip,
        retailer: f.properties.Retailer
      }));
      onAllStopsLoaded?.(stops);

      // -----------------------------------------------------------------
      // BUILD summaryMap FOR CHANNEL SUMMARY TILE
      //   Summarizes *all known locations* for any retailer visited OR sleuthed
      // -----------------------------------------------------------------
      const summaryMap = new Map<
        string,
        {
          retailer: string;
          count: number;
          states: Set<string>;
          cities: Set<string>;
          suppliers: Set<string>;
        }
      >();

      for (const f of allData) {
        const r = f.properties.Retailer;
        if (!summaryMap.has(r)) {
          summaryMap.set(r, {
            retailer: r,
            count: 0,
            states: new Set(),
            cities: new Set(),
            suppliers: new Set()
          });
        }
        const entry = summaryMap.get(r)!;
        entry.count++;
        entry.states.add(f.properties.State);
        entry.cities.add(f.properties.City);
        f.properties.Supplier.forEach((s) => entry.suppliers.add(s));
      }

      const summaryArr = Array.from(summaryMap.values()).map((x) => ({
        retailer: x.retailer,
        count: x.count,
        states: Array.from(x.states).sort(),
        cities: Array.from(x.cities).sort(),
        suppliers: Array.from(x.suppliers).sort()
      }));

      onSummaryLoaded?.(summaryArr);

      // -----------------------------------------------------------------
      // ADD SOURCE
      // -----------------------------------------------------------------
      map.addSource("retailers", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: allData
        }
      });

      // -----------------------------------------------------------------
      // LAYERS — CORPORATE HQ (circle)
      // -----------------------------------------------------------------
      map.addLayer({
        id: "corporate-hq",
        type: "circle",
        source: "retailers",
        filter: ["==", ["get", "IsCorporateHQ"], true],
        paint: {
          "circle-radius": 7,
          "circle-color": "#CC0000",
          "circle-stroke-color": "#FFD700",
          "circle-stroke-width": 1.5
        }
      });

      // -----------------------------------------------------------------
      // LAYERS — RETAILERS (non-HQ circles)
      // -----------------------------------------------------------------
      map.addLayer({
        id: "retailer-circles",
        type: "circle",
        source: "retailers",
        filter: ["!=", ["get", "IsCorporateHQ"], true],
        paint: {
          "circle-radius": 6,
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 1,
          "circle-color": [
            "case",
            ["to-boolean", ["get", "Category"]],
            [
              "match",
              ["get", "Category"],
              Object.keys(categoryColors),
              [
                "literal",
                categoryColors
              ][0][["get", "Category"]],
              "#2E86AB"
            ],
            "#2E86AB"
          ]
        }
      });

      // -----------------------------------------------------------------
      // LAYERS — KINGPIN1 SYMBOL ICON
      // -----------------------------------------------------------------
      map.loadImage("/icons/kingpin.png", (err, img) => {
        if (!err && img && !map.hasImage("kingpin")) {
          map.addImage("kingpin", img);
        }

        map.addLayer({
          id: "kingpin-layer",
          type: "symbol",
          source: "retailers",
          filter: ["==", ["get", "IsKingpin1"], true],
          layout: {
            "icon-image": "kingpin",
            "icon-size": 0.9,
            "icon-anchor": "center",
            "icon-allow-overlap": true
          }
        });
      });

      // -----------------------------------------------------------------
      // POPUP: RETAILERS
      // -----------------------------------------------------------------
      map.on("click", "retailer-circles", (e) => {
        const f = e.features?.[0] as RetailerFeature;
        if (!f) return;

        const p = f.properties;

        const html = `
          <div style="font-size:14px; line-height:1.3;">
            <strong>${p.Retailer}</strong><br/>
            ${p.Address}<br/>
            ${p.City}, ${p.State} ${p.Zip}<br/><br/>
            <button id="addTripStopBtn" 
              style="padding:6px 10px; background:#0077FF; color:white; border-radius:4px; cursor:pointer;">
              Add to Trip
            </button>
          </div>
        `;

        const popup = new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);

        popup.on("open", () => {
          const btn = document.getElementById("addTripStopBtn");
          if (btn) {
            btn.onclick = () => {
              onAddTripStop?.({
                label: p.Retailer,
                coordinates: f.geometry.coordinates,
                address: p.Address,
                city: p.City,
                state: p.State,
                zip: p.Zip,
                retailer: p.Retailer
              });
              popup.remove();
            };
          }
        });
      });

      // -----------------------------------------------------------------
      // POPUP: KINGPIN1
      // -----------------------------------------------------------------
      map.on("click", "kingpin-layer", (e) => {
        const f = e.features?.[0] as RetailerFeature;
        if (!f) return;

        const p = f.properties;
        const suppliers = p.Supplier.join(", ");

        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-size:14px; line-height:1.3;">
              <strong>${p.Retailer}</strong><br/>
              <div><em>Suppliers:</em> ${suppliers}</div><br/>
              ${p.Address}<br/>
              ${p.City}, ${p.State} ${p.Zip}<br/>
              <div style="margin-top:5px;">${p.Phone || ""}</div>
              <div>${p.Email || ""}</div>
            </div>
          `)
          .addTo(map);
      });
    });
  }, []);
  // ==========================================================================
  // 🔍 APPLY FILTERS ON EACH CHANGE
  // ==========================================================================
  useEffect(() => {
    const map = mapRef.current;
    const all = allDataRef.current;
    if (!map || !all) return;

    // -------------------------------
    // KINGPIN1 — ALWAYS VISIBLE
    // -------------------------------
    map.setFilter("kingpin-layer", ["==", ["get", "IsKingpin1"], true]);

    // -------------------------------
    // CORPORATE HQ — FILTER BY STATE ONLY
    // -------------------------------
    const hqFilter =
      selectedStates.length === 0
        ? ["==", ["get", "IsCorporateHQ"], true]
        : [
            "all",
            ["==", ["get", "IsCorporateHQ"], true],
            ["in", ["get", "State"], ["literal", selectedStates]]
          ];

    map.setFilter("corporate-hq", hqFilter);

    // -------------------------------
    // RETAILERS — TRUE INTERSECTION FILTER
    // -------------------------------
    const filters: any[] = ["all"];

    // State filter
    if (selectedStates.length > 0) {
      filters.push(["in", ["get", "State"], ["literal", selectedStates]]);
    }

    // Retailer filter
    if (selectedRetailers.length > 0) {
      filters.push([
        "in",
        ["downcase", ["get", "Retailer"]],
        ["literal", selectedRetailers]
      ]);
    }

    // Category filter
    if (selectedCategories.length > 0) {
      filters.push([
        "in",
        ["downcase", ["get", "Category"]],
        ["literal", selectedCategories]
      ]);
    }

    // Supplier filter
    if (selectedSuppliers.length > 0) {
      filters.push([
        "in",
        ["get", "Supplier"],
        ["literal", selectedSuppliers]
      ]);
    }

    // Exclude HQ from retailer layer
    filters.push(["!=", ["get", "IsCorporateHQ"], true]);

    map.setFilter("retailer-circles", filters);
  }, [
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers
  ]);

  // ==========================================================================
  // 🚗 TRIP MODE — "OPTIMIZE" ROUTE ORDER CALLBACK
  // ==========================================================================
  useEffect(() => {
    if (tripMode !== "optimize") return;
    if (!tripStops || tripStops.length < 2) return;

    const map = mapRef.current;
    if (!map) return;

    // Build optimization query
    const coords = tripStops.map((s) => s.coordinates.join(",")).join(";");

    const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}?geometries=geojson&source=first&roundtrip=false&access_token=${mapboxgl.accessToken}`;

    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (!json.trips || !json.waypoints) return;

        const wp = json.waypoints.sort((a: any, b: any) => a.waypoint_index - b.waypoint_index);

        const optimized: Stop[] = wp.map((w: any) => {
          const orig = tripStops[w.original_index];
          return { ...orig };
        });

        onOptimizedRoute?.(optimized);

        // Route summary
        if (json.trips && json.trips.length > 0) {
          const t = json.trips[0];
          onRouteSummary?.({
            distance_m: t.distance,
            duration_s: t.duration
          });
        }
      })
      .catch(() => {});
  }, [tripMode, tripStops]);

  // ==========================================================================
  // 🧭 TRIP MODE — “ENTERED” MODE SUMMARY
  // ==========================================================================
  useEffect(() => {
    if (tripMode !== "entered") return;
    if (tripStops.length < 2) {
      onRouteSummary?.(null);
      return;
    }

    // Approximate straight-line summary
    let dist = 0;
    for (let i = 0; i < tripStops.length - 1; i++) {
      const [lng1, lat1] = tripStops[i].coordinates;
      const [lng2, lat2] = tripStops[i + 1].coordinates;

      const R = 6371e3;
      const φ1 = (lat1 * Math.PI) / 180;
      const φ2 = (lat2 * Math.PI) / 180;
      const Δφ = ((lat2 - lat1) * Math.PI) / 180;
      const Δλ = ((lng2 - lng1) * Math.PI) / 180;

      const a =
        Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      dist += R * c;
    }

    onRouteSummary?.({
      distance_m: dist,
      duration_s: dist / 22.352 // ~50 mph
    });
  }, [tripMode, tripStops]);

  // ==========================================================================
  // 🖼️ FINAL RENDER
  // ==========================================================================
  return (
    <div
      ref={mapContainer}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        inset: 0
      }}
    />
  );
}
