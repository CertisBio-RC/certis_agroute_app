"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike, Map as MapboxMap } from "mapbox-gl";
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

/* ============================================================================
   💠 TYPES — Locked by Bailey Contract
============================================================================ */
export type Stop = {
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  coords: [number, number];
};

export type RetailerSummary = {
  retailer: string;
  count: number;
  suppliers: string[];
  categories: string[];
  states: string[];
};

/* ============================================================================
   🎨 CATEGORY COLORS — Gold Baseline Palette
============================================================================ */
export const categoryColors: Record<string, string> = {
  Agronomy: "#22c55e",
  "Grain/Feed": "#eab308",
  "C-Store/Service/Energy": "#06b6d4",
  Distribution: "#ef4444",

  // Non-filtered layers
  "Corporate HQ": "#ff0000", // filled red circle with yellow border
  Kingpin: "#ffffff",        // PNG marker drawn separately
};

/* ============================================================================
   📌 PROPS — Final Contract (No Questions)
============================================================================ */
interface Props {
  selectedCategories: string[];
  selectedStates: string[];
  selectedSuppliers: string[];
  selectedRetailers: string[];

  homeCoords: [number, number] | null;
  tripStops: Stop[];
  tripMode: "entered" | "optimize";

  onStatesLoaded(states: string[]): void;
  onRetailersLoaded(states: string[]): void;
  onSuppliersLoaded(suppliers: string[]): void;
  onRetailerSummary(summary: RetailerSummary[]): void;

  onAddStop(stop: Stop): void;
  onAllStopsLoaded(stops: Stop[]): void;

  onRouteSummary(summary: { distance_m: number; duration_s: number }): void;
  onOptimizedRoute(stops: Stop[]): void;
}

/* ============================================================================
   🌎 GEOJSON ENDPOINTS — From public/data
============================================================================ */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const RETAILERS_URL = `${basePath}/data/retailers.geojson`;
const KINGPIN_URL = `${basePath}/data/kingpin1.geojson`;

/* ============================================================================
   🔧 NORMALIZATION HELPERS (Bailey Rules)
============================================================================ */
const norm = (s: string) => (s || "").trim().toLowerCase();
const normSet = (arr: any[]) =>
  [...new Set(arr.map((x) => norm(String(x))))].filter(Boolean);

/* ============================================================================
   📍 MARKER SIZE RULES (Bailey Rules)
============================================================================ */
const SIZE_RETAILER = 6;
const SIZE_CORP = 7;
const SIZE_KINGPIN = 7; // PNG icon

