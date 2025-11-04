// ========================================
// components/CertisMap.tsx — Phase B.5 (Verified Supplier Fix)
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

const expandCategories = (cat: string): string[] => {
  const c = norm(cat);
  switch (c) {
    case "agronomygrain":
    case "agronomyfeed":
    case "agronomy/grain":
    case "agronomy/feed":
    case "agronomy hybrid":
      return ["Agronomy"];
    case "feed":
    case "grain":
    case "feed/grain":
    case "grain/feed":
      return ["Grain/Feed"];
    case "office/service":
      return ["Office/Service"];
    case "distribution":
      return ["Distribution"];
    case "kingpin":
      return ["Kingpin"];
    default:
      return ["Unknown"];
  }
};
const assignDisplayCategory = (cat: string): string => expandCategories(cat)[0];

const cleanAddress = (addr: string): string =>
  addr.replace(/\(.*?\)/g, "").replace(/\bP\.?O\.?\s*Box\b.*$/i, "").trim();

function parseSuppliers(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string")
    return value.split(/[,;/|]+/).map((x) => x.trim()).filter(Boolean);
  return [];
}

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

export interface CertisMapProps {
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
}: CertisMapProps) {
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

        const valid = data.features
          .filter((f: any) => Array.isArray(f.geometry?.coordinates))
          .map((f: any) => {
            const coords = f.geometry.coordinates.flat();
            const lon = Number(coords[0]);
            const lat = Number(coords[1]);
            if (isNaN(lon) || isNaN(lat)) return null;
            f.geometry.coordinates = [lon, lat];
            f.properties.DisplayCategory = assignDisplayCategory(f.properties.Category);

            // ✅ STRICT SUPPLIER LOGIC
            const s =
              typeof f.properties.Suppliers === "string"
                ? f.properties.Suppliers.trim()
                : "";
            f.properties.ParsedSuppliers = s
              ? s.split(/[,;/|]+/).map((x: string) => x.trim()).filter(Boolean)
              : [];

            return f;
          })
          .filter(Boolean);

        allFeaturesRef.current = valid;

        // ✅ Build distinct filter lists
        const states = new Set<string>();
        const retailers = new Set<string>();
        const suppliers = new Set<string>();
        valid.forEach((f: any) => {
          const p = f.properties;
          if (p.State) states.add(p.State);
          if (p.Retailer) retailers.add(p.Retailer);
          (p.ParsedSuppliers || []).forEach((s: string) => suppliers.add(s));
        });
        onStatesLoaded?.([...states].sort());
        onRetailersLoaded?.([...retailers].sort());
        onSuppliersLoaded?.([...suppliers].sort());

        // ========================================
        // MAP SOURCES
        // ========================================
        map.addSource("retailers", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: valid.filter(
              (f: any) => f.properties.DisplayCategory !== "Kingpin"
            ),
          },
        });
        map.addSource("kingpins", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: valid.filter(
              (f: any) => f.properties.DisplayCategory === "Kingpin"
            ),
          },
        });

        // ========================================
        // MAP LAYERS
        // ========================================
        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2, 6, 3.5, 9, 5],
            "circle-stroke-width": 1.2,
            "circle-stroke-color": "#FFFFFF",
            "circle-color": [
              "match",
              ["get", "DisplayCategory"],
              "Agronomy",
              categoryColors.Agronomy.color,
              "Grain/Feed",
              categoryColors["Grain/Feed"].color,
              "Feed",
              categoryColors.Feed.color,
              "Grain",
              categoryColors.Grain.color,
              "Office/Service",
              categoryColors["Office/Service"].color,
              "Distribution",
              categoryColors.Distribution.color,
              "#1d4ed8",
            ],
          },
        });

        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "kingpins",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4.5, 6, 6, 9, 7.5],
            "circle-color": categoryColors.Kingpin.color,
            "circle-stroke-width": 2.2,
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
        });

        // ========================================
        // POPUPS
        // ========================================
        const popupHandler = (e: any) => {
          const f = e.features?.[0];
          if (!f) return;
          const coords = (f.geometry as any).coordinates.slice(0, 2) as [number, number];
          const p = f.properties;
          const suppliersArr = Array.isArray(p.ParsedSuppliers)
            ? p.ParsedSuppliers
            : [];
          const suppliers =
            suppliersArr.length > 0 ? suppliersArr.join(", ") : "None listed";

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
        console.error("❌ Failed to load GeoJSON", e);
      }
    });
  }, [geojsonPath]);

  // ========================================
  // ZIP CODE HOME MARKER (Geocode)
  // ========================================
  useEffect(() => {
    if (!zipCode || !mapRef.current) return;
    (async () => {
      try {
        const resp = await fetch(
          `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(
            zipCode
          )}&country=US&access_token=${mapboxgl.accessToken}`
        );
        const data = await resp.json();
        const coords = data?.features?.[0]?.geometry?.coordinates;
        if (!coords) return;

        homeMarkerRef.current?.remove();
        const el = document.createElement("img");
        el.src = `${basePath}/icons/Blue-Home.png`;
        el.style.width = "22px";
        el.style.height = "22px";
        el.style.borderRadius = "50%";
        el.style.boxShadow = "0 0 5px rgba(0,0,0,0.5)";

        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat(coords as [number, number])
          .addTo(mapRef.current!);
        homeMarkerRef.current = marker;

        mapRef.current!.flyTo({ center: coords as [number, number], zoom: 7 });
      } catch (e) {
        console.error("ZIP code geocode error:", e);
      }
    })();
  }, [zipCode]);

  // ========================================
  // ROUTE DRAWING
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
          src.setData({
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: route, properties: {} }],
          });
      } catch (e) {
        console.error("Route error:", e);
      }
    })();
  }, [tripStops, tripMode]);

  // ========================================
  // FILTERING + SUMMARY
  // ========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !allFeaturesRef.current.length) return;
    const regularSrc = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!regularSrc) return;

    const filteredRegular = allFeaturesRef.current.filter((f) => {
      const p = f.properties;
      if (p.DisplayCategory === "Kingpin") return false;
      const okState = !selectedStates.length || selectedStates.includes(p.State);
      const okRetailer = !selectedRetailers.length || selectedRetailers.includes(p.Retailer);
      const okCat = !selectedCategories.length || selectedCategories.includes(p.DisplayCategory);
      const supplierList = (p.ParsedSuppliers || []).map(norm);
      const okSupp =
        !selectedSuppliers.length ||
        selectedSuppliers.some((s) => supplierList.includes(norm(s)));
      return okState && okRetailer && okCat && okSupp;
    });

    regularSrc.setData({ type: "FeatureCollection", features: filteredRegular });

    const summaryMap = new Map<
      string,
      { retailer: string; count: number; cats: Set<string>; states: Set<string>; sups: Set<string> }
    >();
    filteredRegular.forEach((f) => {
      const p = f.properties;
      const r = p.Retailer || "Unknown";
      const c = p.DisplayCategory;
      const s = p.State;
      const sups = p.ParsedSuppliers || [];
      if (!summaryMap.has(r))
        summaryMap.set(r, { retailer: r, count: 0, cats: new Set(), states: new Set(), sups: new Set() });
      const e = summaryMap.get(r)!;
      e.count++;
      e.cats.add(c);
      e.states.add(s);
      sups.forEach((x: string) => e.sups.add(x));
    });

    const summaries = [...summaryMap.values()].map((x) => ({
      retailer: x.retailer,
      count: x.count,
      suppliers: [...x.sups],
      states: [...x.states],
      categories: [...x.cats],
    }));
    onRetailerSummary?.(summaries);
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  return <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />;
}
