"use client";

// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD (FIXED BUILD)
//   • Corrected return-block structure
//   • Single map initializer (Bailey Rule)
//   • Fully functional GeoJSON loading (retailers + kingpin)
//   • Added missing hqMarkers ref
//   • Fixed popup marker lookup
//   • Removed duplicate export
//   • Unified norm() usage
// ============================================================================

import { useEffect, useRef } from "react";
import mapboxgl, { Map, Marker } from "mapbox-gl";

// ============================================================================
// 🎨 CATEGORY COLORS — FINAL GOLD PALETTE
// ============================================================================
export const categoryColors: Record<string, { color: string; size: number }> = {
  Agronomy: { color: "#00BFFF", size: 6 },
  "Grain/Feed": { color: "#FFD700", size: 6 },
  "C-Store/Service/Energy": { color: "#FF8C00", size: 6 },
  Distribution: { color: "#ADFF2F", size: 6 },
  "Corporate HQ": { color: "#FFFFFF", size: 7 },
  Kingpin: { color: "#FF0000", size: 7 },
};

// ============================================================================
// 📌 STOP TYPE (shared with Page.tsx)
// ============================================================================
export interface Stop {
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  coords: [number, number];
}

// ============================================================================
// 🧭 NORMALIZERS
// ============================================================================
function norm(v: string) {
  return (v || "").toString().trim().toLowerCase();
}

function cap(v: string) {
  return (v || "").toString().trim().toUpperCase();
}

// ============================================================================
// 🌎 MAIN MAP COMPONENT
// ============================================================================
export interface CertisMapProps {
  selectedCategories: string[];
  selectedStates: string[];
  selectedSuppliers: string[];
  selectedRetailers: string[];
  homeCoords: [number, number] | null;

  onStatesLoaded: (states: string[]) => void;
  onRetailersLoaded: (retailers: string[]) => void;
  onSuppliersLoaded: (suppliers: string[]) => void;
  onRetailerSummary: (summary: any[]) => void;

  onAddStop: (stop: Stop) => void;
  onAllStopsLoaded: (all: Stop[]) => void;

  tripStops: Stop[];
  tripMode: "entered" | "optimize";
  onRouteSummary: (s: { distance_m: number; duration_s: number } | null) => void;
  onOptimizedRoute: (stops: Stop[]) => void;
}

