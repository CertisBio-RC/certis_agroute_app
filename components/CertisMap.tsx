// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app";

// ========================================
// 🎨 CATEGORY COLORS
// ========================================
export const categoryColors: Record<string, { color: string; outline?: string }> = {
  Agronomy: { color: "#FFD700", outline: "#fff" },
  "Grain/Feed": { color: "#228B22", outline: "#fff" },
  Feed: { color: "#8B4513", outline: "#fff" },
  "Office/Service": { color: "#1E90FF", outline: "#fff" },
  Distribution: { color: "#FF8C00", outline: "#fff" },
  Kingpin: { color: "#FF0000", outline: "#FFFF00" },
};

// ========================================
// ⚙️ HELPERS
// ========================================
const norm = (v: string) => (v || "").toString().trim().toLowerCase();

function parseSuppliers(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value.replace(/'/g, '"'));
      if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
    } catch {}
  }
  if (typeof value === "string")
    return value.split(/[,;/|]+/).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "object")
    return Object.values(value).map((s: any) => String(s).trim()).filter(Boolean);
  return [];
}

const cleanAddress = (addr: string): string =>
  addr.replace(/\(.*?\)/g, "").replace(/\bP\.?O\.?\s*Box\b.*$/i, "").trim();

const normalizeCategory = (cat: string) => {
  const c = norm(cat);
  if (["agronomy/grain", "agronomygrain", "agronomy hybrid"].includes(c)) return "Agronomy/Grain";
  return cat;
};

