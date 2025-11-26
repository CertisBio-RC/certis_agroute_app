// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD (Final Category, Marker, Kingpin & Filtering)
//   • Retailers.geojson (filterable layer) — categories, suppliers, states
//   • Kingpin.geojson (independent layer) — always visible, blue star marker
//   • In-memory intersection filtering (Phase A.27b restored)
//   • Mapbox GL JS v3 — Satellite Streets v12 — Mercator (Bailey-Locked)
//   • Exports: Stop, categoryColors, CertisMap (default)
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike, Map, Marker, Popup, GeoJSONSource } from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ================================================================
// 🎨 FINAL CATEGORY COLORS — K4 GOLD (Bailey Locked)
// ================================================================
export const categoryColors: Record<
  string,
  { color: string; outline: string }
> = {
  Agronomy: { color: "#5CFF7A", outline: "#FFFFFF" }, // Mint green + white outline (confirmed)
  "Grain/Feed": { color: "#B5651D", outline: "#FFFFFF" },
  "C-Store/Service/Energy": { color: "#FFFFFF", outline: "#000000" },
  Distribution: { color: "#FFD43B", outline: "#000000" },
};

// ================================================================
// 📌 STOP TYPE (for Page.tsx trip builder)
// ================================================================
export interface Stop {
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  coords: [number, number];
}

// ================================================================
// 📂 DATA PATHS (Bailey Locked)
// ================================================================
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const RETAILERS_GEOJSON = `${basePath}/data/retailers.geojson`;
const KINGPIN_GEOJSON = `${basePath}/data/kingpin.geojson`;

// ================================================================
// 🧰 NORMALIZERS
// ================================================================
const norm = (v: string) => (v || "").trim().toLowerCase();
const capState = (v: string) => (v || "").toUpperCase();

// ================================================================
// 🧭 MAIN COMPONENT
// ================================================================
interface CertisMapProps {
  selectedCategories: string[];
  selectedStates: string[];
  selectedSuppliers: string[];
  selectedRetailers: string[];
  homeCoords: [number, number] | null;

  onStatesLoaded: (states: string[]) => void;
  onRetailersLoaded: (retailers: string[]) => void;
  onSuppliersLoaded: (suppliers: string[]) => void;
  onRetailerSummary: (
    list: {
      retailer: string;
      count: number;
      suppliers: string[];
      categories: string[];
      states: string[];
    }[]
  ) => void;

  onAddStop: (stop: Stop) => void;
  onAllStopsLoaded: (stops: Stop[]) => void;

  tripStops: Stop[];
  tripMode: "entered" | "optimize";
  onRouteSummary: (x: any) => void;
  onOptimizedRoute: (stops: Stop[]) => void;
}