export default function CertisMap(props: CertisMapProps) {
  const {
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
    onAllStopsLoaded,
    tripStops,
    tripMode,
    onRouteSummary,
    onOptimizedRoute,
  } = props;

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  const retailerMarkers = useRef<Marker[]>([]);
  const kingpinMarkers = useRef<Marker[]>([]);
  const hqMarkers = useRef<Marker[]>([]); // ✅ FIXED: missing ref

  const allRetailerFeatures = useRef<any[]>([]);
  const allKingpinFeatures = useRef<any[]>([]);

  // ============================================================================
  // 🗺 INIT MAP (Bailey Rule)
  // ============================================================================
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-94.5, 41.5],
      zoom: 5,
      projection: { name: "mercator" },
      accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "",
    });

    mapRef.current.on("load", () => {
      mapRef.current!.resize();
    });
  }, []);

  // ============================================================================
  // 📥 LOAD RETAILERS + KINGPIN
  // ============================================================================
  useEffect(() => {
    if (!mapRef.current) return;

    const loadData = async () => {
      try {
        const retailersRes = await fetch("/certis_agroute_app/data/retailers.geojson");
        const kingpinRes = await fetch("/certis_agroute_app/data/kingpin.geojson");

        const retailersJson = await retailersRes.json();
        const kingpinJson = await kingpinRes.json();

        const retailerFeatures = retailersJson.features || [];
        const kingpinFeatures = kingpinJson.features || [];

        allRetailerFeatures.current = retailerFeatures;
        allKingpinFeatures.current = kingpinFeatures;

// 📌 STATES
const states = [
  ...new Set(
    retailerFeatures
      .map((f: any) => cap(f.properties?.State || ""))
      .filter(Boolean)
  ),
].sort();

// 👉 FIX: TS expects string[], so cast explicitly.
onStatesLoaded(states as string[]);


        // 📌 RETAILERS
        const retailers = [
          ...new Set(
            retailerFeatures.map((f: any) => f.properties?.Retailer || "").filter(Boolean)
          ),
        ].sort();
       onRetailersLoaded(retailers as string[]);

        // 📌 SUPPLIERS
        const suppliers = [
          ...new Set(
            retailerFeatures
              .flatMap((f: any) =>
                (f.properties?.Supplier || "")
                  .split(",")
                  .map((s: string) => s.trim())
              )
              .filter(Boolean)
          ),
        ].sort();
        onSuppliersLoaded(suppliers as string[]);

        // 📌 SUMMARY
        const summaryMap: Record<
          string,
          { count: number; suppliers: string[]; categories: string[]; states: string[] }
        > = {};

        for (const f of retailerFeatures) {
          const r = f.properties?.Retailer || "";
          const st = cap(f.properties?.State || "");
          const sup = f.properties?.Supplier || "";
          const cat = f.properties?.Category || "";

          if (!summaryMap[r]) {
            summaryMap[r] = { count: 0, suppliers: [], categories: [], states: [] };
          }

          summaryMap[r].count++;

          if (sup) {
            sup.split(",")
              .map((x) => x.trim())
              .filter(Boolean)
              .forEach((x) => {
                if (!summaryMap[r].suppliers.includes(x)) {
                  summaryMap[r].suppliers.push(x);
                }
              });
          }

          if (cat && !summaryMap[r].categories.includes(cat)) {
            summaryMap[r].categories.push(cat);
          }

          if (st && !summaryMap[r].states.includes(st)) {
            summaryMap[r].states.push(st);
          }
        }

        const summaryArr = Object.entries(summaryMap).map(([retailer, info]) => ({
          retailer,
          ...info,
        }));
        onRetailerSummary(summaryArr);

        // 📌 MASTER STOP LIST
        const retailerStops: Stop[] = retailerFeatures.map((f: any) => ({
          label: f.properties?.Retailer || "Unknown",
          address: f.properties?.Address || "",
          city: f.properties?.City || "",
          state: f.properties?.State || "",
          zip: f.properties?.Zip || "",
          coords: f.geometry?.coordinates || [0, 0],
        }));

        const kingpinStops: Stop[] = kingpinFeatures.map((f: any) => ({
          label: "Kingpin",
          address: f.properties?.Address || "",
          city: f.properties?.City || "",
          state: f.properties?.State || "",
          zip: f.properties?.Zip || "",
          coords: f.geometry?.coordinates || [0, 0],
        }));

        onAllStopsLoaded([...retailerStops, ...kingpinStops]);

        renderMarkers();

      } catch (err) {
        console.error("GeoJSON Load Error:", err);
      }
    };

    loadData();
  }, [
    onStatesLoaded,
    onRetailersLoaded,
    onSuppliersLoaded,
    onRetailerSummary,
    onAllStopsLoaded,
  ]);

  // ============================================================================
  // 🧹 CLEAR MARKERS
  // ============================================================================
  const clearMarkers = () => {
    retailerMarkers.current.forEach((m) => m.remove());
    kingpinMarkers.current.forEach((m) => m.remove());
    hqMarkers.current.forEach((m) => m.remove());

    retailerMarkers.current = [];
    kingpinMarkers.current = [];
    hqMarkers.current = [];
  };

  // ============================================================================
  // 🎨 CATEGORY
  // ============================================================================
  const getCategoryInfo = (cat: string) => {
    const k = cat?.trim() || "";
    return categoryColors[k] || categoryColors["Agronomy"];
  };

  // ============================================================================
  // 🔍 FILTER LOGIC
  // ============================================================================
  const passesFilters = (f: any) => {
    const p = f.properties || {};

    const st = norm(p.State || "");
    const ret = norm(p.Retailer || "");
    const cat = norm(p.Category || "");
    const supList = (p.Supplier || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

    const selectedStatesLower = selectedStates.map(norm);
    const selectedRetailersLower = selectedRetailers.map(norm);
    const selectedCategoriesLower = selectedCategories.map(norm);

    if (selectedStatesLower.length > 0 && !selectedStatesLower.includes(st)) return false;
    if (selectedRetailersLower.length > 0 && !selectedRetailersLower.includes(ret)) return false;
    if (selectedCategoriesLower.length > 0 && !selectedCategoriesLower.includes(cat)) return false;

    if (selectedSuppliers.length > 0) {
      const intersection = supList.filter((s: string) => selectedSuppliers.includes(s));
      if (intersection.length === 0) return false;
    }

    return true;
  };

  // ============================================================================
  // 🟦 DRAW MARKERS
  // ============================================================================
  const drawCircleMarker = (map: Map, feature: any, color: string, size: number, idPrefix: string) => {
    const el = document.createElement("div");
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.borderRadius = "50%";
    el.style.background = color;
    el.style.border = "1px solid black";

    const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat(feature.geometry.coordinates)
      .addTo(map);

    marker.getElement().dataset.id = `${idPrefix}|${feature.properties?.Address}`; // FIXED
    return marker;
  };

  const drawKingpinMarker = (map: Map, feature: any, iconUrl: string) => {
    const el = document.createElement("div");
    el.style.width = "28px";
    el.style.height = "28px";
    el.style.backgroundImage = `url(${iconUrl})`;
    el.style.backgroundSize = "contain";

    const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
      .setLngLat(feature.geometry.coordinates)
      .addTo(map);

    marker.getElement().dataset.id = `KINGPIN|${feature.properties?.Address}`;
    return marker;
  };

  // ============================================================================
  // 🖼 RENDER MARKERS
  // ============================================================================
  const renderMarkers = () => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    clearMarkers();

    // KINGPIN ALWAYS VISIBLE
    allKingpinFeatures.current.forEach((f) => {
      const marker = drawKingpinMarker(map, f, "/certis_agroute_app/icons/kingpin.png");
      kingpinMarkers.current.push(marker);
    });

    // RETAILERS
    allRetailerFeatures.current.forEach((f) => {
      if (!passesFilters(f)) return;

      const catInfo = getCategoryInfo(f.properties?.Category || "Agronomy");
      const marker = drawCircleMarker(
        map,
        f,
        catInfo.color,
        catInfo.size,
        "RETAILER"
      );
      retailerMarkers.current.push(marker);
    });

    // CORPORATE HQ
    allRetailerFeatures.current.forEach((f: any) => {
      const p = f.properties || {};
      if (norm(p.Category) !== "corporate hq") return;
      if (!passesFilters(f)) return;

      const marker = drawCircleMarker(
        map,
        f,
        categoryColors["Corporate HQ"].color,
        categoryColors["Corporate HQ"].size,
        "HQ"
      );
      hqMarkers.current.push(marker);
    });
  };

  // ============================================================================
  // 🖱 POPUP + ADD TO TRIP
  // ============================================================================
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    map.on("click", (e) => {
      const rect = map.getCanvas().getBoundingClientRect();
      const elements = document.elementsFromPoint(
        e.point.x + rect.left,
        e.point.y + rect.top
      );

      const markerEl = elements.find((el) => el instanceof HTMLElement && el.dataset.id);
     if (!(markerEl instanceof HTMLElement)) return;
if (!markerEl.dataset?.id) return;

      const addr = markerEl.dataset.id.split("|")[1]; // FIXED SAFE PARSING
      const all = [...allRetailerFeatures.current, ...allKingpinFeatures.current];

      const feature = all.find((f) => f.properties.Address === addr);
      if (!feature) return;

      const popup = new mapboxgl.Popup({ closeButton: true, maxWidth: "300px" })
        .setLngLat(feature.geometry.coordinates)
        .setHTML(makePopupHTML(feature.properties))
        .addTo(map);

      popup.on("open", () => {
        const btn = document.getElementById("addToTripBtn");
        if (btn) {
          btn.onclick = () => {
            onAddStop({
              label: feature.properties.Retailer || "Stop",
              address: feature.properties.Address || "",
              city: feature.properties.City || "",
              state: feature.properties.State || "",
              zip: feature.properties.Zip || "",
              coords: feature.geometry.coordinates,
            });
          };
        }
      });
    });
  }, [onAddStop]);

  const makePopupHTML = (p: any) => {
    return `
      <div style="font-size:14px; line-height:1.25; color:#222;">
        <strong style="font-size:15px;">${p.Name || p.Retailer}</strong><br/>
        ${p.Address}<br/>
        ${p.City}, ${p.State} ${p.Zip}<br/><br/>
        <strong>Category:</strong> ${p.Category}<br/>
        <strong>Supplier(s):</strong> ${p.Supplier}<br/><br/>
        <button id="addToTripBtn"
          style="
            background:#0a6cff;color:white;border:none;
            padding:4px 6px;border-radius:4px;font-size:13px;cursor:pointer;">
          ➕ Add to Trip
        </button>
      </div>
    `;
  };

  // ============================================================================
  // 🏠 HOME MARKER
  // ============================================================================
  const homeMarkerRef = useRef<Marker | null>(null);

  const updateHomeMarker = () => {
    if (!mapRef.current) return;

    if (homeMarkerRef.current) {
      homeMarkerRef.current.remove();
      homeMarkerRef.current = null;
    }

    if (!homeCoords) return;

    const el = document.createElement("div");
    el.style.width = "22px";
    el.style.height = "22px";
    el.style.backgroundImage = "url('/certis_agroute_app/icons/Blue_Home.png')";
    el.style.backgroundSize = "contain";

    homeMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
      .setLngLat(homeCoords)
      .addTo(mapRef.current);
  };

  // ============================================================================
  // 🚗 ROUTE LINE + SUMMARY
  // ============================================================================
  const updateTripRoute = () => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const id = "trip-line";

    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);

    if (!tripStops || tripStops.length < 2) return;

    const coords = tripStops.map((s) => s.coords);

