// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD FINAL (Dec 2025 Full Regeneration)
//   • Retailers: Intersection filtering (State + Retailer + Category + Supplier)
//   • Corporate HQ: Filter ONLY by State
//   • Kingpins: NEVER FILTERED — always visible (no state filtering)
//   • Kingpin Marker: PNG icon from /public/icons/kingpin.png
//   • Kingpin Popup: Full block (Retailer → Suppliers → Address → Contact Info)
//   • Retailer Popup: Standard layout unchanged
//   • Mapbox GL JS v3, Mercator, satellite-streets-v12
//   • Static Export Safe for GitHub Pages
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ================================================================
// 🎨 CATEGORY COLORS — Authoritative (Retailer dots only)
// ================================================================
export const categoryColors: Record<string, string> = {
  "Agronomy": "#4CAF50",
  "Distribution": "#2196F3",
  "Grain/Feed": "#FF9800",
  "C-Store/Service/Energy": "#9C27B0",
  "Corporate HQ": "#FF0000",
  "Unknown": "#607D8B"
};

// ================================================================
// 🧭 TYPES
// ================================================================
interface Stop {
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  coords: [number, number];
}

interface CertisMapProps {
  selectedStates: string[];
  selectedRetailers: string[];
  selectedCategories: string[];
  selectedSuppliers: string[];

  homeCoords: [number, number] | null;
  tripStops: Stop[];
  tripMode: "entered" | "optimize";

  onStatesLoaded?: (s: string[]) => void;
  onRetailersLoaded?: (s: string[]) => void;
  onSuppliersLoaded?: (s: string[]) => void;
  onRetailerSummary?: (rows: any[]) => void;
  onAllStopsLoaded?: (rows: Stop[]) => void;

  onAddStop: (s: Stop) => void;
  onRouteSummary?: (s: any) => void;
  onOptimizedRoute?: (coords: any) => void;
}

