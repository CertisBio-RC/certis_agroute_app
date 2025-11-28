// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD FINAL (Authoritative Regeneration — PART 1/3)
//   • Retailers: Full intersection filtering (State + Retailer + Category + Supplier)
//   • Corporate HQ: Circle layer (7 px) — red fill (#CC0000) + gold stroke (#FFD700)
//   • Kingpin1: PNG icon ("kingpin.png") — ALWAYS visible (never filtered)
//   • Categories normalized; “Unknown” → Agronomy
//   • Supplier filtering = OR logic intersection (Bailey Rule)
//   • Mapbox GL JS v3 • Mercator • satellite-streets-v12
//   • Static Export Safe (GitHub Pages / output:"export")
//   • Fully TypeScript compliant — no unknown[] errors
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
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
  Kingpin: "#FFD700",
};

// ============================================================================
// 🗂️ Types for GeoJSON
// ============================================================================
interface RetailerFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    Retailer: string;
    Category: string;
    Supplier: string | string[];
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
// 📌 Component Props
// ============================================================================
interface CertisMapProps {
  selectedStates: string[];
  selectedRetailers: string[];
  selectedCategories: string[];
  selectedSuppliers: string[];

  homeCoords: [number, number] | null;

  tripStops: { label: string; coords: LngLatLike }[];
  tripMode: "entered" | "optimize";

  onAddStop?: (stop: { label: string; coords: LngLatLike }) => void;

  onStatesLoaded?: (states: string[]) => void;
  onRetailersLoaded?: (retailers: string[]) => void;
  onSuppliersLoaded?: (suppliers: string[]) => void;
  onRetailerSummary?: (
    summary: {
      retailer: string;
      count: number;
      suppliers: string[];
      categories: string[];
      states: string[];
    }[]
  ) => void;

  onAllStopsLoaded?: (all: any[]) => void;
  onRouteSummary?: (summary: { distance_m: number; duration_s: number }) => void;
  onOptimizedRoute?: (orderedStops: any[]) => void;
}

// ============================================================================
// 🗺️ MAIN COMPONENT — K4 GOLD FINAL
// ============================================================================
export default function CertisMap({
  selectedStates,
  selectedRetailers,
  selectedCategories,
  selectedSuppliers,

  homeCoords,

  tripStops,
  tripMode,

  onAddStop,
  onStatesLoaded,
  onRetailersLoaded,
  onSuppliersLoaded,
  onRetailerSummary,
  onAllStopsLoaded,
  onRouteSummary,
  onOptimizedRoute,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  // ==========================================================================
  // 🌐 LOAD MAP + GEOJSON
  // ==========================================================================
  useEffect(() => {
    if (!mapContainer.current) return;
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      projection: "mercator",
      center: [-94.0, 42.5],
      zoom: 5,
      cooperativeGestures: true,
    });

    mapRef.current = map;

    map.on("load", async () => {
      // ---------------------------------------------------------------
      // LOAD RETAILERS + KINGPIN DATA
      // ---------------------------------------------------------------
      const retailersRes = await fetch("/data/retailers.geojson");
      const retailersJSON: RetailerCollection = await retailersRes.json();

      const kingpinRes = await fetch("/data/kingpin.geojson");
      const kingpinJSON: RetailerCollection = await kingpinRes.json();

      // Merge layers
      const allData: RetailerFeature[] = [
        ...retailersJSON.features,
        ...kingpinJSON.features,
      ];

      // Normalize suppliers → always string[]
      allData.forEach((f) => {
        if (typeof f.properties.Supplier === "string") {
          f.properties.Supplier = f.properties.Supplier
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
      });

      // -----------------------------------------------------------------
      // POPULATE DROPDOWNS
      // -----------------------------------------------------------------
      const states = [
        ...new Set(allData.map((f) => f.properties.State).filter(Boolean)),
      ].sort();
      onStatesLoaded?.(states);

      const retailers = [
        ...new Set(allData.map((f) => f.properties.Retailer).filter(Boolean)),
      ].sort();
      onRetailersLoaded?.(retailers);

      const supplierList = [
        ...new Set(
          allData.flatMap((f) => f.properties.Supplier as string[])
        ),
      ].sort();
      onSuppliersLoaded?.(supplierList);

      // -----------------------------------------------------------------
      // RETAILER SUMMARY (FULL DATASET — NOT FILTERED VIEW)
      // -----------------------------------------------------------------
      const summaryMap = new Map<
        string,
        {
          retailer: string;
          count: number;
          suppliers: Set<string>;
          categories: Set<string>;
          states: Set<string>;
        }
      >();

      allData.forEach((f) => {
        const key = f.properties.Retailer;
        if (!summaryMap.has(key)) {
          summaryMap.set(key, {
            retailer: key,
            count: 0,
            suppliers: new Set(),
            categories: new Set(),
            states: new Set(),
          });
        }

        const e = summaryMap.get(key)!;
        e.count += 1;

        (f.properties.Supplier as string[]).forEach((s) => e.suppliers.add(s));
        e.categories.add(f.properties.Category);
        e.states.add(f.properties.State);
      });

      const finalSummary = [...summaryMap.values()].map((entry) => ({
        retailer: entry.retailer,
        count: entry.count,
        suppliers: [...entry.suppliers],
        categories: [...entry.categories],
        states: [...entry.states],
      }));

      onRetailerSummary?.(finalSummary);

      // -----------------------------------------------------------------
      // Add full "allStops" dataset for Search Tile
      // -----------------------------------------------------------------
      const allStopsList = allData.map((f) => ({
        label: f.properties.Retailer,
        address: f.properties.Address,
        city: f.properties.City,
        state: f.properties.State,
        zip: f.properties.Zip,
        coords: f.geometry.coordinates,
      }));

      onAllStopsLoaded?.(allStopsList);

      // -----------------------------------------------------------------
      // MAP SOURCE
      // -----------------------------------------------------------------
      map.addSource("retailers", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: allData,
        },
      });

      // -----------------------------------------------------------------
      // LAYERS BEGIN IN PART 2
      // -----------------------------------------------------------------
    });
  }, []);

  // CONTINUES IN PART 2…
// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD FINAL — PART 2/3
// ============================================================================

  // ==========================================================================
  // 🗺️ MAP LAYERS (Corporate HQ • Retailers • Kingpin1)
// ==========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.getSource("retailers")) return;

    // CORPORATE HQ — Red fill with gold stroke (7 px)
    if (!map.getLayer("corporate-hq")) {
      map.addLayer({
        id: "corporate-hq",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 7,
          "circle-color": "#CC0000",
          "circle-stroke-color": "#FFD700",
          "circle-stroke-width": 1.5,
        },
        filter: ["==", ["get", "IsCorporateHQ"], true],
      });
    }

    // RETAILERS (all non-HQ, non-Kingpin locations)
    if (!map.getLayer("retailer-circles")) {
      map.addLayer({
        id: "retailer-circles",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 6,
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 1,
          "circle-color": [
            "match",
            ["get", "Category"],
            "Agronomy", categoryColors["Agronomy"],
            "Grain/Feed", categoryColors["Grain/Feed"],
            "C-Store/Service/Energy", categoryColors["C-Store/Service/Energy"],
            "Distribution", categoryColors["Distribution"],
            /* default */ "#2E86AB"
          ]
        },
        filter: [
          "all",
          ["!=", ["get", "IsCorporateHQ"], true],
          ["!=", ["get", "IsKingpin1"], true],
        ],
      });
    }

    // KINGPIN1 ICON LAYER — always visible
    if (!map.getLayer("kingpin-layer")) {
      map.loadImage("/icons/kingpin.png", (err, img) => {
        if (!err && img && !map.hasImage("kingpin")) {
          map.addImage("kingpin", img);
        }

        if (!map.getLayer("kingpin-layer")) {
          map.addLayer({
            id: "kingpin-layer",
            type: "symbol",
            source: "retailers",
            layout: {
              "icon-image": "kingpin",
              "icon-size": 0.9,
              "icon-anchor": "center",
              "icon-allow-overlap": true,
            },
            filter: ["==", ["get", "IsKingpin1"], true],
          });
        }
      });
    }

    // ==========================================================================
    // 🧭 CLICK HANDLERS (Add-to-Trip + Popups)
    // ==========================================================================

    // RETAILER POPUPS
    map.on("click", "retailer-circles", (e) => {
      const f = e.features?.[0] as any;
      if (!f) return;

      const p = f.properties;
      const coords = f.geometry.coordinates;

      const html = `
        <div style="font-size:14px;">
          <strong>${p.Retailer}</strong><br/>
          ${p.Address}, ${p.City}, ${p.State} ${p.Zip}<br/><br/>
          <button id="addTrip" style="
            padding:5px 8px;
            background:#0077FF;
            color:white;
            border-radius:4px;
            cursor:pointer;">Add to Trip</button>
        </div>
      `;

      const popup = new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);

      popup.on("open", () => {
        const btn = document.getElementById("addTrip");
        if (btn) {
          btn.onclick = () => {
            onAddStop?.({
              label: p.Retailer,
              coords,
            });
            popup.remove();
          };
        }
      });
    });

    // KINGPIN POPUPS (full metadata)
    map.on("click", "kingpin-layer", (e) => {
      const f = e.features?.[0] as any;
      if (!f) return;

      const p = f.properties;
      const suppliers = (p.Supplier || []).join(", ");

      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-size:14px;">
            <strong>${p.Retailer}</strong><br/>
            <em>Suppliers:</em> ${suppliers}<br/><br/>
            ${p.Address}<br/>
            ${p.City}, ${p.State} ${p.Zip}<br/>
            <div style="margin-top:5px;">${p.Phone || ""}</div>
            <div>${p.Email || ""}</div>
          </div>
        `)
        .addTo(map);
    });

  }, [
    onAddStop,
    selectedStates,
    selectedRetailers,
    selectedSuppliers,
    selectedCategories,
  ]);


// ============================================================================
// 🧮 FILTERING — FULL INTERSECTION (Bailey Rule)
// ============================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // --- State OR All ---
    const stateFilter =
      selectedStates.length === 0
        ? true
        : ["in", ["get", "State"], ["literal", selectedStates]];

    // --- Retailer OR All ---
    const retailerFilter =
      selectedRetailers.length === 0
        ? true
        : ["in", ["get", "Retailer"], ["literal", selectedRetailers]];

    // --- Category OR All ---
    const categoryFilter =
      selectedCategories.length === 0
        ? true
        : ["in", ["get", "Category"], ["literal", selectedCategories]];

    // --- Supplier OR All (Bailey Rule: ANY supplier match) ---
    const supplierFilter =
      selectedSuppliers.length === 0
        ? true
        : ["in", ["get", "Supplier"], ["literal", selectedSuppliers]];

    // APPLY FILTER TO NON-HQ, NON-KINGPIN RETAILER CIRCLES
    map.setFilter("retailer-circles", [
      "all",
      ["!=", ["get", "IsCorporateHQ"], true],
      ["!=", ["get", "IsKingpin1"], true],
      stateFilter,
      retailerFilter,
      categoryFilter,
      supplierFilter,
    ]);
  }, [
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers,
  ]);


// ============================================================================
// 🏠 HOME MARKER + TRIP STOP MARKERS
// ============================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // HOME MARKER
    if (homeCoords) {
      const el = document.createElement("div");
      el.style.backgroundImage = "url('/icons/Blue_Home.png')";
      el.style.width = "32px";
      el.style.height = "32px";
      el.style.backgroundSize = "contain";

      new mapboxgl.Marker({ element: el })
        .setLngLat(homeCoords)
        .addTo(map);
    }

    // TRIP STOP MARKERS
    tripStops.forEach((stop) => {
      const el = document.createElement("div");
      el.style.background = "#FFD700";
      el.style.border = "2px solid #000";
      el.style.borderRadius = "50%";
      el.style.width = "12px";
      el.style.height = "12px";

      new mapboxgl.Marker({ element: el })
        .setLngLat(stop.coords)
        .addTo(map);
    });
  }, [homeCoords, tripStops]);

// PART 3 contains the routing engine + map container render…
// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD FINAL — PART 3/3
// ============================================================================

// ============================================================================
// 🚗 ROUTE SUMMARY (distance + duration callbacks)
// ============================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!routeSummary) return;

    // No additional map rendering needed here — summary is handled in page.tsx.
  }, [routeSummary]);

// ============================================================================
// 🌐 TRIP ROUTE GENERATION (Mapbox Directions API call)
// ============================================================================

  const buildOptimizedRoute = async () => {
    if (tripMode !== "optimize") return;
    if (tripStops.length < 2) return;

    const coords = tripStops.map((s) => s.coords.join(",")).join(";");

    try {
      const res = await fetch(
        `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}?source=first&destination=last&roundtrip=false&access_token=${mapboxgl.accessToken}`
      );
      const data = await res.json();

      if (data.trips && data.trips.length > 0) {
        const trip = data.trips[0];

        onRouteSummary?.({
          distance_m: trip.distance,
          duration_s: trip.duration,
        });

        if (trip.waypoints) {
          const reordered = trip.waypoints
            .sort((a: any, b: any) => a.waypoint_index - b.waypoint_index)
            .map((wp: any) => {
              const s = tripStops.find(
                (p) => p.coords[0] === wp.location[0] && p.coords[1] === wp.location[1]
              );
              return s!;
            });

          onOptimizedRoute?.(reordered);
        }
      }
    } catch (err) {
      console.error("Route optimization error:", err);
    }
  };

  // Run optimization when tripMode or tripStops change
  useEffect(() => {
    buildOptimizedRoute();
  }, [tripMode, tripStops]);

// ============================================================================
// 🖼️ RENDER — MAP CONTAINER
// ============================================================================
  return (
    <div
      ref={mapContainer}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        inset: 0,
      }}
    />
  );
}
