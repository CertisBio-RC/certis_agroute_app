// ========================================
// components/CertisMap.tsx — Phase A.27b
// Fixed normalized retailer refresh + type-safe state/retailer arrays
// ========================================
"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike, Marker } from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";

// ========================================
// 🎨 CATEGORY COLORS
// ========================================
export const categoryColors: Record<string, { color: string; outline?: string }> = {
  Agronomy: { color: "#1E90FF", outline: "#FFFFFF" },
  "Grain/Feed": { color: "#FFD700", outline: "#FFFFFF" },
  "Office/Service": { color: "#006400", outline: "#FFFFFF" },
  Distribution: { color: "#FF8C00", outline: "#FFFFFF" },
  Kingpin: { color: "#FF0000", outline: "#FFFF00" },
  Other: { color: "#999999", outline: "#FFFFFF" },
};

// ========================================
// ⚙️ HELPERS
// ========================================
const norm = (v: string) => (v || "").toString().trim().toLowerCase();

const assignDisplayCategory = (cat: string): string => {
  const c = norm(cat);
  if (c.includes("kingpin")) return "Kingpin";
  if (c.includes("agronomy")) return "Agronomy";
  if (c.includes("grain") || c.includes("feed")) return "Grain/Feed";
  if (c.includes("office") || c.includes("service")) return "Office/Service";
  if (c.includes("distribution")) return "Distribution";
  return "Other";
};

