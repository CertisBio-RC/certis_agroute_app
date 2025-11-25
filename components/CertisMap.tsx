// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD (Full Regeneration)
//   • Retailers = circle layers by Category (Bailey Mint Green for Agronomy)
//   • Kingpins = Separate Symbol Layer (kingpin.png), always visible
//   • Satellite-streets-v12, Mercator, Mapbox GL JS v3
//   • In-memory intersection filtering (Phase A.27b restored)
//   • Popup A restored, Add-to-Trip intact, Supplier lists normalized
// ============================================================================

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl, { LngLatLike, Map, Popup } from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ============================================================================
// 🎨 CATEGORY COLORS — Mint Green for Agronomy (white outline)
// ============================================================================
export const categoryColors: Record<string, { fill: string; stroke: string }> = {
  Agronomy: { fill: "#5CFF7A", stroke: "#FFFFFF" }, // Mint green + white outline
  "Grain/Feed": { fill: "#FFD166", stroke: "#000000" },
  "C-Store/Service/Energy": { fill: "#D1603D", stroke: "#000000" },
  Distribution: { fill: "#6C63FF", stroke: "#000000" },
  "Corporate HQ": { fill: "#4CC9F0", stroke: "#000000" },
  Unknown: { fill: "#999999", stroke: "#000000" }
};

// ============================================================================
// 📍 MARKER SIZES
// ============================================================================
const RETAILER_MARKER_RADIUS = 6;
const HQ_MARKER_RADIUS = 7;
const KINGPIN_ICON_SIZE = 0.65; // kingpin star PNG scaled