map.addSource(id, {
  type: "geojson",
  data: {
    type: "Feature",
    properties: {},   // <-- Required fix
    geometry: {
      type: "LineString",
      coordinates: coords,
    },
  },
});

    map.addLayer({
      id,
      type: "line",
      source: id,
      paint: {
        "line-color": "#00c2ff",
        "line-width": 4,
        "line-opacity": 0.9,
      },
    });
  };

  const computeRouteSummary = async () => {
    if (!tripStops || tripStops.length < 2) {
      onRouteSummary(null);
      return;
    }

    try {
      const coords = tripStops.map((s) => s.coords.join(",")).join(";");
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?overview=false&access_token=${mapboxgl.accessToken}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data?.routes?.length > 0) {
        const r = data.routes[0];
        onRouteSummary({
          distance_m: r.distance || 0,
          duration_s: r.duration || 0,
        });
      }
    } catch (e) {
      console.warn("Route summary failed:", e);
    }
  };

  const optimizeRoute = async () => {
    if (!tripStops || tripStops.length < 2) return;

    try {
      const coords = tripStops.map((s) => s.coords.join(",")).join(";");
      const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}?roundtrip=false&source=first&destination=last&overview=false&access_token=${mapboxgl.accessToken}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data?.trips?.length > 0) {
        const order = data.waypoints.map((wp: any) => wp.waypoint_index);
        const optimized = order.map((i: number) => tripStops[i]);
        onOptimizedRoute(optimized);
      }
    } catch (e) {
      console.warn("Optimizer failed:", e);
    }
  };

  // ============================================================================
  // 🔄 TRIP EFFECTS
  // ============================================================================
  useEffect(() => {
    updateHomeMarker();
    updateTripRoute();
    computeRouteSummary();
  }, [tripStops, homeCoords]);

  useEffect(() => {
    if (tripMode === "optimize") {
      optimizeRoute();
    } else {
      updateTripRoute();
      computeRouteSummary();
    }
  }, [tripMode]);

  // ============================================================================
  // 🧩 FINAL RENDER
  // ============================================================================
  return (
    <div
      ref={mapContainer}
      className="w-full h-full"
      style={{ position: "relative", overflow: "hidden" }}
    />
  );
}