function parseSuppliers(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "object")
    return Object.values(value).map((v: any) => String(v).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value.replace(/'/g, '"'));
      if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
    } catch {}
  }
  if (typeof value === "string") {
    const v = value.trim();
    if (v.toLowerCase() === "multiple") return ["Multiple"];
    return v.split(/[,;/|]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

const cleanAddress = (addr: string): string =>
  addr.replace(/\(.*?\)/g, "").replace(/\bP\.?O\.?\s*Box\b.*$/i, "").trim();

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
  selectedStates: string[];
  selectedRetailers: string[];
  onStatesLoaded?: (s: string[]) => void;
  onRetailersLoaded?: (r: string[]) => void;
  onRetailerSummary?: (
    summaries: {
      retailer: string;
      count: number;
      suppliers: string[];
      states: string[];
    }[]
  ) => void;
  onAddStop?: (stop: Stop) => void;
  tripStops?: Stop[];
  tripMode?: "entered" | "optimize";
  zipCode?: string;
  homeCoords?: [number, number] | null;
}

// ========================================
// 🗺️ MAIN COMPONENT
// ========================================
export default function CertisMap({
  selectedStates,
  selectedRetailers,
  onStatesLoaded,
  onRetailersLoaded,
  onRetailerSummary,
  onAddStop,
  tripStops = [],
  tripMode = "entered",
  homeCoords,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const allFeaturesRef = useRef<any[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const homeMarkerRef = useRef<Marker | null>(null);
  const geojsonPath = `${basePath}/data/retailers.geojson?v=20251105`;

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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data.features)) throw new Error("Invalid GeoJSON structure");

        const valid = data.features
          .filter((f: any) => Array.isArray(f.geometry?.coordinates))
          .map((f: any) => {
            const [lon, lat] = f.geometry.coordinates;
            if (isNaN(lon) || isNaN(lat)) return null;
            f.geometry.coordinates = [lon, lat];
            f.properties.DisplayCategory = assignDisplayCategory(f.properties.Category);
            return f;
          })
          .filter((f: any) => {
            const cat = norm(f?.properties?.DisplayCategory);
            return cat.includes("agronomy") || cat.includes("kingpin");
          });

        allFeaturesRef.current = valid;

        // ✅ Type-safe string arrays
        const states = Array.from(
          new Set(valid.map((f: any) => String(f.properties.State || "").trim()).filter(Boolean))
        ) as string[];

        const retailers = Array.from(
          new Set(valid.map((f: any) => String(f.properties.Retailer || "").trim()).filter(Boolean))
        ) as string[];

        onStatesLoaded?.(states.sort());
        onRetailersLoaded?.(retailers.sort());

        // Add sources and layers
        const nonKingpins = valid.filter((f: any) => !norm(f.properties.DisplayCategory).includes("kingpin"));
        const kingpins = valid.filter((f: any) => norm(f.properties.DisplayCategory).includes("kingpin"));

        map.addSource("retailers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: nonKingpins },
        });
        map.addSource("kingpins", {
          type: "geojson",
          data: { type: "FeatureCollection", features: kingpins },
        });

        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2, 6, 3.5, 9, 5],
            "circle-stroke-width": 1.2,
            "circle-stroke-color": "#FFFFFF",
            "circle-color": categoryColors.Agronomy.color,
          },
        } as any);

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
        } as any);

        // Popup interaction
        const popupHandler = (e: any) => {
          const f = e.features?.[0];
          if (!f) return;
          const coords = (f.geometry as any).coordinates.slice(0, 2) as [number, number];
          const p = f.properties;
          const suppliersArr = parseSuppliers(p.Suppliers || p.Supplier || p["Supplier(s)"]);
          const suppliers = suppliersArr.length ? suppliersArr.join(", ") : "None listed";
          const retailer = p.Retailer || "Unknown";
          const site = p.Name || "";
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
                onAddStop({
                  label: stopLabel,
                  address: addr,
                  city: p.City,
                  state: p.State,
                  zip: p.Zip,
                  coords,
                });
          }, 100);
        };

        ["retailers-layer", "kingpins-layer"].forEach((l) => {
          map.on("click", l, popupHandler);
          map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
        });
      } catch (e) {
        console.error("❌ Failed to load GeoJSON:", e);
      }
    });
  }, [geojsonPath]);

  // ========================================
  // 🧩 Dynamic Retailer List Refresh (normalized)
  // ========================================
  useEffect(() => {
    if (!onRetailersLoaded || !allFeaturesRef.current.length) return;

    const filtered = allFeaturesRef.current.filter((f) => {
      const st = norm(f.properties.State);
      return !selectedStates.length || selectedStates.some((s) => norm(s) === st);
    });

    let retailers = Array.from(new Set(filtered.map((f) => f.properties.Retailer?.trim()))).filter(Boolean);
    if (!retailers.length)
      retailers = Array.from(new Set(allFeaturesRef.current.map((f) => f.properties.Retailer?.trim()))).filter(Boolean);

    onRetailersLoaded(retailers.sort());
  }, [selectedStates]);

  // ========================================
  // SMART FILTERING (Intersection Logic)
  // ========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !allFeaturesRef.current.length) return;
    const regularSrc = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    const kingpinSrc = map.getSource("kingpins") as mapboxgl.GeoJSONSource;
    if (!regularSrc || !kingpinSrc) return;

    const kingpins = allFeaturesRef.current.filter((f) => norm(f.properties.DisplayCategory).includes("kingpin"));

    const filteredRegular = allFeaturesRef.current.filter((f) => {
      const p = f.properties;
      const isKingpin = norm(p.DisplayCategory).includes("kingpin");
      if (isKingpin) return false;

      const stateMatch = !selectedStates.length || selectedStates.some((s) => norm(s) === norm(p.State));
      const retailerMatch = !selectedRetailers.length || selectedRetailers.some((r) => norm(r) === norm(p.Retailer));
      return stateMatch && retailerMatch;
    });

    regularSrc.setData({ type: "FeatureCollection", features: filteredRegular });
    kingpinSrc.setData({ type: "FeatureCollection", features: kingpins });

    const summaryMap = new Map<string, { retailer: string; count: number; states: Set<string>; sups: Set<string> }>();
    filteredRegular.forEach((f) => {
      const p = f.properties;
      const r = p.Retailer || "Unknown";
      const s = p.State;
      const sups = parseSuppliers(p.Suppliers || p.Supplier || p["Supplier(s)"]);
      if (!summaryMap.has(r)) summaryMap.set(r, { retailer: r, count: 0, states: new Set(), sups: new Set() });
      const e = summaryMap.get(r)!;
      e.count++;
      e.states.add(s);
      sups.forEach((x) => e.sups.add(x));
    });

    onRetailerSummary?.(
      [...summaryMap.values()].map((x) => ({
        retailer: x.retailer,
        count: x.count,
        states: [...x.states],
        suppliers: [...x.sups],
      }))
    );
  }, [selectedStates, selectedRetailers]);

  return <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />;
}