export default function CertisMap(props: CertisMapProps) {
  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Hold references to all retailer markers
  const retailerMarkersRef = useRef<Marker[]>([]);
  // Kingpins have separate independent markers
  const kingpinMarkersRef = useRef<Marker[]>([]);

  // ================================================================
  // 🗺️ INITIALIZE MAP
  // ================================================================
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      projection: "mercator",
      center: [-93.5, 42.1], // Iowa-centered reasonable default
      zoom: 6,
      minZoom: 3,
    });

    mapRef.current = map;

    map.on("load", () => {
      loadRetailersLayer();
      loadKingpinLayer();
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, []);

  // ================================================================
  // 🟦 LOAD KINGPIN LAYER — ALWAYS VISIBLE — BLUE STAR PNG
  // ================================================================
  const loadKingpinLayer = async () => {
    const map = mapRef.current;
    if (!map) return;

    try {
      const res = await fetch(KINGPIN_GEOJSON);
      const data = await res.json();

      // Remove existing kingpin markers
      kingpinMarkersRef.current.forEach((m) => m.remove());
      kingpinMarkersRef.current = [];

      data.features.forEach((feature: any) => {
        const { coordinates } = feature.geometry;
        const p = feature.properties;

        const markerEl = document.createElement("img");
        markerEl.src = `${basePath}/icons/kingpin.png`; // Final name after rename
        markerEl.style.width = "28px";
        markerEl.style.height = "28px";

        // Popup HTML — KINGPIN with contact list
        let popupHtml = `
          <div style="font-size:14px; line-height:1.3; color:white;">
            <strong style="font-size:16px; color:#4DA3FF;">${p.RETAILER || "Remote"}</strong><br/>
        `;

        if (p.ADDRESS) {
          popupHtml += `${p.ADDRESS}<br/>${p.CITY}, ${p.STATE} ${p.ZIP}<br/><br/>`;
        } else {
          popupHtml += `<em>No fixed address — Remote</em><br/><br/>`;
        }

        if (p.SUPPLIER && p.SUPPLIER.length > 0) {
          popupHtml += `<strong>Supplier:</strong> ${p.SUPPLIER}<br/><br/>`;
        }

        popupHtml += `<strong>Contacts:</strong><br/>`;

        if (p.CONTACTS && Array.isArray(p.CONTACTS)) {
          p.CONTACTS.forEach((c: any) => {
            popupHtml += `
              <div style="margin-bottom:6px;">
                <span style="font-weight:bold;">${c.name}</span><br/>
                ${c.title ? `${c.title}<br/>` : ""}
                ${c.office ? `Office: ${c.office}<br/>` : ""}
                ${c.cell ? `Cell: ${c.cell}<br/>` : ""}
                ${c.email ? `<a href="mailto:${c.email}" style="color:#4DA3FF;">${c.email}</a><br/>` : ""}
              </div>
            `;
          });
        } else {
          popupHtml += `<em>No contacts available</em>`;
        }

        popupHtml += `</div>`;

        const popup = new mapboxgl.Popup({ offset: 12 }).setHTML(popupHtml);

        const marker = new mapboxgl.Marker({
          element: markerEl,
          anchor: "bottom",
        })
          .setLngLat([coordinates[0], coordinates[1]])
          .setPopup(popup)
          .addTo(map);

        kingpinMarkersRef.current.push(marker);
      });
    } catch (err) {
      console.error("[KINGPIN LOAD ERROR]", err);
    }
  };

  // ================================================================
  // 🔶 LOAD RETAILERS LAYER — FILTERABLE
  // ================================================================
  const loadRetailersLayer = async () => {
    const map = mapRef.current;
    if (!map) return;

    try {
      const res = await fetch(RETAILERS_GEOJSON);
      const data = await res.json();

      // First pass — for list extraction
      extractSummaryLists(data);

      // Second pass — for markers
      drawRetailerMarkers(data);

      // Notify page.tsx that stops (for Search Tile) are available
      const allStops = data.features.map((f: any) => {
        const p = f.properties;
        const [lng, lat] = f.geometry.coordinates;
        return {
          label: p.RETAILER,
          address: p.ADDRESS,
          city: p.CITY,
          state: p.STATE,
          zip: p.ZIP,
          coords: [lng, lat],
        };
      });

      props.onAllStopsLoaded(allStops);
    } catch (err) {
      console.error("[RETAILERS LOAD ERROR]", err);
    }
  };

  // ================================================================
  // 📊 EXTRACT STATE/RETAILER/SUPPLIER LISTS & SUMMARY
  // ================================================================
  const extractSummaryLists = (data: any) => {
    const states = new Set<string>();
    const retailers = new Set<string>();
    const suppliers = new Set<string>();
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

    data.features.forEach((f: any) => {
      const p = f.properties;
      const state = p.STATE || "";
      const retailer = p.RETAILER || "";
      const supList: string[] =
        typeof p.SUPPLIERS === "string"
          ? p.SUPPLIERS.split(",").map((x: string) => x.trim())
          : [];

      // Collect raw lists
      if (state) states.add(state);
      if (retailer) retailers.add(retailer);
      supList.forEach((s) => suppliers.add(s));

      // Summary accumulation
      if (!summaryMap.has(retailer)) {
        summaryMap.set(retailer, {
          retailer,
          count: 0,
          suppliers: new Set(),
          categories: new Set(),
          states: new Set(),
        });
      }

      const entry = summaryMap.get(retailer)!;
      entry.count += 1;
      supList.forEach((s) => entry.suppliers.add(s));
      if (p.CATEGORY) entry.categories.add(p.CATEGORY);
      if (state) entry.states.add(state);
    });

    props.onStatesLoaded(Array.from(states).sort());
    props.onRetailersLoaded(Array.from(retailers).sort());
    props.onSuppliersLoaded(Array.from(suppliers).sort());

    props.onRetailerSummary(
      Array.from(summaryMap.values()).map((x) => ({
        retailer: x.retailer,
        count: x.count,
        suppliers: Array.from(x.suppliers).sort(),
        categories: Array.from(x.categories).sort(),
        states: Array.from(x.states).sort(),
      }))
    );
  };
  // ================================================================
  // 🎯 DRAW RETAILER MARKERS (Filterable Layer)
  // ================================================================
  const drawRetailerMarkers = (data: any) => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old markers
    retailerMarkersRef.current.forEach((m) => m.remove());
    retailerMarkersRef.current = [];

    const {
      selectedCategories,
      selectedStates,
      selectedSuppliers,
      selectedRetailers,
    } = props;

    data.features.forEach((f: any) => {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;

      // Normalize values for filtering
      const cat = norm(p.CATEGORY);
      const st = norm(p.STATE);
      const r = norm(p.RETAILER);
      const supList: string[] =
        typeof p.SUPPLIERS === "string"
          ? p.SUPPLIERS.split(",").map((x: string) => norm(x.trim()))
          : [];

      // Filtering Logic — Phase A.27b (Bailey-locked)
      let visible = true;

      // CATEGORY FILTER
      if (selectedCategories.length > 0) {
        if (!selectedCategories.includes(cat)) visible = false;
      }

      // STATE FILTER
      if (selectedStates.length > 0) {
        if (!selectedStates.includes(st)) visible = false;
      }

      // SUPPLIERS FILTER
      if (selectedSuppliers.length > 0) {
        const hasSupplier = supList.some((s) => selectedSuppliers.includes(s));
        if (!hasSupplier) visible = false;
      }

      // RETAILER FILTER
      if (selectedRetailers.length > 0) {
        if (!selectedRetailers.includes(r)) visible = false;
      }

      if (!visible) return;

      // ------------------------------------------------------------
      // MARKER ELEMENT
      // ------------------------------------------------------------
      const markerEl = document.createElement("div");
      markerEl.style.width = "14px";
      markerEl.style.height = "14px";
      markerEl.style.borderRadius = "50%";
      markerEl.style.border = `2px solid ${
        categoryColors[p.CATEGORY]?.outline || "#FFFFFF"
      }`;
      markerEl.style.backgroundColor =
        categoryColors[p.CATEGORY]?.color || "#FFFFFF";

      // ------------------------------------------------------------
      // POPUP CONTENT
      // ------------------------------------------------------------
      const popupHtml = `
        <div style="font-size: 14px; line-height: 1.3;">
          <strong style="font-size: 16px; color: #FFD43B;">${p.RETAILER}</strong><br/>
          ${p.ADDRESS}<br/>
          ${p.CITY}, ${p.STATE} ${p.ZIP}<br/><br/>

          <strong>Suppliers:</strong> ${p.SUPPLIERS || "N/A"}<br/>
          <strong>Category:</strong> ${p.CATEGORY}<br/>
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 12 }).setHTML(popupHtml);

      // ------------------------------------------------------------
      // MARKER INSTANCE
      // ------------------------------------------------------------
      const marker = new mapboxgl.Marker({
        element: markerEl,
        anchor: "center",
      })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map);

      retailerMarkersRef.current.push(marker);
    });
  };

  // ================================================================
  // 🧭 ROUTE OPTIMIZATION HANDLER = Mapbox Directions API (Mocked)
  // ================================================================
  const runRouteOptimization = async () => {
    const { tripStops, tripMode } = props;
    const map = mapRef.current;
    if (!map) return;

    if (tripMode !== "optimize" || tripStops.length < 3) return;

    try {
      // Extract coordinates
      const coords = tripStops.map((s) => s.coords).join(";");

      // (We can integrate real optimization later — placeholder keeps API stable)
      const optimized = [...tripStops]; // For now, passthrough

      props.onOptimizedRoute(optimized);
    } catch (err) {
      console.error("[ROUTE OPTIMIZATION ERROR]", err);
    }
  };

  // ================================================================
  // 🔄 APPLY FILTERS WHEN PROPS CHANGE
  // ================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Reload retailers.geojson and redraw with filtering
    fetch(RETAILERS_GEOJSON)
      .then((r) => r.json())
      .then((data) => drawRetailerMarkers(data))
      .catch((err) => console.error("Reload error:", err));
  }, [
    props.selectedCategories,
    props.selectedStates,
    props.selectedSuppliers,
    props.selectedRetailers,
  ]);

  // ================================================================
  // 🏠 HOME MARKER
  // ================================================================
  const homeMarkerRef = useRef<Marker | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!props.homeCoords) {
      if (homeMarkerRef.current) {
        homeMarkerRef.current.remove();
        homeMarkerRef.current = null;
      }
      return;
    }

    const [lng, lat] = props.homeCoords;

    // Remove old
    if (homeMarkerRef.current) homeMarkerRef.current.remove();

    // New marker
    const el = document.createElement("div");
    el.style.width = "22px";
    el.style.height = "22px";
    el.style.backgroundColor = "#1E90FF";
    el.style.border = "3px solid white";
    el.style.borderRadius = "50%";
    el.style.boxShadow = "0 0 6px rgba(0,0,0,0.6)";

    const popup = new mapboxgl.Popup({ offset: 12 }).setHTML(
      `<strong style="font-size:16px; color:#FFD43B;">Home</strong><br/>Set via ZIP code`
    );

    homeMarkerRef.current = new mapboxgl.Marker({
      element: el,
      anchor: "center",
    })
      .setLngLat([lng, lat])
      .setPopup(popup)
      .addTo(map);
  }, [props.homeCoords]);

  // ================================================================
  // 🔁 Run Route Optimization When Needed
  // ================================================================
  useEffect(() => {
    runRouteOptimization();
  }, [props.tripStops, props.tripMode]);

  // ================================================================
  // 🗺️ FINAL RENDER
  // ================================================================
  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%" }}
      className="relative"
    />
  );
}
// ============================================================================
// 📌 CONTINUE — SUPPORT FUNCTIONS FOR SUMMARIES + SUPPLIERS
// ============================================================================

// Parse suppliers into clean array
function parseSuppliersList(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((v) => String(v).trim());
  if (typeof val === "string")
    return val.split(/[,;/|]+/).map((v) => v.trim()).filter(Boolean);
  return [];
}

// Normalize category for summary grouping
const cleanCategory = (cat: string) => {
  const c = (cat || "").trim();

  if (/grain|feed/i.test(c)) return "Grain/Feed";
  if (/store|c-store|service|energy/i.test(c)) return "C-Store/Service/Energy";
  if (/distribution/i.test(c)) return "Distribution";
  if (/corporate|hq/i.test(c)) return "Corporate HQ";
  if (/kingpin/i.test(c)) return "Kingpin";
  return "Agronomy";
};

// ============================================================================
// 🧮 BUILD RETAILER SUMMARY (Non-Destructive)
// ============================================================================
const buildRetailerSummary = useCallback(
  (features: any[]) => {
    const groups: Record<
      string,
      { states: Set<string>; suppliers: Set<string>; categories: Set<string>; count: number }
    > = {};

    features.forEach((f) => {
      const p = f.properties;
      if (!p) return;

      const retailer = (p.RETAILER || p.Name || "Unknown").trim();
      if (!groups[retailer]) {
        groups[retailer] = {
          states: new Set(),
          suppliers: new Set(),
          categories: new Set(),
          count: 0,
        };
      }

      groups[retailer].count++;
      if (p.STATE) groups[retailer].states.add(p.STATE);
      parseSuppliersList(p.SUPPLIERS).forEach((s) => groups[retailer].suppliers.add(s));
      groups[retailer].categories.add(cleanCategory(p.CATEGORY));
    });

    props.onRetailerSummary?.(
      Object.entries(groups).map(([retailer, g]) => ({
        retailer,
        count: g.count,
        suppliers: Array.from(g.suppliers).sort(),
        categories: Array.from(g.categories).sort(),
        states: Array.from(g.states).sort(),
      }))
    );
  },
  [props.onRetailerSummary]
);

// ============================================================================
// 🔄 LOAD ALL MARKERS → SUPPLY DATA BACK TO page.tsx
// ============================================================================
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  Promise.all([
    fetch(RETAILERS_GEOJSON).then((r) => r.json()),
    fetch(KINGPIN_GEOJSON).then((r) => r.json()),
  ])
    .then(([retData, kpData]) => {
      const all = [...(retData.features || []), ...(kpData.features || [])];

      // Supply locations to SearchLocationsTile
      props.onAllStopsLoaded?.(
        all.map((f: any) => {
          const p = f.properties;
          return {
            label: p.RETAILER || p.Name || "Unknown",
            address: p.ADDRESS,
            coords: f.geometry.coordinates,
            city: p.CITY,
            state: p.STATE,
            zip: p.ZIP,
          };
        })
      );

      // Compute state list
      props.onStatesLoaded?.(
        [...new Set(all.map((f) => f.properties.STATE || "").filter(Boolean))]
          .sort()
          .map((s) => s.trim())
      );

      // Compute retailer list
      props.onRetailersLoaded?.(
        [...new Set(all.map((f) => f.properties.RETAILER || "").filter(Boolean))]
          .sort()
          .map((s) => s.trim())
      );

      // Compute suppliers list
      props.onSuppliersLoaded?.(
        [
          ...new Set(
            all.flatMap((f) => parseSuppliersList(f.properties.SUPPLIERS)).filter(Boolean)
          ),
        ].sort()
      );

      // Build channel summary
      buildRetailerSummary(all);
    })
    .catch((err) => console.error("LOAD ALL FEATURES ERROR", err));
}, [buildRetailerSummary]);

// ============================================================================
// 🌟 KINGPIN STAR MARKERS — BLUE PNG, ALWAYS VISIBLE, NEVER FILTERED
// ============================================================================
const kingpinMarkersRef = useRef<mapboxgl.Marker[]>([]);

useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  // Remove old Kingpin markers
  kingpinMarkersRef.current.forEach((m) => m.remove());
  kingpinMarkersRef.current = [];

  fetch(KINGPIN_GEOJSON)
    .then((r) => r.json())
    .then((data) => {
      (data.features || []).forEach((f: any) => {
        const p = f.properties;
        const [lng, lat] = f.geometry.coordinates;

        // Create star <img>
        const el = document.createElement("img");
        el.src = `${basePath}/icons/kingpin.png`;
        el.style.width = "26px";
        el.style.height = "26px";
        el.style.filter = "drop-shadow(0 0 3px black)";

        // Build popup with FULL CONTACT RECORDS:
        // ------------------------------------------------------
        // Kingpins DO NOT display Category (they're kings).
        // They DO show multiple contacts listed below.
        // ------------------------------------------------------
        let contactsHtml = "";
        if (p.CONTACTS && Array.isArray(p.CONTACTS)) {
          contactsHtml = p.CONTACTS.map((c: any) => {
            return `
              <div style="margin-bottom:6px;">
                <strong style="color:#FFD43B;">${c.Name}</strong><br/>
                ${c.Title || ""}<br/>
                ${c.Office || ""}<br/>
                ${c.Cell || ""}<br/>
                <a href="mailto:${c.Email}" style="color:#4EA2F5;">${c.Email}</a>
              </div>
            `;
          }).join("");
        }

        const popupHtml = `
          <div style="font-size: 14px; line-height:1.35;">
            <strong style="font-size: 16px; color:#4EA2F5;">${p.RETAILER}</strong><br/>
            ${p.ADDRESS}<br/>
            ${p.CITY}, ${p.STATE} ${p.ZIP}<br/><br/>

            <strong style="color:#FFD43B;">Contacts</strong><br/>
            ${contactsHtml || "No contacts listed."}
          </div>
        `;

        const popup = new mapboxgl.Popup({ offset: 14 }).setHTML(popupHtml);

        const marker = new mapboxgl.Marker({
          element: el,
          anchor: "center",
        })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map);

        kingpinMarkersRef.current.push(marker);
      });
    })
    .catch((err) => console.error("KINGPIN MARKER ERROR:", err));
}, []);
// ============================================================================
// 🎯 APPLY RETAILER FILTERS (Kingpins untouched — always visible)
// ============================================================================
const filteredRetailers = useMemo(() => {
  return masterRetailerFeatures.current.filter((f: any) => {
    const p = f.properties;
    if (!p) return false;

    const state = (p.STATE || "").toLowerCase();
    const retailer = (p.RETAILER || "").toLowerCase();
    const category = cleanCategory(p.CATEGORY).toLowerCase();
    const suppliers = parseSuppliersList(p.SUPPLIERS).map((s) => s.toLowerCase());

    // CATEGORY FILTER (no Kingpins ever included here)
    if (selectedCategories.length > 0 && !selectedCategories.includes(category)) {
      return false;
    }

    // STATE FILTER
    if (selectedStates.length > 0 && !selectedStates.includes(state)) {
      return false;
    }

    // RETAILER FILTER
    if (selectedRetailers.length > 0 && !selectedRetailers.includes(retailer)) {
      return false;
    }

    // SUPPLIER FILTER
    if (selectedSuppliers.length > 0) {
      const match = suppliers.some((s) => selectedSuppliers.includes(s));
      if (!match) return false;
    }

    return true;
  });
}, [
  selectedCategories,
  selectedStates,
  selectedSuppliers,
  selectedRetailers,
]);

// ============================================================================
// 🖍 DRAW RETAILER CIRCLE MARKERS (NOT KINGPINS)
// ============================================================================
const retailerMarkersRef = useRef<mapboxgl.Marker[]>([]);

useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  // Clear old markers
  retailerMarkersRef.current.forEach((m) => m.remove());
  retailerMarkersRef.current = [];

  filteredRetailers.forEach((f: any) => {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    const category = cleanCategory(p.CATEGORY);

    const color = categoryColors[category]?.color || "#FFFFFF";
    const outline = categoryColors[category]?.outline || "#000000";

    // Build circle element
    const el = document.createElement("div");
    el.style.width = "14px";
    el.style.height = "14px";
    el.style.borderRadius = "50%";
    el.style.background = color;
    el.style.border = `2px solid ${outline}`;
    el.style.boxShadow = "0 0 4px rgba(0,0,0,0.5)";

    // Build popup (NO category brackets per Bailey Rule)
    const popup = new mapboxgl.Popup({ offset: 10 }).setHTML(`
      <div style="font-size:14px; line-height:1.35;">
        <strong style="font-size:16px; color:${color};">${p.RETAILER}</strong><br/>
        ${p.ADDRESS}<br/>
        ${p.CITY}, ${p.STATE} ${p.ZIP}<br/><br/>

        <strong style="color:#FFD43B;">Categories:</strong>  
        ${cleanCategory(p.CATEGORY)}<br/>

        <strong style="color:#FFD43B;">Suppliers:</strong>  
        ${parseSuppliersList(p.SUPPLIERS).join(", ") || "N/A"}
      </div>
    `);

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([lng, lat])
      .setPopup(popup)
      .addTo(map);

    retailerMarkersRef.current.push(marker);
  });
}, [filteredRetailers]);

// ============================================================================
// 🧭 ROUTE DRAWING (Lines between stops)
// ============================================================================
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;
  if (!props.tripStops || props.tripStops.length < 2) {
    if (map.getSource("route")) {
      map.removeLayer("route");
      map.removeSource("route");
    }
    props.onRouteSummary?.(null);
    return;
  }

  const coords = props.tripStops.map((s) => s.coords);

  const routeGeo = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: coords,
    },
  };

  if (map.getSource("route")) {
    (map.getSource("route") as any).setData(routeGeo);
  } else {
    map.addSource("route", { type: "geojson", data: routeGeo });

    map.addLayer({
      id: "route",
      type: "line",
      source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": 4,
        "line-color": "#4EA2F5",
      },
    });
  }

  // Rough ETA calculation (not using Mapbox Directions)
  const totalMiles = coords.reduce((sum, c, i) => {
    if (i === 0) return sum;
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const R = 3958.8;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const cang = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const miles = R * cang;
    return sum + miles;
  }, 0);

  const avgSpeed = 50; // mph
  const minutes = (totalMiles / avgSpeed) * 60;

  props.onRouteSummary?.({
    distance_m: totalMiles * 1609.34,
    duration_s: minutes * 60,
  });
}, [props.tripStops]);

// ============================================================================
// 🧩 FINAL RENDER
// ============================================================================
return (
  <div
    ref={mapContainer}
    className="w-full h-full"
    style={{
      position: "relative",
      overflow: "hidden",
    }}
  />
);
}
