// ========================================
// components/CertisMap.tsx — Phase E.1
// ✅ Restore Gold Baseline marker styling (no white borders)
// ✅ Fix retailer/state filtering for list + summary
// ✅ Remove static home icon
// ✅ Keep Kingpins hidden until state selection
// ========================================
"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";

mapboxgl.accessToken =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  "pk.eyJ1IjoiY2VydGlzLWJpbyIsImEiOiJjbHVsbXo3cnAwM2NwMmlzN3ljbnRtOXFnIn0.K6c8mTn3bQ_cHleO5TiJfg";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";

// ========================================
// 🎨 CATEGORY COLORS (Gold Baseline)
// ========================================
export const categoryColors: Record<string, string> = {
  Agronomy: "#1E90FF",
  "Grain/Feed": "#FFD700",
  "Office/Service": "#006400",
  Distribution: "#FF8C00",
  Kingpin: "#FF0000",
  Other: "#999999",
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
    summaries: { retailer: string; count: number; suppliers: string[]; states: string[] }[]
  ) => void;
  onAddStop?: (stop: Stop) => void;
  onExportLinksReady?: (links: { google: string; apple: string } | null) => void;
  onTripStatsReady?: (stats: { distanceMi: number; durationHr: number } | null) => void;
  tripStops?: Stop[];
  tripMode?: "entered" | "optimize";
  homeCoords?: [number, number] | null;
}