// ============================================================================
// 🔧 UTILITY — Normalize Categories (remove brackets, split CSV)
// ============================================================================
function normalizeCategory(cat: string | string[] | null | undefined): string[] {
  if (!cat) return ["Unknown"];
  if (Array.isArray(cat)) return cat.map((c) => c.trim());
  return cat
    .replace(/\[|\]/g, "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

// ============================================================================
// 🔧 UTILITY — Build popup HTML for Retailers
// ============================================================================
function buildRetailerPopupHTML(props: any): string {
  const {
    Retailer,
    Name,
    Address,
    City,
    State,
    Zip,
    Category,
    Suppliers
  } = props;

  const cats = normalizeCategory(Category).join(", ");
  const suppliers = (Suppliers || []).join(", ");

  return `
    <div class="popup-container">
      <h3 class="popup-title">${Retailer || Name || "Unknown"}</h3>
      <div class="popup-line">${Address || ""}</div>
      <div class="popup-line">${City || ""}, ${State || ""} ${Zip || ""}</div>
      <div class="popup-line"><strong>Category:</strong> ${cats}</div>
      <div class="popup-line"><strong>Supplier:</strong> ${suppliers}</div>
    </div>
  `;
}

// ============================================================================
// 🔧 UTILITY — Build popup HTML for Kingpins
//   • NEVER show category brackets
//   • ALWAYS show contact list under Suppliers line
//   • Retailer title comes from retailer.geojson if available
// ============================================================================
function buildKingpinPopupHTML(props: any): string {
  const {
    Retailer,
    Address,
    City,
    State,
    Zip,
    Suppliers,
    Contacts
  } = props;

  const suppliers = (Suppliers || []).join(", ");

  const contactHTML = (Contacts || [])
    .map((c: any) => {
      return `
        <div class="popup-contact-block">
          <div class="popup-contact-name">${c.Name || ""}</div>
          <div class="popup-contact-title">${c.Title || ""}</div>
          <div class="popup-contact-phone">${c.Phone || ""}</div>
          <div class="popup-contact-cell">${c.Cell || ""}</div>
          <div class="popup-contact-email">${c.Email || ""}</div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="popup-container">
      <h3 class="popup-title">${Retailer || "Remote Location"}</h3>
      <div class="popup-line">${Address || ""}</div>
      <div class="popup-line">${City || ""}, ${State || ""} ${Zip || ""}</div>
      <div class="popup-line"><strong>Supplier:</strong> ${suppliers}</div>

      <div class="popup-section-header">Contacts</div>
      ${contactHTML}
    </div>
  `;
}

// ============================================================================
// COMPONENT START
// ============================================================================
const CertisMap = ({
  selectedStates,
  selectedRetailers,
  selectedCategories,
  selectedSuppliers,
  onStatesLoaded,
  onRetailersLoaded,
  onCategoriesLoaded,
  onSuppliersLoaded,
  tripStops,
  onAddToTrip,
  tripMode,
  onOptimizedRoute
}: any) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  // GeoJSON state
  const [retailersData, setRetailersData] = useState<any>(null);
  const [kingpinData, setKingpinData] = useState<any>(null);

  // ========================================================================
  // LOAD GEOJSON (retailers + kingpins)
  // ========================================================================
  useEffect(() => {
    async function loadData() {
      const retailersRes = await fetch("/data/retailers.geojson");
      const retailersJson = await retailersRes.json();
      setRetailersData(retailersJson);

      const kingpinRes = await fetch("/data/kingpin.geojson");
      const kingpinJson = await kingpinRes.json();
      setKingpinData(kingpinJson);

      // Populate UI dropdowns
      const features = retailersJson.features || [];

      onStatesLoaded?.(
        [...new Set(features.map((f: any) => String(f.properties.State || "")))]
          .filter(Boolean)
          .sort()
      );

      onRetailersLoaded?.(
        [...new Set(features.map((f: any) => f.properties.Retailer || ""))]
          .filter(Boolean)
          .sort()
      );

      onCategoriesLoaded?.(
        [...new Set(
          features
            .map((f: any) => normalizeCategory(f.properties.Category))
            .flat()
        )]
          .filter(Boolean)
          .sort()
      );

      onSuppliersLoaded?.(
        [...new Set(
          features
            .map((f: any) => (f.properties.Suppliers || []))
            .flat()
        )]
          .filter(Boolean)
          .sort()
      );
    }

    loadData();
  }, []);

  // ========================================================================
  // INITIALIZE MAP ONLY ONCE
  // ========================================================================
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 42.0],
      zoom: 6,
      pitch: 0,
      bearing: 0,
      projection: "mercator"
    });

    mapRef.current = map;

    map.on("load", () => {
      // Add Retailers source
      map.addSource("retailers", {
        type: "geojson",
        data: retailersData || {
          type: "FeatureCollection",
          features: []
        }
      });

      // Add Kingpins source
      map.addSource("kingpins", {
        type: "geojson",
        data: kingpinData || {
          type: "FeatureCollection",
          features: []
        }
      });

      // =====================================================
      // RETAILER CIRCLE LAYERS (by Category)
      // =====================================================
      Object.keys(categoryColors).forEach((cat) => {
        const id = `retailer-${cat}`;

        map.addLayer({
          id,
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": [
              "case",
              ["==", ["get", "Category"], "Corporate HQ"],
              HQ_MARKER_RADIUS,
              RETAILER_MARKER_RADIUS
            ],
            "circle-color": categoryColors[cat].fill,
            "circle-stroke-color": categoryColors[cat].stroke,
            "circle-stroke-width": 1.5
          },
          filter: ["in", cat, ["get", "Category"]]
        });
      });

      // =====================================================
      // KINGPIN SYMBOL LAYER (ALWAYS VISIBLE)
      // =====================================================
      map.loadImage("/icons/kingpin.png", (err, image) => {
        if (err || !image) return;

        if (!map.hasImage("kingpin-icon")) {
          map.addImage("kingpin-icon", image, { sdf: false });
        }

        map.addLayer({
          id: "kingpin-layer",
          type: "symbol",
          source: "kingpins",
          layout: {
            "icon-image": "kingpin-icon",
            "icon-size": KINGPIN_ICON_SIZE,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true
          }
        });
      });
    });
  }, [retailersData, kingpinData]);

// ============================================================================
// END PART 1
// ============================================================================

// ============================================================================
// PART 2 — Filtering Logic, Source Updating, and Popup Handling
// ============================================================================

