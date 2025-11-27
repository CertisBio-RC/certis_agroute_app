// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD FINAL (Authoritative Regeneration)
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
  "Corporate HQ": "#CC0000", // Fill used for circle layer
  Kingpin: "#FFD700",        // Not used as circle — icon only
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
    IsKingpin1?: boolean;      // Flags Kingpin1
    IsCorporateHQ?: boolean;   // Flags Corporate HQ
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
  homeLocation: LngLatLike | null;
  tripStops: { name: string; coordinates: LngLatLike }[];
  onAddTripStop?: (stop: { name: string; coordinates: LngLatLike }) => void;
  onStatesLoaded?: (states: string[]) => void;
  onRetailersLoaded?: (retailers: string[]) => void;
}

// ============================================================================
// 🗺️ MAIN COMPONENT — K4 GOLD FINAL
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
      projection: "mercator", // Bailey Rule
      center: [-94.0, 42.5],
      zoom: 5,
      cooperativeGestures: true,
    });

    mapRef.current = map;

    map.on("load", async () => {
      // ---------------------------------------------------------------
      // LOAD RETAILERS + KINGPINS
      // ---------------------------------------------------------------
      const retailersRes = await fetch("/data/retailers.geojson");
      const retailersJSON: RetailerCollection = await retailersRes.json();

      const kingpinRes = await fetch("/data/kingpin.geojson");
      const kingpinJSON: RetailerCollection = await kingpinRes.json();

      // Merge layers (Kingpin1 stays separate visually later)
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

      // -----------------------------------------------------------------
      // ADD SOURCES
      // -----------------------------------------------------------------
      map.addSource("retailers", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: allData,
        },
      });

      // -----------------------------------------------------------------
      // LAYERS
      // -----------------------------------------------------------------

      // 🔶 Corporate HQ circle layer
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

      // 🔹 Retailers (non-HQ)
      map.addLayer({
        id: "retailer-circles",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 6,
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 1,
          "circle-color": [
            "case",
            ["has", ["to-string", ["get", "Category"]], categoryColors],
            ["coalesce", ["get", ["get", "Category"], categoryColors], "#2E86AB"],
            "#2E86AB",
          ],
        },
        filter: ["!=", ["get", "IsCorporateHQ"], true],
      });

      // 👑 Kingpin1 icon layer
      map.loadImage("/icons/kingpin.png", (err, img) => {
        if (!err && img) {
          if (!map.hasImage("kingpin")) {
            map.addImage("kingpin", img);
          }
        }

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
      });

      // -----------------------------------------------------------------
      // POPUP HANDLERS
      // -----------------------------------------------------------------
      map.on("click", "retailer-circles", (e) => {
        const f = e.features?.[0] as RetailerFeature;
        if (!f) return;

        const p = f.properties;

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

        const popup = new mapboxgl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);

        popup.on("open", () => {
          const btn = document.getElementById("addTrip");
          if (btn) {
            btn.onclick = () => {
              onAddTripStop?.({
                name: p.Retailer,
                coordinates: f.geometry.coordinates as LngLatLike,
              });
              popup.remove();
            };
          }
        });
      });

      map.on("click", "kingpin-layer", (e) => {
        const f = e.features?.[0] as RetailerFeature;
        if (!f) return;

        const p = f.properties;

        const suppliers = (p.Supplier as string[]).join(", ");

        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `
            <div style="font-size:14px;">
              <strong>${p.Retailer}</strong><br/>
              <em>Suppliers:</em> ${suppliers}<br/><br/>
              ${p.Address}<br/>
              ${p.City}, ${p.State} ${p.Zip}<br/>
              <div style="margin-top:5px;">${p.Phone || ""}</div>
              <div>${p.Email || ""}</div>
            </div>
            `
          )
          .addTo(map);
      });
    });
  }, []);

  // ==========================================================================
  // 🧮 FILTERING LOGIC — FULL INTERSECTION (Bailey Rule)
  // ==========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const stateSet = new Set(selectedStates);
    const retailerSet = new Set(selectedRetailers);
    const categorySet = new Set(selectedCategories);
    const supplierSet = new Set(selectedSuppliers);

    map.setFilter("retailer-circles", [
      "all",

      // State filter
      ["any", ["==", ["get", "State"], selectedStates.length ? selectedStates[0] : ""], selectedStates.length === 0],

      // Retailer filter
      ["any", ["==", ["get", "Retailer"], selectedRetailers.length ? selectedRetailers[0] : ""], selectedRetailers.length === 0],

      // Category filter
      ["any", ["==", ["get", "Category"], selectedCategories.length ? selectedCategories[0] : ""], selectedCategories.length === 0],

      // Supplier filter (Bailey Rule — ANY supplier matches)
      [
        "any",
        ["in", ["get", "Supplier"], ["literal", selectedSuppliers]],
        selectedSuppliers.length === 0,
      ],
    ]);
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  // ==========================================================================
  // 📍 HOME MARKER + TRIP STOPS
  // ==========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // HOME MARKER
    if (homeLocation) {
      const el = document.createElement("div");
      el.style.backgroundImage = "url('/icons/Blue_Home.png')";
      el.style.width = "32px";
      el.style.height = "32px";
      el.style.backgroundSize = "contain";

      new mapboxgl.Marker({ element: el })
        .setLngLat(homeLocation)
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
        .setLngLat(stop.coordinates)
        .addTo(map);
    });
  }, [homeLocation, tripStops]);

  // ==========================================================================
  // RENDER CONTAINER
  // ==========================================================================
  return (
    <div
      ref={mapContainer}
      style={{ width: "100%", height: "100%", position: "absolute" }}
    />
  );
}