/* ============================================================================
   🗺️ MAIN COMPONENT START (Part 1 ends mid-file)
============================================================================ */
export default function CertisMap(props: Props) {
  const {
    selectedCategories,
    selectedStates,
    selectedSuppliers,
    selectedRetailers,

    homeCoords,
    tripStops,
    tripMode,

    onStatesLoaded,
    onRetailersLoaded,
    onSuppliersLoaded,
    onRetailerSummary,
    onAddStop,
    onAllStopsLoaded,
    onRouteSummary,
    onOptimizedRoute,
  } = props;

  const mapRef = useRef<MapboxMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  /* ==========================================================================
     1) INITIALIZE MAP
     2) LOAD GEOJSON
     3) BUILD MARKERS (Retailers, Corporate HQ, Kingpin)
     4) BUILD SUMMARY
     5) REGISTER POPUPS FOR ADD-TO-TRIP
     ========================================================================== */

  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current!,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      projection: "mercator", // Bailey Rule
      center: [-94.0, 42.3],  // Iowa-centered default
      zoom: 5,
    });

    mapRef.current = map;

    map.on("load", async () => {
      /* ==========================================================
         LOAD BOTH LAYERS
         RETAILERS + KINGPIN
      ========================================================== */
      const [retRes, kpRes] = await Promise.all([
        fetch(RETAILERS_URL).then((r) => r.json()),
        fetch(KINGPIN_URL).then((r) => r.json()),
      ]);

      // Send canonical Stop[] upward so SearchLocationsTile works
      const allStops: Stop[] = [
        ...retRes.features.map((f: any) => ({
          label: f.properties.Retailer,
          address: f.properties.Address,
          city: f.properties.City,
          state: f.properties.State,
          zip: f.properties.Zip,
          coords: f.geometry.coordinates,
        })),
        ...kpRes.features.map((f: any) => ({
          label: f.properties.Retailer,
          address: f.properties.Address,
          city: f.properties.City,
          state: f.properties.State,
          zip: f.properties.Zip,
          coords: f.geometry.coordinates,
        })),
      ];
      onAllStopsLoaded(allStops);

      /* ==========================================================
         EXTRACT DROPDOWN LISTS
      ========================================================== */
      const states = normSet(
        retRes.features.map((f: any) => f.properties.State)
      );
      onStatesLoaded(states);

      const retailers = normSet(
        retRes.features.map((f: any) => f.properties.Retailer)
      );
      onRetailersLoaded(retailers);

      const suppliers = normSet(
        retRes.features.flatMap((f: any) =>
          (f.properties.Suppliers || "").split(",").map((s: string) => s.trim())
        )
      );
      onSuppliersLoaded(suppliers);

      /* ==========================================================
         ADD SOURCES
      ========================================================== */
      map.addSource("retailers", {
        type: "geojson",
        data: retRes,
      });

      map.addSource("kingpin1", {
        type: "geojson",
        data: kpRes,
      });

      /* ==========================================================
         DRAW RETAILERS AS CIRCLES
      ========================================================== */
      map.addLayer({
        id: "retailers-point",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": SIZE_RETAILER,
          "circle-color": [
            "match",
            ["get", "Category"],
            "Agronomy",
            categoryColors["Agronomy"],
            "Grain/Feed",
            categoryColors["Grain/Feed"],
            "C-Store/Service/Energy",
            categoryColors["C-Store/Service/Energy"],
            "Distribution",
            categoryColors["Distribution"],
            "#999999",
          ],
          "circle-stroke-width": 1.3,
          "circle-stroke-color": "#000000",
        },
      });

      /* ==========================================================
         DRAW CORPORATE HQ (RED CIRCLE + YELLOW BORDER)
      ========================================================== */
      map.addLayer({
        id: "corp-hq",
        type: "circle",
        source: "retailers",
        filter: ["==", ["get", "Category"], "Corporate HQ"],
        paint: {
          "circle-radius": SIZE_CORP,
          "circle-color": "#ff0000",
          "circle-stroke-color": "#facc15",
          "circle-stroke-width": 2,
        },
      });

      /* ==========================================================
         KINGPIN — ALWAYS VISIBLE, PNG MARKER
      ========================================================== */
      map.loadImage(`${basePath}/icons/kingpin.png`, (err, image) => {
        if (!err && image && !map.hasImage("kingpin-icon")) {
          map.addImage("kingpin-icon", image);
        }

        map.addLayer({
          id: "kingpin-layer",
          type: "symbol",
          source: "kingpin1",
          layout: {
            "icon-image": "kingpin-icon",
            "icon-size": 0.5,
            "icon-ignore-placement": true,
            "icon-allow-overlap": true,
          },
        });
      });

      /* ==========================================================
         SUMMARY MAP (Bailey Contract)
      ========================================================== */
      const summaryMap = new Map<string, RetailerSummary>();

      retRes.features.forEach((f: any) => {
        const key = f.properties.Retailer;
        const s = summaryMap.get(key) || {
          retailer: key,
          count: 0,
          suppliers: [],
          categories: [],
          states: [],
        };

        s.count += 1;
        s.suppliers.push(...(f.properties.Suppliers || "").split(",").map((x: string) => x.trim()));
        s.categories.push(f.properties.Category);
        s.states.push(f.properties.State);

        summaryMap.set(key, s);
      });

      onRetailerSummary([...summaryMap.values()]);
    });
  }, []);

  /* ===================== PART 1 ENDS HERE ============================ */

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
    />
  );
}
/* ============================================================================
   PART 2 — FILTERING, VISIBILITY TOGGLES & POPUPS
   (Bailey Rules: 
      • Retailers = Full intersection of State + Supplier + Category + Retailer 
      • Corporate HQ = State filter ONLY
      • Kingpins = ALWAYS visible, IMMUNE to all filters
      • Click-to-Add AND Popup "Add to Trip" button both work
   ============================================================================
*/

useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  /* ------------------------------------------------------------------------
     🔎 FILTER: RETAILERS (FULL INTERSECTION)
     ------------------------------------------------------------------------ */

  const categorySet = new Set(selectedCategories.map(norm));
  const supplierSet = new Set(selectedSuppliers.map(norm));
  const retailerSet = new Set(selectedRetailers.map(norm));
  const stateSet = new Set(selectedStates.map(norm));

  // Retailers obey ALL filters (Bailey Rule)
  map.setFilter("retailers-point", [
    "all",

    // STATES (optional)
    selectedStates.length > 0
      ? ["in", ["downcase", ["get", "State"]], ["literal", [...stateSet]]]
      : true,

    // RETAILERS (optional)
    selectedRetailers.length > 0
      ? ["in", ["downcase", ["get", "Retailer"]], ["literal", [...retailerSet]]]
      : true,

    // CATEGORIES (optional)
    selectedCategories.length > 0
      ? ["in", ["downcase", ["get", "Category"]], ["literal", [...categorySet]]]
      : true,

    // SUPPLIERS (optional)
    selectedSuppliers.length > 0
      ? [
          "in",
          [
            "downcase",
            [
              "coalesce",
              ["get", "Suppliers"],
              "" // if empty
            ],
          ],
          ["literal", [...supplierSet]],
        ]
      : true,
  ]);

  /* ------------------------------------------------------------------------
     🔎 FILTER: CORPORATE HQ (STATE ONLY)
     (Immune to Supplier, Retailer, Category filters)
     ------------------------------------------------------------------------ */
  map.setFilter(
    "corp-hq",
    selectedStates.length > 0
      ? [
          "all",
          ["==", ["get", "Category"], "Corporate HQ"],
          ["in", ["downcase", ["get", "State"]], ["literal", [...stateSet]]],
        ]
      : ["==", ["get", "Category"], "Corporate HQ"]
  );

  /* ------------------------------------------------------------------------
     🔎 FILTER: KINGPIN  (NO FILTERS EVER)
     (Bailey Rule: always visible; only data determines presence)
     ------------------------------------------------------------------------ */
  map.setLayoutProperty(
    "kingpin-layer",
    "visibility",
    "visible"
  );
}, [
  selectedCategories,
  selectedStates,
  selectedSuppliers,
  selectedRetailers,
]);

/* ============================================================================
   🖱️ CLICK & POPUPS — ADD-TO-TRIP (Includes Kingpin & HQ)
============================================================================ */
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  const handleClick = (e: any) => {
    const f =
      e.features?.[0] ||
      map.queryRenderedFeatures(e.point, {
        layers: ["retailers-point", "corp-hq", "kingpin-layer"],
      })?.[0];

    if (!f) return;

    const p = f.properties;
    const coords = f.geometry.coordinates;

    const stop: Stop = {
      label: p.Retailer,
      address: p.Address,
      city: p.City,
      state: p.State,
      zip: p.Zip,
      coords,
    };

    /* ----------------------------------------------
       DIRECT CLICK ADDS TO TRIP
       ---------------------------------------------- */
    onAddStop(stop);

    /* ----------------------------------------------
       POPUP — ADD TO TRIP BUTTON
       ---------------------------------------------- */
    const popupHtml = `
      <div style="font-size:14px;">
        <strong style="color:#facc15;font-size:16px;">${p.Retailer}</strong><br/>
        ${p.Address}<br/>
        ${p.City}, ${p.State} ${p.Zip}<br/><br/>

        <button id="addStopBtn" 
          style="
            background:#2563eb;
            color:white;
            padding:4px 8px;
            border-radius:4px;
            cursor:pointer;
          ">
          Add to Trip
        </button>
      </div>
    `;

    new mapboxgl.Popup({ offset: 12 })
      .setLngLat(coords as LngLatLike)
      .setHTML(popupHtml)
      .addTo(map);

    map.once("popupopen", () => {
      const btn = document.getElementById("addStopBtn");
      if (btn) btn.onclick = () => onAddStop(stop);
    });
  };

  map.on("click", handleClick);
  return () => map.off("click", handleClick);
}, [onAddStop]);
/* ============================================================================
   PART 3 — TRIP MARKERS, SUMMARY EMIT, ALL-STOPS EMIT, AND FINAL EXPORT
   ============================================================================
*/