// ============================================================================
// 🔍 APPLY FILTERS (in-memory intersection logic — Kingpins NEVER filtered)
// ============================================================================
const applyRetailerFilters = useCallback(() => {
  const map = mapRef.current;
  if (!map || !retailersData) return;

  const rawFeatures = retailersData.features || [];

  const filtered = rawFeatures.filter((f: any) => {
    const p = f.properties;

    // STATE filter
    if (selectedStates.length && !selectedStates.includes(p.State)) return false;

    // RETAILER filter
    if (selectedRetailers.length && !selectedRetailers.includes(p.Retailer)) return false;

    // CATEGORY filter
    const cats = normalizeCategory(p.Category);
    if (selectedCategories.length && !cats.some((c: string) => selectedCategories.includes(c))) {
      return false;
    }

    // SUPPLIER filter
    const sups = p.Suppliers || [];
    if (selectedSuppliers.length && !sups.some((s: string) => selectedSuppliers.includes(s))) {
      return false;
    }

    return true;
  });

  const filteredCollection = {
    type: "FeatureCollection",
    features: filtered
  };

  // Update the retailers source with filtered GeoJSON
  if (map.getSource("retailers")) {
    (map.getSource("retailers") as mapboxgl.GeoJSONSource).setData(filteredCollection);
  }
}, [
  retailersData,
  selectedStates,
  selectedRetailers,
  selectedCategories,
  selectedSuppliers
]);

// ============================================================================
// 📌 APPLY FILTERS WHEN ANY SELECTION UPDATES
// ============================================================================
useEffect(() => {
  applyRetailerFilters();
}, [applyRetailerFilters]);

// ============================================================================
// 🧹 CLEAR EXISTING POPUP
// ============================================================================
const closePopup = () => {
  if (popupRef.current) {
    popupRef.current.remove();
    popupRef.current = null;
  }
};

// ============================================================================
// 🖱 HANDLE CLICK EVENTS FOR RETAILERS + KINGPINS
// ============================================================================
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  const handleRetailerClick = (e: mapboxgl.MapMouseEvent & mapboxgl.EventData) => {
    closePopup();

    const feature = e.features?.[0];
    if (!feature) return;

    const html = buildRetailerPopupHTML(feature.properties);

    popupRef.current = new mapboxgl.Popup({ closeButton: true })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
  };

  const handleKingpinClick = (e: mapboxgl.MapMouseEvent & mapboxgl.EventData) => {
    closePopup();

    const feature = e.features?.[0];
    if (!feature) return;

    const html = buildKingpinPopupHTML(feature.properties);

    popupRef.current = new mapboxgl.Popup({ closeButton: true })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
  };

  // Attach events for each retailer category layer
  Object.keys(categoryColors).forEach((cat) => {
    const layerId = `retailer-${cat}`;
    if (map.getLayer(layerId)) {
      map.on("click", layerId, handleRetailerClick);
      map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
    }
  });

  // Attach events for kingpins (single layer)
  if (map.getLayer("kingpin-layer")) {
    map.on("click", "kingpin-layer", handleKingpinClick);
    map.on("mouseenter", "kingpin-layer", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "kingpin-layer", () => (map.getCanvas().style.cursor = ""));
  }

  return () => {
    // Cleanup click handlers
    Object.keys(categoryColors).forEach((cat) => {
      const layerId = `retailer-${cat}`;
      if (map.getLayer(layerId)) {
        map.off("click", layerId, handleRetailerClick);
      }
    });
    if (map.getLayer("kingpin-layer")) {
      map.off("click", "kingpin-layer", handleKingpinClick);
    }
  };
}, [retailersData, kingpinData]);

// ============================================================================
// 🏠 HOME MARKER — Blue Home Icon
// ============================================================================
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  // Remove existing
  if (homeMarker.current) {
    homeMarker.current.remove();
    homeMarker.current = null;
  }

  if (!props.homeCoords) return;

  // Add new home marker
  const el = document.createElement("div");
  el.style.backgroundImage = "url('/icons/Blue_Home.png')";
  el.style.backgroundSize = "contain";
  el.style.width = "32px";
  el.style.height = "32px";

  homeMarker.current = new mapboxgl.Marker({ element: el })
    .setLngLat(props.homeCoords)
    .addTo(map);
}, [props.homeCoords]);