// ================================================================
// 📌 MAIN COMPONENT
// ================================================================
export default function CertisMap(props: CertisMapProps) {
  const {
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers,

    homeCoords,
    onAddStop,
    onStatesLoaded,
    onRetailersLoaded,
    onSuppliersLoaded,
    onRetailerSummary,
    onAllStopsLoaded
  } = props;

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
      center: [-93, 42],
      zoom: 5,
      projection: "mercator"
    });

    mapRef.current = map;

    map.on("load", async () => {
      // ------------------------------------------------------------
      // LOAD GEOJSON
      // ------------------------------------------------------------
      const retailers = await (await fetch("/data/retailers.geojson")).json();
      const kingpins = await (await fetch("/data/kingpin.geojson")).json();

      const retailerFeatures = retailers.features || [];
      const kingpinFeatures = kingpins.features || [];

      // Feed full rows upward (Search panel list)
      if (onAllStopsLoaded) {
        const all = retailerFeatures.map((f: any) => ({
          label: f.properties.Name,
          address: f.properties.Address,
          city: f.properties.City,
          state: f.properties.State,
          zip: f.properties.Zip,
          coords: f.geometry.coordinates
        }));
        onAllStopsLoaded(all);
      }

      // ------------------------------------------------------------
      // FEED LEFT PANEL FILTER LISTS
      // ------------------------------------------------------------
onStatesLoaded?.(
  Array.from(
    new Set(
      retailerFeatures.map((f: any) =>
        String(f.properties.State || "")
      )
    )
  ) as string[]
);


      onRetailersLoaded?.(
        Array.from(
          new Set(
            retailerFeatures.map((f: any) =>
              String(f.properties.Retailer || "")
            )
          )
        )
          .filter(Boolean)
          .sort()
      );

      onSuppliersLoaded?.(
        Array.from(
          new Set(
            retailerFeatures.flatMap((f: any) =>
              String(f.properties.Supplier || "")
                .split(",")
                .map((s: string) => s.trim())
            )
          )
        )
          .filter(Boolean)
          .sort()
      );

      // ------------------------------------------------------------
      // SUMMARY ROWS
      // ------------------------------------------------------------
      if (onRetailerSummary) {
        const rows = retailerFeatures.map((f: any) => ({
          retailer: f.properties.Retailer || "",
          suppliers: String(f.properties.Supplier || "")
            .split(",")
            .map((x: string) => x.trim())
            .filter(Boolean),
          categories: [f.properties.Category || ""],
          states: [f.properties.State || ""],
          count: 1
        }));
        onRetailerSummary(rows);
      }

      // ------------------------------------------------------------
      // SOURCES
      // ------------------------------------------------------------
      map.addSource("retailers", {
        type: "geojson",
        data: retailers
      });

      map.addSource("kingpins", {
        type: "geojson",
        data: kingpins
      });

      // ------------------------------------------------------------
      // KINGPIN ICON
      // ------------------------------------------------------------
      map.loadImage("/icons/kingpin.png", (err, img) => {
        if (!err && img && !map.hasImage("kingpin-icon")) {
          map.addImage("kingpin-icon", img);
        }
      });

      // ------------------------------------------------------------
      // LAYERS
      // ------------------------------------------------------------

      // **Kingpins — ALWAYS VISIBLE, NO FILTER**
      map.addLayer({
        id: "kingpin-layer",
        type: "symbol",
        source: "kingpins",
        layout: {
          "icon-image": "kingpin-icon",
          "icon-size": 0.58,
          "icon-allow-overlap": true
        }
      });

      // **Corporate HQ — Filter Only by State**
      map.addLayer({
        id: "hq-layer",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 7,
          "circle-color": "#FF0000",
          "circle-stroke-color": "#FFFF00",
          "circle-stroke-width": 1.7
        },
        filter: ["==", ["get", "Category"], "Corporate HQ"]
      });

      // **Retailers — Category-colored dots**
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
          "circle-stroke-width": 0.7
        },
        filter: ["!=", ["get", "Category"], "Corporate HQ"]
      });

      // ============================================================
      // 👍 POPUPS (Retail + Kingpin)
      // ============================================================
      // Retailer Popup (unchanged)
      map.on("click", "retailer-layer", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        const [lng, lat] = f.geometry.coordinates;

        const html = `
          <div style="font-size:14px;">
            <b>${p.Name}</b><br>
            ${p.Address}<br>
            ${p.City}, ${p.State} ${p.Zip}<br>
            <button id="add-ret" style="margin-top:6px;background:#2196F3;color:white;padding:4px 8px;border-radius:4px;">Add to Trip</button>
          </div>
        `;

        const popup = new mapboxgl.Popup().setLngLat([lng, lat]).setHTML(html).addTo(map);

        popup.on("open", () => {
          const btn = document.getElementById("add-ret");
          if (btn) {
            btn.onclick = () => {
              onAddStop({
                label: p.Name,
                address: p.Address,
                city: p.City,
                state: p.State,
                zip: p.Zip,
                coords: [lng, lat]
              });
              popup.remove();
            };
          }
        });
      });

      // Kingpin Popup (final approved layout)
      map.on("click", "kingpin-layer", (e) => {
        const f = e.features?.[0];
        if (!f) return;

        const p = f.properties;
        const [lng, lat] = f.geometry.coordinates;

        const suppliers = String(p.Supplier || "")
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
          .join(", ");

        const html = `
          <div style="font-size:14px;">
            <b>${p.Retailer}</b><br>
            ${suppliers ? `Suppliers: ${suppliers}<br>` : ""}
            ${p.Address}<br>
            ${p.City}, ${p.State} ${p.Zip}<br>
            ${p.ContactName ? `${p.ContactName} — ${p.Title}<br>` : ""}
            ${p.OfficePhone || ""}${p.CellPhone ? " • " + p.CellPhone : ""}${
          p.Email ? " • " + p.Email : ""
        }<br>
            <button id="add-kp" style="margin-top:6px;background:#2196F3;color:white;padding:4px 8px;border-radius:4px;">Add to Trip</button>
          </div>
        `;

        const popup = new mapboxgl.Popup().setLngLat([lng, lat]).setHTML(html).addTo(map);

        popup.on("open", () => {
          const btn = document.getElementById("add-kp");
          if (btn) {
            btn.onclick = () => {
              onAddStop({
                label: p.Retailer,
                address: p.Address,
                city: p.City,
                state: p.State,
                zip: p.Zip,
                coords: [lng, lat]
              });
              popup.remove();
            };
          }
        });
      });
    });

    return () => map.remove();
  }, []);
  // ========================================================================
  // 🔄 FILTER + STYLE UPDATE EFFECT
  // ========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Ensure layers exist before filtering
    if (
      !map.getLayer("retailer-layer") ||
      !map.getLayer("hq-layer") ||
      !map.getLayer("kingpin-layer")
    ) {
      return;
    }

    // ================================================================
    // 1️⃣ BUILD FILTERS FOR RETAILERS (FULL INTERSECTION)
    // ================================================================

    // --- State ---
    const stateFilter =
      selectedStates.length > 0
        ? ["in", ["get", "State"], ["literal", selectedStates]]
        : true;

    // --- Retailer ---
    const retailerFilter =
      selectedRetailers.length > 0
        ? ["in", ["get", "Retailer"], ["literal", selectedRetailers]]
        : true;

    // --- Category ---
    const categoryFilter =
      selectedCategories.length > 0
        ? ["in", ["get", "Category"], ["literal", selectedCategories]]
        : true;

    // --- Supplier ---
    const supplierFilter =
      selectedSuppliers.length > 0
        ? [
            "in",
            [
              "get",
              "Supplier" // comma-separated list in retailerFeatures
            ],
            ["literal", selectedSuppliers]
          ]
        : true;

    // --- MERGE ALL (Intersection) ---
    const retailerCombined = ["all"];

    if (stateFilter !== true) retailerCombined.push(stateFilter);
    if (retailerFilter !== true) retailerCombined.push(retailerFilter);
    if (categoryFilter !== true) retailerCombined.push(categoryFilter);
    if (supplierFilter !== true) retailerCombined.push(supplierFilter);

    // If empty -> match all retailers (except HQ)
    if (retailerCombined.length === 1) {
      retailerCombined.push(["!=", ["get", "Category"], "Corporate HQ"]);
    } else {
      retailerCombined.push(["!=", ["get", "Category"], "Corporate HQ"]);
    }

    // ================================================================
    // 2️⃣ CORPORATE HQ — FILTER ONLY BY STATE (IF ANY)
    // ================================================================
    let hqFilter: any = ["==", ["get", "Category"], "Corporate HQ"];

    if (selectedStates.length > 0) {
      hqFilter = [
        "all",
        ["==", ["get", "Category"], "Corporate HQ"],
        ["in", ["get", "State"], ["literal", selectedStates]]
      ];
    }

    // ================================================================
    // 3️⃣ KINGPINS — NO FILTER (Always Visible)
    // ================================================================
    const kingpinFilter: any = true; // DO NOT TOUCH — confirmed rule

    // Apply Filters
    map.setFilter("retailer-layer", retailerCombined as any);
    map.setFilter("hq-layer", hqFilter as any);
    map.setFilter("kingpin-layer", kingpinFilter as any);

    // Done
  }, [
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers
  ]);

  // ========================================================================
  // 🏠 HOME MARKER (Blue Pin)
  // ========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove any existing marker
    (map as any).__homeMarker?.remove();

    if (!homeCoords) return;

    const el = document.createElement("div");
    el.style.width = "22px";
    el.style.height = "22px";
    el.style.backgroundImage = "url(/icons/Blue_Home.png)";
    el.style.backgroundSize = "contain";

    const marker = new mapboxgl.Marker(el)
      .setLngLat(homeCoords as LngLatLike)
      .addTo(map);

    (map as any).__homeMarker = marker;
  }, [homeCoords]);

  // ========================================================================
  // 🧭 ROUTE BUILDER (Map as Entered / Optimize)
  // ========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // For static-export, routing is disabled unless coordinates are provided.
    // The user can copy/paste into Google Maps.
    // (Your future enhancement will re-enable Mapbox DirectionsAPI.)
  }, []);
  // ========================================================================
  // 📍 CLICK → ADD TO TRIP
  // ========================================================================
  const handleAddToTrip = (feature: any) => {
    const coords = feature.geometry.coordinates;
    const name = feature.properties.Retailer || feature.properties.Name;
    onAddToTrip?.({ coords, name });
  };

  // ========================================================================
  // 🧩 POPUP BUILDER (Retailers, HQ, Kingpins)
  // ========================================================================
  const buildPopupHTML = (props: any) => {
    const isKingpin = props.Category === "Kingpin";

    if (isKingpin) {
      // KINGPIN FORMAT (strictly confirmed by you)
      return `
        <div style="font-family: Arial; font-size: 13px; line-height: 1.35;">
          <b>${props.Retailer || ""}</b><br/>
          ${props.Supplier ? `<i>${props.Supplier}</i><br/>` : ""}
          ${props.Address || ""}<br/>
          ${props.City || ""}, ${props.State || ""} ${props.Zip || ""}<br/>
          ${props.ContactName || ""}${
        props.Title ? ` – ${props.Title}` : ""
      }<br/>
          ${props.OfficePhone || ""}${
        props.CellPhone ? `, ${props.CellPhone}` : ""
      }<br/>
          ${props.Email || ""}
        </div>
      `;
    }

    // RETAILER / HQ FORMAT (existing)
    return `
      <div style="font-family: Arial; font-size: 13px; line-height: 1.35;">
        <b>${props.Retailer || ""}</b><br/>
        ${props.Address || ""}<br/>
        ${props.City || ""}, ${props.State || ""} ${props.Zip || ""}<br/>
        ${props.Supplier ? `<i>${props.Supplier}</i><br/>` : ""}
      </div>
    `;
  };

  // ========================================================================
  // ✨ FINAL RENDER BLOCK
  // ========================================================================
  return (
    <div
      ref={mapContainer}
      className="w-full h-full border-t border-gray-400"
    />
  );
}

// ========================================================================
// 🔚 END — CertisMap.tsx (FULL REGENERATION, PART 3 of 3)
// ========================================================================
