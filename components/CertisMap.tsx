// ========================================
// components/CertisMap.tsx — Phase B.2c
// Fix: “Style is not done loading” guard
// ========================================
"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app";

// ========================================
// 🎨 CATEGORY COLORS
// ========================================
export const categoryColors: Record<string, { color: string; outline?: string }> = {
  Agronomy: { color: "#1E90FF", outline: "#FFFFFF" },
  "Grain/Feed": { color: "#FFD700", outline: "#FFFFFF" },
  Feed: { color: "#FFD700", outline: "#FFFFFF" },
  Grain: { color: "#FFD700", outline: "#FFFFFF" },
  "Office/Service": { color: "#006400", outline: "#FFFFFF" },
  Distribution: { color: "#FF8C00", outline: "#FFFFFF" },
  Kingpin: { color: "#FF0000", outline: "#FFFF00" },
};

// ========================================
// ⚙️ HELPERS
// ========================================
const norm = (v: string) => (v || "").toString().trim().toLowerCase();

function parseSuppliers(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "object") return Object.values(value).map((v: any) => String(v).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value.replace(/'/g, '"'));
      if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
    } catch {}
  }
  if (typeof value === "string") return value.split(/[,;/|]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

const cleanAddress = (addr: string): string =>
  addr.replace(/\(.*?\)/g, "").replace(/\bP\.?O\.?\s*Box\b.*$/i, "").trim();

const assignDisplayCategory = (cat: string): string => {
  const c = norm(cat);
  if (c.includes("agronomy")) return "Agronomy";
  if (c.includes("feed") || c.includes("grain")) return "Grain/Feed";
  if (c.includes("office")) return "Office/Service";
  if (c.includes("distribution")) return "Distribution";
  if (c.includes("kingpin")) return "Kingpin";
  return "Unknown";
};

// ========================================
// 📍 TYPES
// ========================================
export interface Stop {
  label: string;
  address: string;
  coords: [number, number];
  city?: string;
  state?: string;
  zip?: string | number;
}

// ========================================
// 🗺️ MAIN COMPONENT
// ========================================
export default function CertisMap({
  selectedCategories,
  selectedStates,
  selectedSuppliers,
  selectedRetailers,
  onStatesLoaded,
  onRetailersLoaded,
  onSuppliersLoaded,
  onRetailerSummary,
  onAddStop,
  tripStops = [],
  tripMode = "entered",
  zipCode,
}: {
  selectedCategories: string[];
  selectedStates: string[];
  selectedSuppliers: string[];
  selectedRetailers: string[];
  onStatesLoaded?: (s: string[]) => void;
  onRetailersLoaded?: (r: string[]) => void;
  onSuppliersLoaded?: (s: string[]) => void;
  onRetailerSummary?: (
    summaries: {
      retailer: string;
      count: number;
      suppliers: string[];
      states: string[];
      categories: string[];
    }[]
  ) => void;
  onAddStop?: (stop: Stop) => void;
  tripStops?: Stop[];
  tripMode?: "entered" | "optimize";
  zipCode?: string;
}) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const allFeaturesRef = useRef<any[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const routeSourceId = "trip-route";
  const geojsonPath = `${basePath}/data/retailers.geojson?v=20251103`;

  // ========================================
  // MAP INITIALIZATION
  // ========================================
  useEffect(() => {
    if (mapRef.current) return;
    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-97.5, 41.5],
      zoom: 4.2,
      projection: "mercator",
    });
    mapRef.current = map;

    map.on("load", async () => {
      try {
        const res = await fetch(geojsonPath, { cache: "no-store" });
        const data = await res.json();
        const valid = data.features.map((f: any) => {
          const [lon, lat] = f.geometry.coordinates;
          f.properties.DisplayCategory = assignDisplayCategory(f.properties.Category);
          return f;
        });
        allFeaturesRef.current = valid;

        // Collect filters
        const states = new Set<string>();
        const retailers = new Set<string>();
        const suppliers = new Set<string>();
        valid.forEach((f: any) => {
          const p = f.properties;
          if (p.State) states.add(p.State);
          if (p.Retailer) retailers.add(p.Retailer);
          parseSuppliers(p.Suppliers || p.Supplier || p["Supplier(s)"]).forEach((s) => suppliers.add(s));
        });
        onStatesLoaded?.([...states].sort());
        onRetailersLoaded?.([...retailers].sort());
        onSuppliersLoaded?.([...suppliers].sort());

        // Base source and layers
        map.addSource("retailers-all", { type: "geojson", data: { type: "FeatureCollection", features: valid } });
        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "retailers-all",
          filter: ["==", ["get", "DisplayCategory"], "Kingpin"],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4.5, 6, 6, 9, 7.5],
            "circle-color": categoryColors.Kingpin.color,
            "circle-stroke-width": 2.2,
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
        });
        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers-all",
          filter: ["!=", ["get", "DisplayCategory"], "Kingpin"],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2, 6, 3.5, 9, 5],
            "circle-stroke-width": 1.2,
            "circle-stroke-color": "#FFFFFF",
            "circle-color": [
              "match",
              ["get", "DisplayCategory"],
              "Agronomy", categoryColors.Agronomy.color,
              "Grain/Feed", categoryColors["Grain/Feed"].color,
              "Office/Service", categoryColors["Office/Service"].color,
              "Distribution", categoryColors.Distribution.color,
              "#1d4ed8",
            ],
          },
        });

        // Route line
        map.addSource(routeSourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "trip-route-layer",
          type: "line",
          source: routeSourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0066FF", "line-width": 2.2 },
        });

        // Popups
        const popupHandler = (e: any) => {
          const f = e.features?.[0];
          if (!f) return;
          const coords = f.geometry.coordinates.slice(0, 2) as [number, number];
          const p = f.properties;
          const suppliersArr = parseSuppliers(p.Suppliers || p.Supplier || p["Supplier(s)"]);
          const suppliers = suppliersArr.length ? suppliersArr.join(", ") : "None listed";
          const retailer = p.Retailer || "Unknown";
          const site = p.Name || "";
          const category = p.DisplayCategory || "N/A";
          const addr = cleanAddress(p.Address || "");
          const stopLabel = site ? `${retailer} – ${site}` : retailer;
          const btnId = `add-stop-${Math.random().toString(36).slice(2)}`;

          const html = `
            <div style="font-size:13px;width:360px;background:#1a1a1a;color:#f5f5f5;
                        padding:8px 10px;border-radius:6px;position:relative;">
              <button id="${btnId}" style="position:absolute;top:6px;right:6px;
                       padding:3px 6px;background:#166534;color:#fff;border:none;
                       border-radius:4px;font-size:11px;cursor:pointer;font-weight:600;">
                + Add to Trip
              </button>
              <div style="line-height:1.3em;margin-top:6px;">
                <strong style="font-size:14px;color:#FFD700;">${retailer}</strong><br/>
                <em>${site}</em><br/>
                ${addr}<br/>
                ${p.City || ""} ${p.State || ""} ${p.Zip || ""}<br/>
                <strong>Category:</strong> ${category}<br/>
                <strong>Suppliers:</strong> ${suppliers}
              </div>
            </div>`;
          popupRef.current?.remove();
          const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "none" })
            .setLngLat(coords as LngLatLike)
            .setHTML(html)
            .addTo(map);
          popupRef.current = popup;

          setTimeout(() => {
            const btn = document.getElementById(btnId);
            if (btn && onAddStop)
              btn.onclick = () =>
                onAddStop({ label: stopLabel, address: addr, city: p.City, state: p.State, zip: p.Zip, coords });
          }, 100);
        };
        ["retailers-layer", "kingpins-layer"].forEach((l) => {
          map.on("click", l, popupHandler);
          map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
        });
      } catch (e) {
        console.error("❌ GeoJSON load failed", e);
      }
    });
  }, [geojsonPath]);

  // ========================================
  // 🏠 ZIP → HOME MARKER
  // ========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zipCode) return;
    (async () => {
      try {
        const resp = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(zipCode)}.json?country=US&limit=1&access_token=${mapboxgl.accessToken}`
        );
        const json = await resp.json();
        const feature = json.features?.[0];
        if (!feature) return;
        const [lon, lat] = feature.geometry.coordinates;
        if (homeMarkerRef.current) homeMarkerRef.current.remove();
        const el = document.createElement("img");
        el.src = `${basePath}/icons/Blue-Home.png`;
        el.style.width = "24px";
        el.style.height = "24px";
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([lon, lat])
          .addTo(map);
        homeMarkerRef.current = marker;
      } catch (e) {
        console.error("❌ ZIP geocode failed:", e);
      }
    })();
  }, [zipCode]);

  // ========================================
  // 🚗 ROUTE DRAWING
  // ========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || tripStops.length < 2) return;
    (async () => {
      try {
        const coordsStr = tripStops.map((s) => `${s.coords[0]},${s.coords[1]}`).join(";");
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;
        const res = await fetch(url);
        const json = await res.json();
        const route = json.routes?.[0]?.geometry;
        const src = map.getSource(routeSourceId) as mapboxgl.GeoJSONSource;
        if (route && src)
          src.setData({ type: "FeatureCollection", features: [{ type: "Feature", geometry: route, properties: {} }] });
      } catch (e) {
        console.error("Route error:", e);
      }
    })();
  }, [tripStops, tripMode]);

  // ========================================
  // 🔄 FILTERING (GUARDED)
  // ========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyFilters = () => {
      if (!map.isStyleLoaded() || !map.getLayer("retailers-layer")) return;
      const catFilter =
        selectedCategories.length > 0
          ? ["in", ["get", "DisplayCategory"], ["literal", selectedCategories]]
          : ["in", ["get", "DisplayCategory"], ["literal", ["Agronomy", "Kingpin"]]];
      const stateFilter =
        selectedStates.length > 0
          ? ["in", ["get", "State"], ["literal", selectedStates]]
          : ["all"];
      const retailerFilter =
        selectedRetailers.length > 0
          ? ["in", ["get", "Retailer"], ["literal", selectedRetailers]]
          : ["all"];
      try {
        map.setFilter("retailers-layer", ["all", catFilter, stateFilter, retailerFilter] as any);
      } catch {
        console.warn("Filter deferred; waiting for style to load.");
      }
    };

    if (map.isStyleLoaded()) applyFilters();
    else map.once("styledata", applyFilters);
  }, [selectedCategories, selectedStates, selectedRetailers]);

  return <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />;
}