// ============================================================================
// END PART 2
// ============================================================================

// ============================================================================
// PART 3 — BUILD POPUP HTML + ROUTE BUILDER SUPPORT
// ============================================================================

// ============================================================================
// 📌 BUILD RETAILER POPUP (NO BRACKETS, CATEGORIES AS CLEAN LIST)
// ============================================================================
function buildRetailerPopupHTML(p: any): string {
  const categories = normalizeCategory(p.Category).join(", ");

  const supplierLine =
    p.Suppliers && p.Suppliers.length
      ? `<div class="popup-line"><strong>Suppliers:</strong> ${p.Suppliers.join(", ")}</div>`
      : `<div class="popup-line"><strong>Suppliers:</strong> None listed</div>`;

  return `
    <div class="popup">
      <div class="popup-title">${p.Retailer || p.Name || "Unknown Retailer"}</div>
      <div class="popup-line">${p.Address || ""}</div>
      <div class="popup-line">${p.City || ""}, ${p.State || ""} ${p.Zip || ""}</div>

      <div class="popup-line"><strong>Category:</strong> ${categories}</div>
      ${supplierLine}

      <button id="add-stop-btn" class="popup-btn">Add to Trip</button>
    </div>
  `;
}

// ============================================================================
// ⭐ BUILD KINGPIN POPUP (NO CATEGORY LINE — CONTACTS ONLY)
// ============================================================================
function buildKingpinPopupHTML(p: any): string {
  const retailerName =
    p.RETAILER && p.RETAILER.trim() !== "" ? p.RETAILER : "Remote Location";

  const addressLine =
    p.ADDRESS && p.ADDRESS.trim() !== ""
      ? `<div class="popup-line">${p.ADDRESS}</div>`
      : `<div class="popup-line">No physical address provided</div>`;

  const cityState =
    p.CITY || p.STATE
      ? `<div class="popup-line">${p.CITY || ""}, ${p.STATE || ""}</div>`
      : "";

  const contacts = [];

  if (p.CONTACT1) contacts.push(formatKingpinContact(p.CONTACT1));
  if (p.CONTACT2) contacts.push(formatKingpinContact(p.CONTACT2));
  if (p.CONTACT3) contacts.push(formatKingpinContact(p.CONTACT3));

  const contactsHTML =
    contacts.length > 0
      ? contacts.join("<hr class='popup-sep'/>")
      : "<div class='popup-line'>No contacts listed</div>";

  return `
    <div class="popup">
      <div class="popup-title">${retailerName}</div>
      ${addressLine}
      ${cityState}

      <div class="popup-subtitle">Key Contacts</div>
      ${contactsHTML}

      <button id="add-stop-btn" class="popup-btn">Add to Trip</button>
    </div>
  `;
}

// ============================================================================
// 📞 FORMAT KINGPIN CONTACT BLOCK
// ============================================================================
function formatKingpinContact(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  return `
    <div class="popup-contact">
      ${lines.map((l) => `<div>${l}</div>`).join("")}
    </div>
  `;
}

// ============================================================================
// ➕ ADD STOP EVENT LISTENER FOR POPUPS
// ============================================================================
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  const handleClick = (e: any) => {
    if (e.target?.id === "add-stop-btn" && popupRef.current) {
      const popupFeature = popupRef.current._content?.featureProps;
      if (popupFeature && onAddStop) {
        onAddStop({
          label: popupFeature.Retailer || popupFeature.Name || "Stop",
          address: popupFeature.Address || "",
          coords: popupFeature.coords,
          city: popupFeature.City,
          state: popupFeature.State,
          zip: popupFeature.Zip
        });
      }
      popupRef.current.remove();
    }
  };

  document.addEventListener("click", handleClick);

  return () => document.removeEventListener("click", handleClick);
}, [onAddStop]);