const assignDisplayCategory = (cat: string): string => {
  const c = norm(cat);
  if (c.includes("agronomy")) return "Agronomy";
  if (c.includes("grain")) return "Grain/Feed";
  if (c.includes("feed")) return "Feed";
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

export interface CertisMapProps {
  selectedCategories: string[];
  selectedStates: string[];
  selectedSuppliers: string[];
  selectedRetailers: string[];
  onStatesLoaded?: (states: string[]) => void;
  onRetailersLoaded?: (retailers: string[]) => void;
  onSuppliersLoaded?: (suppliers: string[]) => void;
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
  onOptimizedRoute?: (stops: Stop[]) => void;
  homeZip?: string;
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
  homeZip,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const masterFeaturesRef = useRef<any[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const routeLayerId = "trip-route-line";
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const geojsonPath = `${basePath}/data/retailers.geojson?v=20251023`;

  // ========================================
  // 🗺️ MAP INITIALIZATION
  // ========================================
  useEffect(() => {
    if (mapRef.current) return;
    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-98.5795, 39.8283],
      zoom: 4,
      projection: "mercator",
    });
    mapRef.current = map;

    map.on("load", async () => {
      try {
        const response = await fetch(geojsonPath, { cache: "no-store" });
        if (!response.ok) throw new Error(`GeoJSON fetch failed: ${response.status}`);
        const data = await response.json();

        const validFeatures = data.features.filter((f: any) => {
          const coords = f.geometry?.coordinates;
          return Array.isArray(coords) && coords.length === 2 && !isNaN(coords[0]);
        });

        for (const f of validFeatures)
          f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");

        masterFeaturesRef.current = validFeatures;

        // build sets
        const stateSet = new Set<string>();
        const retailerSet = new Set<string>();
        const supplierSet = new Set<string>();

        for (const f of validFeatures) {
          const p = f.properties || {};
          if (p.State) stateSet.add(p.State);
          if (p.Retailer) retailerSet.add(p.Retailer);
          parseSuppliers(p.Suppliers).forEach((s) => supplierSet.add(s));
        }

        onStatesLoaded?.(Array.from(stateSet).sort());
        onRetailersLoaded?.(Array.from(retailerSet).sort());
        onSuppliersLoaded?.(
          Array.from(supplierSet)
            .filter((s) => s && s.toLowerCase() !== "none")
            .sort()
        );

        // GeoJSON source
        map.addSource("retailers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: validFeatures },
        });

        // non-kingpin
        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 3,
            "circle-color": [
              "match",
              ["get", "DisplayCategory"],
              "Agronomy",
              categoryColors.Agronomy.color,
              "Grain/Feed",
              categoryColors["Grain/Feed"].color,
              "Feed",
              categoryColors.Feed.color,
              "Office/Service",
              categoryColors["Office/Service"].color,
              "Distribution",
              categoryColors.Distribution.color,
              "#1d4ed8",
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
          filter: ["!=", ["get", "DisplayCategory"], "Kingpin"],
        });

        // kingpin layer
        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 4,
            "circle-color": categoryColors.Kingpin.color,
            "circle-stroke-width": 2,
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
          filter: ["==", ["get", "DisplayCategory"], "Kingpin"],
        });

        // pointer
        ["retailers-layer", "kingpins-layer"].forEach((l) => {
          map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
        });

        // popups
        map.on("click", ["retailers-layer", "kingpins-layer"], (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const geom = f.geometry as GeoJSON.Point;
          const coords = geom.coordinates as [number, number];
          const p = f.properties || {};
          const suppliers = parseSuppliers(p.Suppliers);
          const retailer = p.Retailer || "Unknown";
          const name = p.Name || "";
          const category = p.DisplayCategory || "N/A";
          const address = cleanAddress(p.Address || "");
          const stopLabel = name ? `${retailer} – ${name}` : retailer;
          const btnId = `add-stop-${Math.random().toString(36).slice(2)}`;

          const html = `
            <div style="font-size:13px;width:340px;background:#1a1a1a;color:#f5f5f5;padding:8px;border-radius:6px;">
              <button id="${btnId}" style="position:absolute;top:6px;right:6px;padding:3px 6px;background:#166534;color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;font-weight:600;">
                + Add to Trip
              </button>
              <div style="margin-top:6px;line-height:1.3em;">
                <strong style="color:#FFD700;">${retailer}</strong><br/>
                <em>${name}</em><br/>
                ${address}<br/>${p.City || ""} ${p.State || ""} ${p.Zip || ""}<br/>
                <strong>Category:</strong> ${category}<br/>
                <strong>Suppliers:</strong> ${suppliers.join(", ") || "None"}
              </div>
            </div>`;

          if (popupRef.current) popupRef.current.remove();
          const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
            .setLngLat(coords)
            .setHTML(html)
            .addTo(map);
          popupRef.current = popup;
          setTimeout(() => {
            const btn = document.getElementById(btnId);
            if (btn && onAddStop)
              btn.onclick = () =>
                onAddStop({
                  label: stopLabel,
                  address,
                  city: p.City || "",
                  state: p.State || "",
                  zip: p.Zip || "",
                  coords,
                });
          }, 100);
        });
      } catch (e) {
        console.error("❌ GeoJSON load error", e);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onAddStop]);

  // ========================================
  // 🔄 FILTERING + SUMMARY
  // ========================================
  useEffect(() => {
    if (!mapRef.current || !masterFeaturesRef.current.length) return;
    const map = mapRef.current;
    const source = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!source) return;

    const filtered = masterFeaturesRef.current.filter((f: any) => {
      const p = f.properties || {};
      const cat = p.DisplayCategory;
      const retailer = p.Retailer || "";
      const state = p.State || "";
      const suppliers = parseSuppliers(p.Suppliers).map(norm);
      if (cat === "Kingpin") return true;
      const matchCat =
        selectedCategories.length === 0 ? cat === "Agronomy" : selectedCategories.includes(cat);
      const matchState = selectedStates.length === 0 || selectedStates.includes(state);
      const matchRetailer =
        selectedRetailers.length === 0 || selectedRetailers.includes(retailer);
      const matchSup =
        selectedSuppliers.length === 0 ||
        selectedSuppliers.some((s) => suppliers.includes(norm(s)));
      return matchCat && matchState && matchRetailer && matchSup;
    });

    source.setData({ type: "FeatureCollection", features: filtered });

    // build summary
    const mapSum = new Map<
      string,
      { retailer: string; count: number; suppliers: Set<string>; states: Set<string>; categories: Set<string> }
    >();
    for (const f of filtered) {
      const p = f.properties || {};
      const r = p.Retailer || "Unknown";
      const c = p.DisplayCategory === "Kingpin" ? "Agronomy" : p.DisplayCategory;
      if (!mapSum.has(r))
        mapSum.set(r, { retailer: r, count: 0, suppliers: new Set(), states: new Set(), categories: new Set() });
      const e = mapSum.get(r)!;
      e.count++;
      e.suppliers = new Set([...e.suppliers, ...parseSuppliers(p.Suppliers)]);
      e.states.add(p.State || "");
      e.categories.add(c);
    }
    const summaries = Array.from(mapSum.values()).map((v) => ({
      retailer: v.retailer,
      count: v.count,
      suppliers: Array.from(v.suppliers),
      states: Array.from(v.states),
      categories: Array.from(v.categories),
    }));
    onRetailerSummary?.(summaries);
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  // ========================================
  // 🚗 ROUTE + HOME MARKER
  // ========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // remove previous route
    if (map.getLayer(routeLayerId)) map.removeLayer(routeLayerId);
    if (map.getSource(routeLayerId)) map.removeSource(routeLayerId);

    // remove old home marker
    if (homeMarkerRef.current) {
      homeMarkerRef.current.remove();
      homeMarkerRef.current = null;
    }

    const points: [number, number][] = [];
    const stops = [...tripStops];
    if (!stops.length) return;

    // nearest neighbor if optimize
    let ordered = [...stops];
    if (tripMode === "optimize" && stops.length > 2) {
      const arr = [...stops];
      const route: Stop[] = [arr.shift()!];
      while (arr.length) {
        const last = route[route.length - 1];
        const nextIdx = arr.reduce((best, cur, i, a) => {
          const d = Math.hypot(cur.coords[0] - last.coords[0], cur.coords[1] - last.coords[1]);
          const bestD = Math.hypot(
            a[best].coords[0] - last.coords[0],
            a[best].coords[1] - last.coords[1]
          );
          return d < bestD ? i : best;
        }, 0);
        route.push(arr.splice(nextIdx, 1)[0]);
      }
      ordered = route;
    }

    ordered.forEach((s) => points.push(s.coords));

    // draw route
    map.addSource(routeLayerId, {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: { type: "LineString", coordinates: points },
      },
    });
    map.addLayer({
      id: routeLayerId,
      type: "line",
      source: routeLayerId,
      paint: { "line-color": "#1E90FFAA", "line-width": 4 },
    });

    // home marker (blue circle)
    if (homeZip && stops.length) {
      const home = stops[0];
      const el = document.createElement("div");
      el.style.width = "10px";
      el.style.height = "10px";
      el.style.borderRadius = "50%";
      el.style.backgroundColor = "#1E90FF";
      el.style.border = "2px solid white";
      homeMarkerRef.current = new mapboxgl.Marker(el)
        .setLngLat(home.coords as LngLatLike)
        .addTo(map);
    }

    // fit bounds
    const bounds = new mapboxgl.LngLatBounds();
    points.forEach((p) => bounds.extend(p));
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 80, duration: 800 });
  }, [tripStops, tripMode, homeZip]);

  return <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />;
}