//
//  🧭 TRIP STOP MARKERS (Home + Retail Stops)
//
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  // Clear previous markers
  tripMarkersRef.current?.forEach((m) => m.remove());
  tripMarkersRef.current = [];

  /* HOME MARKER */
  if (homeCoords) {
    const el = document.createElement("div");
    el.style.backgroundImage = "url('/icons/Blue_Home.png')";
    el.style.width = "36px";
    el.style.height = "36px";
    el.style.backgroundSize = "contain";

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat(homeCoords)
      .addTo(map);

    tripMarkersRef.current.push(marker);
  }

  /* TRIP STOP MARKERS */
  tripStops.forEach((stop) => {
    const el = document.createElement("div");
    el.style.width = "14px";
    el.style.height = "14px";
    el.style.borderRadius = "50%";
    el.style.background = "#FFD700";
    el.style.border = "2px solid black";

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat(stop.coords)
      .addTo(map);

    tripMarkersRef.current.push(marker);
  });
}, [homeCoords, tripStops]);


//
//  🗂️ EXTRACT UNIQUE STATES, RETAILERS, SUPPLIERS
//      (Sent back to page.tsx for sidebar dropdowns)
//
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  if (!allFeaturesRef.current.length) return;

  const features = allFeaturesRef.current;

  const states = [...new Set(features.map((f) => f.properties.State).filter(Boolean))]
    .sort();

  const retailers = [...new Set(features.map((f) => f.properties.Retailer).filter(Boolean))]
    .sort();

  const suppliers = [
    ...new Set(
      features.flatMap((f) =>
        typeof f.properties.Supplier === "string"
          ? f.properties.Supplier.split(",").map((s) => s.trim())
          : f.properties.Supplier ?? []
      )
    ),
  ]
    .filter(Boolean)
    .sort();

  onStatesLoaded?.(states);
  onRetailersLoaded?.(retailers);
  onSuppliersLoaded?.(suppliers);
}, [loadedFlag]); // fires once after load



//
//  📊 RETAILER SUMMARY EMIT — Full Company Rollups
//
useEffect(() => {
  if (!allFeaturesRef.current.length) return;

  const summaryMap = new Map();

  for (const f of allFeaturesRef.current) {
    const r = f.properties.Retailer;
    if (!r) continue;

    if (!summaryMap.has(r)) {
      summaryMap.set(r, {
        retailer: r,
        count: 0,
        suppliers: new Set(),
        categories: new Set(),
        states: new Set(),
      });
    }

    const rec = summaryMap.get(r);
    rec.count += 1;
    rec.categories.add(f.properties.Category);
    rec.states.add(f.properties.State);

    const supp = f.properties.Supplier;
    if (Array.isArray(supp)) {
      supp.forEach((s) => rec.suppliers.add(s));
    } else if (typeof supp === "string") {
      supp.split(",").map((x) => x.trim()).forEach((s) => rec.suppliers.add(s));
    }
  }

  const result = Array.from(summaryMap.values()).map((rec) => ({
    retailer: rec.retailer,
    count: rec.count,
    suppliers: Array.from(rec.suppliers),
    categories: Array.from(rec.categories),
    states: Array.from(rec.states),
  }));

  onRetailerSummary?.(result);
}, [loadedFlag]);


//
//  🚌 ALL-STOPS EXPORT → page.tsx (for SearchLocationsTile)
//
useEffect(() => {
  if (!allFeaturesRef.current.length) return;

  const stops = allFeaturesRef.current.map((f) => ({
    label: f.properties.Retailer,
    address: f.properties.Address,
    city: f.properties.City,
    state: f.properties.State,
    zip: f.properties.Zip,
    coords: f.geometry.coordinates,
  }));

  onAllStopsLoaded?.(stops);
}, [loadedFlag]);


//
//  ➕ ROUTE SUMMARY (Distance + Duration) FROM MAP (Optional Callback)
//
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  map.off("route-summary", routeSummaryHandler);
  map.on("route-summary", routeSummaryHandler);

  function routeSummaryHandler(e: any) {
    if (e.detail) onRouteSummary?.(e.detail);
  }

  return () => map.off("route-summary", routeSummaryHandler);
}, [onRouteSummary]);


//
//  FINAL RENDER
//
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