// ============================================================================
// 🛣 ROUTE BUILDER — OPTIMIZED VS ENTERED ORDER
// ============================================================================
useEffect(() => {
  const map = mapRef.current;
  if (!map || !tripStops || tripStops.length < 2) {
    onRouteSummary?.(null);
    return;
  }

  if (tripMode === "entered") {
    // Simple polyline: follow user-entered order
    const coords = tripStops.map((s) => s.coords);
    drawRoute(coords);
    summarizeRoute(coords);
  } else {
    // Optimized route placeholder (real OSRM optional)
    const coords = tripStops.map((s) => s.coords);
    const optimized = [...coords].sort((a, b) => a[0] - b[0]); // trivial placeholder
    drawRoute(optimized);
    summarizeRoute(optimized);
    onOptimizedRoute?.(tripStops);
  }
}, [tripStops, tripMode]);

// ============================================================================
// 🗺 DRAW ROUTE POLYLINE
// ============================================================================
function drawRoute(coords: [number, number][]) {
  const map = mapRef.current;
  if (!map) return;

  if (map.getSource("route-source")) {
    (map.getSource("route-source") as mapboxgl.GeoJSONSource).setData({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords }
    });
  } else {
    map.addSource("route-source", {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords }
      }
    });

    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route-source",
      paint: {
        "line-color": "#00BFFF",
        "line-width": 4
      }
    });
  }
}

// ============================================================================
// 📏 SUMMARIZE ROUTE DISTANCE + DURATION (simple haversine)
// ============================================================================
function summarizeRoute(coords: [number, number][]) {
  if (coords.length < 2) {
    onRouteSummary?.(null);
    return;
  }

  let totalDist = 0;
  for (let i = 1; i < coords.length; i++) {
    totalDist += haversine(coords[i - 1], coords[i]);
  }

  const avgSpeedMps = 22; // ≈50 mph
  const duration = totalDist / avgSpeedMps;

  onRouteSummary?.({ distance_m: totalDist, duration_s: duration });
}

// ============================================================================
// 🌎 HAVERSINE
// ============================================================================
function haversine(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

// ============================================================================
// END PART 3
// ============================================================================

// ============================================================================
// PART 4 — FINALIZE MARKERS, FILTER LOGIC, AND RENDER
// ============================================================================

// ============================================================================
// 🎛 APPLY FILTERS (Retailers only — Kingpins ALWAYS visible)
// ============================================================================
const applyFilters = useCallback(() => {
  const map = mapRef.current;
  if (!map || !masterFeatures.current.length) return;

  // Filter retailers only
  const filteredRetailers = masterFeatures.current.filter((f: any) => {
    const isKingpin = f.properties.ParsedCategories.includes("Kingpin");
    if (isKingpin) return true; // Kingpins IMMUNE to filters

    const p = f.properties;

    // State filter
    if (selectedStates.length > 0 && !selectedStates.includes(p.State)) return false;

    // Category filter
    if (selectedCategories.length > 0) {
      const match = p.ParsedCategories.some((c: string) =>
        selectedCategories.includes(c)
      );
      if (!match) return false;
    }

    // Retailer filter
    if (selectedRetailers.length > 0) {
      if (!selectedRetailers.includes(p.Retailer)) return false;
    }

    // Suppliers filter
    if (selectedSuppliers.length > 0) {
      const suppliers = parseSuppliers(p.Suppliers || []);
      const match = suppliers.some((s) => selectedSuppliers.includes(s));
      if (!match) return false;
    }

    return true;
  });

  // Update the map source
  const src = map.getSource("retailers") as mapboxgl.GeoJSONSource;
  if (src) {
    src.setData({
      type: "FeatureCollection",
      features: filteredRetailers,
    });
  }
}, [
  selectedStates,
  selectedCategories,
  selectedSuppliers,
  selectedRetailers,
]);

useEffect(() => {
  applyFilters();
}, [applyFilters]);

// ============================================================================
// 📍 ADD CLICK HANDLERS FOR POPUPS (Retailers & Kingpin)
// ============================================================================
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  function handlePopup(e: any, feature: any, coords: any) {
    const p = feature.properties || {};
    p.coords = coords;

    let html;

    if (p.ParsedCategories?.includes("Kingpin")) {
      html = buildKingpinPopupHTML(p);
    } else {
      html = buildRetailerPopupHTML(p);
    }

    if (popupRef.current) popupRef.current.remove();

    const popup = new mapboxgl.Popup({ closeButton: true, maxWidth: "300px" })
      .setLngLat(coords)
      .setHTML(html)
      .addTo(map);

    popup._content.featureProps = p;
    popupRef.current = popup;
  }

  // Retailer click
  map.on("click", "retailer-circles", (e: any) => {
    const f = e.features[0];
    const coords = f.geometry.coordinates.slice();
    handlePopup(e, f, coords);
  });

  // Kingpin click
  map.on("click", "kingpin-symbols", (e: any) => {
    const f = e.features[0];
    const coords = f.geometry.coordinates.slice();
    handlePopup(e, f, coords);
  });

  return () => {
    map.off("click", "retailer-circles", () => {});
    map.off("click", "kingpin-symbols", () => {});
  };
}, []);