// ========================================
// 🧮 ROUTING
// ========================================
async function getRouteGeoJSON(
  coords: [number, number][],
  optimize: boolean
): Promise<{ geojson: any; distanceMi: number; durationHr: number } | null> {
  if (coords.length < 2) return null;
  const baseUrl = optimize
    ? "https://api.mapbox.com/optimized-trips/v1/mapbox/driving/"
    : "https://api.mapbox.com/directions/v5/mapbox/driving/";
  const coordStr = coords.map((c) => `${c[0]},${c[1]}`).join(";");
  const url = `${baseUrl}${coordStr}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;

  try {
    const res = await fetch(url);
    const json = await res.json();
    const route =
      optimize && json.trips?.[0]
        ? json.trips[0]
        : !optimize && json.routes?.[0]
        ? json.routes[0]
        : null;
    if (!route?.geometry) return null;
    const distanceMi = (route.distance || 0) / 1609.34;
    const durationHr = (route.duration || 0) / 3600;
    return { geojson: { type: "Feature", geometry: route.geometry }, distanceMi, durationHr };
  } catch (err) {
    console.error("❌ Route generation failed:", err);
    return null;
  }
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
  onExportLinksReady,
  onTripStatsReady,
  tripStops = [],
  tripMode = "entered",
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const allFeaturesRef = useRef<any[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const routeSourceId = "trip-route-source";
  const routeLayerId = "trip-route-layer";
  const geojsonPath = `${basePath}/data/retailers.geojson?v=20251106`;

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
            const [lon, lat] = f.geometry.coordinates;
            if (isNaN(lon) || isNaN(lat)) return null;
            f.geometry.coordinates = [lon, lat];
            f.properties.DisplayCategory = assignDisplayCategory(f.properties.Category);
            return f;
          })
          .filter(Boolean);

        allFeaturesRef.current = valid;

        const states = Array.from(
          new Set(valid.map((f: any) => String(f.properties.State || "").trim()).filter(Boolean))
        ).sort();
        const retailers = Array.from(
          new Set(valid.map((f: any) => String(f.properties.Retailer || "").trim()).filter(Boolean))
        ).sort();

        onStatesLoaded?.(states);
        onRetailersLoaded?.(retailers);

        // Channel summaries
        const summaries = retailers.map((r) => {
          const subset = valid.filter((f: any) => norm(f.properties.Retailer) === norm(r));
          const suppliers = Array.from(
            new Set(
              subset.flatMap((f: any) =>
                parseSuppliers(f.properties.Suppliers || f.properties.Supplier || f.properties["Supplier(s)"])
              )
            )
          );
          const statesSet = Array.from(new Set(subset.map((f: any) => f.properties.State).filter(Boolean)));
          return { retailer: r, count: subset.length, suppliers, states: statesSet };
        });
        onRetailerSummary?.(summaries);

        // Sources
        map.addSource("retailers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addSource("kingpins", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        // Layers
        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2, 9, 5],
            "circle-color": [
              "match",
              ["get", "DisplayCategory"],
              "Agronomy",
              categoryColors.Agronomy,
              "Grain/Feed",
              categoryColors["Grain/Feed"],
              "Office/Service",
              categoryColors["Office/Service"],
              "Distribution",
              categoryColors.Distribution,
              "Other",
              categoryColors.Other,
              "#AAAAAA",
            ],
            "circle-stroke-width": 0.8,
            "circle-stroke-color": "#000000",
          },
        });

        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "kingpins",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 9, 7],
            "circle-color": categoryColors.Kingpin,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#FFFF00",
          },
        });

        // Popups
        const popupHandler = (e: any) => {
          const f = e.features?.[0];
          if (!f) return;
          const coords = (f.geometry as any).coordinates.slice(0, 2);
          const p = f.properties;
          const addr = cleanAddress(p.Address || "");
          const stopLabel = p.Name ? `${p.Retailer} – ${p.Name}` : p.Retailer || "Unknown";
          const btnId = `add-stop-${Math.random().toString(36).slice(2)}`;
          const category = p.DisplayCategory || p.Category || "Other";

          const html = `
            <div style="font-size:13px;width:340px;background:#1a1a1a;color:#f5f5f5;
                        padding:8px 10px;border-radius:6px;position:relative;">
              <button id="${btnId}" style="position:absolute;top:6px;right:6px;
                       padding:3px 6px;background:#166534;color:#fff;border:none;
                       border-radius:4px;font-size:11px;cursor:pointer;font-weight:600;">
                + Add to Trip
              </button>
              <div style="margin-top:6px;line-height:1.3em;">
                <strong style="font-size:14px;color:#FFD700;">${p.Retailer}</strong><br/>
                <em>${p.Name || ""}</em><br/>
                <span style="color:#87CEFA;"><strong>Category:</strong> ${category}</span><br/>
                ${addr}<br/>${p.City || ""} ${p.State || ""} ${p.Zip || ""}<br/>
                <strong>Suppliers:</strong> ${
                  parseSuppliers(p.Suppliers || p.Supplier || p["Supplier(s)"]).join(", ") || "None"
                }
              </div>
            </div>`;

          popupRef.current?.remove();
          const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
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
  // 🚗 ROUTE HANDLING
  // ========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    async function drawRoute() {
      const coords = tripStops.map((s) => s.coords);
      if (coords.length < 2) {
        if (map.getLayer(routeLayerId)) map.removeLayer(routeLayerId);
        if (map.getSource(routeSourceId)) map.removeSource(routeSourceId);
        onExportLinksReady?.(null);
        onTripStatsReady?.(null);
        return;
      }

      const routeData = await getRouteGeoJSON(coords, tripMode === "optimize");
      if (!routeData) return;

      const { geojson, distanceMi, durationHr } = routeData;

      if (map.getLayer(routeLayerId)) map.removeLayer(routeLayerId);
      if (map.getSource(routeSourceId)) map.removeSource(routeSourceId);

      map.addSource(routeSourceId, { type: "geojson", data: geojson });
      map.addLayer({
        id: routeLayerId,
        type: "line",
        source: routeSourceId,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#00BFFF", "line-width": 4 },
      });

      onTripStatsReady?.({
        distanceMi: parseFloat(distanceMi.toFixed(1)),
        durationHr: parseFloat(durationHr.toFixed(1)),
      });

      const google =
        "https://www.google.com/maps/dir/" +
        encodeURIComponent(coords.map((c) => c.join(",")).join("/"));
      const apple =
        "https://maps.apple.com/?dirflg=d&t=m&daddr=" +
        encodeURIComponent(coords.map((c) => c.join(",")).join(" to: "));
      onExportLinksReady?.({ google, apple });
    }

    drawRoute();
  }, [tripStops, tripMode]);

  // ========================================
  // 🧩 FILTERING + STATE-BASED LIST UPDATE
  // ========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !allFeaturesRef.current.length) return;
    const regSrc = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    const kpSrc = map.getSource("kingpins") as mapboxgl.GeoJSONSource;
    if (!regSrc || !kpSrc) return;

    const filteredRegular = allFeaturesRef.current.filter((f) => {
      const p = f.properties;
      const isKingpin = norm(p.DisplayCategory).includes("kingpin");
      if (isKingpin) return false;
      const sMatch =
        !selectedStates.length ||
        selectedStates.some((s) => norm(s) === norm(p.State || ""));
      const rMatch =
        !selectedRetailers.length ||
        selectedRetailers.some((r) => norm(r) === norm(p.Retailer || ""));
      return sMatch && rMatch;
    });

    const kingpins = allFeaturesRef.current.filter((f) => {
      const p = f.properties;
      const isKP = norm(p.DisplayCategory).includes("kingpin");
      if (!isKP) return false;
      const sMatch =
        !selectedStates.length ||
        selectedStates.some((s) => norm(s) === norm(p.State || ""));
      return sMatch;
    });

    regSrc.setData({ type: "FeatureCollection", features: filteredRegular });
    kpSrc.setData({ type: "FeatureCollection", features: kingpins });

    // Update visible retailer list + summaries
    const visibleRetailers = Array.from(
      new Set(filteredRegular.map((f) => String(f.properties.Retailer || "").trim()).filter(Boolean))
    ).sort();

    onRetailersLoaded?.(visibleRetailers);

    const summaries = visibleRetailers.map((r) => {
      const subset = filteredRegular.filter((f) => norm(f.properties.Retailer) === norm(r));
      const suppliers = Array.from(
        new Set(
          subset.flatMap((f) =>
            parseSuppliers(f.properties.Suppliers || f.properties.Supplier || f.properties["Supplier(s)"])
          )
        )
      );
      const statesSet = Array.from(new Set(subset.map((f) => f.properties.State).filter(Boolean)));
      return { retailer: r, count: subset.length, suppliers, states: statesSet };
    });
    onRetailerSummary?.(summaries);
  }, [selectedStates, selectedRetailers]);

  return <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />;
}