// ============================================================================
// 🏠 HOME MARKER (Blue House Icon)
// ============================================================================
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  if (homeMarker.current) {
    homeMarker.current.remove();
    homeMarker.current = null;
  }

  if (!homeCoords) return;

  const el = document.createElement("div");
  el.style.width = "28px";
  el.style.height = "28px";
  el.style.backgroundImage = `url("${basePath}/icons/home_blue.png")`;
  el.style.backgroundSize = "contain";

  homeMarker.current = new mapboxgl.Marker(el)
    .setLngLat(homeCoords)
    .addTo(map);
}, [homeCoords]);

// ============================================================================
// 🎨 INITIALIZE LAYERS (FINISH FROM PART 2)
// ============================================================================
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  if (!map.getLayer("retailer-circles")) {
    map.addLayer({
      id: "retailer-circles",
      type: "circle",
      source: "retailers",
      paint: {
        "circle-radius": 6,
        "circle-color": [
          "match",
          ["get", "PrimaryCategory"],
          "Agronomy", categoryColors.Agronomy.color,
          "Grain/Feed", categoryColors["Grain/Feed"].color,
          "C-Store/Service/Energy", categoryColors["C-Store/Service/Energy"].color,
          "Distribution", categoryColors.Distribution.color,
          "Corporate HQ", categoryColors["Corporate HQ"].color,
          "#888888"
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": [
          "match",
          ["get", "PrimaryCategory"],
          "Agronomy", categoryColors.Agronomy.outline,
          "C-Store/Service/Energy", categoryColors["C-Store/Service/Energy"].outline,
          "Corporate HQ", categoryColors["Corporate HQ"].outline,
          "#FFFFFF"
        ],
      },
    });
  }

  if (!map.getLayer("kingpin-symbols")) {
    map.addLayer({
      id: "kingpin-symbols",
      type: "symbol",
      source: "retailers",
      filter: ["==", ["get", "PrimaryCategory"], "Kingpin"],
      layout: {
        "icon-image": "kingpin-star",
        "icon-size": 0.26,
        "icon-allow-overlap": true,
      },
    });
  }
}, [categoryColors]);

// ============================================================================
// 📦 LOAD KINGPIN PNG ICON
// ============================================================================
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  map.loadImage(`${basePath}/icons/kingpin.png`, (err, image) => {
    if (!err && image && !map.hasImage("kingpin-star")) {
      map.addImage("kingpin-star", image);
    }
  });
}, []);

// ============================================================================
// 📌 FINAL COMPONENT RENDER
// ============================================================================
return (
  <div
    ref={mapContainer}
    style={{
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      bottom: 0,
    }}
  />
);
}

// ============================================================================
// END OF FILE (PART 4 / 4 COMPLETE)
// ============================================================================
