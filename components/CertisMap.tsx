// components/CertisMap.tsx

// ============================================================================
// 💠 CERTIS AGROUTE — K3-A GOLD (Corrected Full File)
//   • Retailers = State ∩ Retailer ∩ Category ∩ Supplier
//   • Kingpins = State-only filtering
//   • KINGPIN1 = Always visible (Tier 1)
//   • KINGPIN suppressed when KINGPIN1 present at same coordinates
//   • Parsed categories from comma-separated list
//   • Grain|Feed → Grain/Feed
//   • Office/Service → C-Store/Service/Energy
//   • Satellite-streets-v12 + Mercator enforced
//   • KINGPIN = circle layer
//   • KINGPIN1 = PNG icon (/public/icons/kingpin1.png)
//   • Popup category list sorted by strict hierarchy
// ============================================================================

"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ============================================================================
// CATEGORY COLORS
// ============================================================================
export const categoryColors: Record<string, { color: string; outline?: string }> = {
  Agronomy: { color: "#4CB5FF" },
  "Grain/Feed": { color: "#FFD60A" },
  "C-Store/Service/Energy": { color: "#FFFFFF", outline: "#000000" },
  Distribution: { color: "#9E9E9E" },

  Kingpin: { color: "#E10600", outline: "#FFD60A" },
  Kingpin1: { color: "#0040FF", outline: "#FFFFFF" },
};

// ============================================================================
// HELPERS
// ============================================================================
const norm = (v: any) => (v ?? "").toString().trim().toLowerCase();

// Multi-category parser
function parseCategories(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

// Normalize to master list
function normalizeSingleCategory(cat: string): string {
  const c = norm(cat);

  if (c === "grain" || c === "feed" || c === "grain/feed") return "Grain/Feed";

  if (
    c.includes("office") ||
    c.includes("service") ||
    c.includes("energy") ||
    c.includes("c-store")
  )
    return "C-Store/Service/Energy";

  if (c.includes("distribution")) return "Distribution";

  if (c.includes("kingpin1")) return "Kingpin1";
  if (c.includes("kingpin")) return "Kingpin";

  if (c.includes("ag")) return "Agronomy";

  return "Agronomy";
}

function normalizeCategories(raw: string): string[] {
  const parsed = parseCategories(raw);
  const normed = parsed.map(normalizeSingleCategory);
  return [...new Set(normed)];
}

// Supplier parser (preserves exact)
function parseSuppliers(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim());

  if (typeof v === "string") {
    if (v.startsWith("[")) {
      try {
        const arr = JSON.parse(v.replace(/'/g, '"'));
        if (Array.isArray(arr)) return arr.map((x) => String(x).trim());
      } catch {}
    }
    return v.split(/[,;/|]+/).map((x) => x.trim()).filter(Boolean);
  }

  if (typeof v === "object") return Object.values(v).map((x) => String(x).trim());

  return [];
}

const cleanAddress = (addr: string): string =>
  (addr || "").replace(/\(.*?\)/g, "").replace(/\bP\.?O\.?\s*Box\b.*$/i, "").trim();

// Category hierarchy (popup)
const CATEGORY_ORDER = {
  Agronomy: 1,
  "Grain/Feed": 2,
  "C-Store/Service/Energy": 3,
  Distribution: 4,
  Kingpin: 5,
  Kingpin1: 6,
};

function sortCategories(cats: string[]): string[] {
  return [...cats].sort(
    (a, b) => (CATEGORY_ORDER[a] ?? 999) - (CATEGORY_ORDER[b] ?? 999)
  );
}

// ============================================================================
// TYPES
// ============================================================================
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

  homeCoords?: [number, number] | null;

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
  onAllStopsLoaded?: (s: Stop[]) => void;

  tripStops?: Stop[];
  tripMode?: "entered" | "optimize";
  onOptimizedRoute?: (s: Stop[]) => void;
  onRouteSummary?: (summary: { distance_m: number; duration_s: number } | null) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================
export default function CertisMap({
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
  onOptimizedRoute,
  onRouteSummary,
}: CertisMapProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const masterFeatures = useRef<any[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const homeMarker = useRef<mapboxgl.Marker | null>(null);

  const basePath =
    process.env.NEXT_PUBLIC_BASE_PATH && process.env.NEXT_PUBLIC_BASE_PATH !== ""
      ? process.env.NEXT_PUBLIC_BASE_PATH
      : "/certis_agroute_app";

  const geojsonPath = `${basePath}/data/retailers.geojson?v=${Date.now()}`;

  // ========================================================================
  // POPUP
  // ========================================================================
  const popupHandler = (e: any) => {
    const map = mapRef.current;
    if (!map) return;

    const f = e.features?.[0];
    if (!f) return;

    const p = f.properties || {};
    const coords = f.geometry.coordinates as [number, number];

    const suppliers = parseSuppliers(p.Suppliers);
    const parsed = p.ParsedCategories || [];
    const sortedCats = sortCategories(parsed);

    const isKingpin1 = parsed.includes("Kingpin1");

    const header = isKingpin1
      ? `<strong style="font-size:16px;color:#4DA3FF;">KINGPIN TIER-1 CONTACT</strong><br/>`
      : `<strong style="font-size:15px;color:#FFD700;">${p.Retailer || "Unknown"}</strong><br/>`;

    const html = `
      <div style="font-size:14px;width:360px;background:#1b1b1b;color:#f2f2f2;
                  padding:10px;border-radius:8px;line-height:1.35;">
        ${header}
        <em>${p.Name || ""}</em><br/>
        ${cleanAddress(p.Address || "")}<br/>
        ${p.City || ""}, ${p.State || ""} ${p.Zip || ""}<br/><br/>

        <strong>Category:</strong> ${sortedCats.join(", ")}<br/>
        <strong>Suppliers:</strong> ${suppliers.join(", ") || "None listed"}<br/><br/>

        <button id="btn-${Math.random().toString(36).slice(2)}"
          style="padding:4px 7px;background:#166534;color:white;border:none;
                 border-radius:4px;font-size:12px;cursor:pointer;font-weight:600;">
          + Add to Trip
        </button>
      </div>
    `;

    if (popupRef.current) popupRef.current.remove();
    popupRef.current = new mapboxgl.Popup({ closeButton: true, maxWidth: "none" })
      .setLngLat(coords)
      .setHTML(html)
      .addTo(map);

    // Add-to-Trip
    const el = popupRef.current.getElement();
    if (el && onAddStop) {
      const btn = el.querySelector("button[id^='btn-']") as HTMLButtonElement | null;
      if (btn) {
        btn.onclick = () =>
          onAddStop({
            label: p.Retailer || p.Name || "Unknown",
            address: cleanAddress(p.Address || ""),
            coords,
            city: p.City || "",
            state: p.State || "",
            zip: p.Zip || "",
          });
      }
    }
  };

  // ========================================================================
  // MAP INITIALIZATION
  // ========================================================================
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-96.25, 41.25],
      zoom: 4,
      projection: "mercator",
    });

    mapRef.current = map;

    map.on("load", async () => {
      const data = await fetch(geojsonPath).then((r) => r.json());
      const valid = (data.features || []).filter((f: any) => {
        const c = f.geometry?.coordinates;
        return Array.isArray(c) && !isNaN(c[0]) && !isNaN(c[1]);
      });

      // Normalize categories
      valid.forEach((f: any) => {
        f.properties = f.properties || {};
        f.properties.ParsedCategories = normalizeCategories(
          f.properties.Category || ""
        );
      });

      // KINGPIN suppression if KINGPIN1 overlaps
      const kingpin1Coords = new Set(
        valid
          .filter((f: any) =>
            f.properties.ParsedCategories.includes("Kingpin1")
          )
          .map((f: any) => f.geometry.coordinates.join(","))
      );

      const filtered = valid.filter((f: any) => {
        const parsed = f.properties.ParsedCategories || [];
        const key = f.geometry.coordinates.join(",");
        if (parsed.includes("Kingpin") && kingpin1Coords.has(key)) return false;
        return true;
      });

      masterFeatures.current = filtered;

      // ================================================================
      // Unique lists (corrected version — NO TYPESCRIPT ERRORS)
      // ================================================================
      onStatesLoaded?.(
        [...new Set<string>(filtered.map((f: any) => (f.properties.State || "").trim()))]
          .filter(Boolean)
          .sort()
      );

onRetailersLoaded?.(
  (
    [...new Set(filtered.map((f: any) => String(f.properties.Retailer || "").trim()))]
      .filter(Boolean)
      .sort()
  ) as string[]
);
onSuppliersLoaded?.(
  (
    [...new Set<string>(
      filtered.flatMap((f: any) => parseSuppliers(f.properties.Suppliers) as string[])
    )]
      .filter(Boolean)
      .sort()
  ) as string[]
);


      // ================================================================
      // SEND ALL STOPS TO PAGE
      // ================================================================
      onAllStopsLoaded?.(
        filtered.map((f: any) => {
          const p = f.properties || {};
          return {
            label: p.Retailer || p.Name || "Unknown",
            address: p.Address || "",
            coords: f.geometry.coordinates,
            city: p.City || "",
            state: p.State || "",
            zip: p.Zip || "",
          };
        })
      );

      // ================================================================
      // GEOJSON LAYERS
      // ================================================================
      map.addSource("retailers", {
        type: "geojson",
        data: { type: "FeatureCollection", features: filtered },
      });

      // MAIN RETAILERS
      map.addLayer({
        id: "retailers-layer",
        type: "circle",
        source: "retailers",
        filter: [
          "all",
          ["!", ["in", "Kingpin1", ["get", "ParsedCategories"]]],
          ["!", ["in", "Kingpin", ["get", "ParsedCategories"]]],
        ],
        paint: {
          "circle-radius": 5,
          "circle-color": [
            "case",

            ["in", "Grain/Feed", ["get", "ParsedCategories"]],
            categoryColors["Grain/Feed"].color,

            ["in", "C-Store/Service/Energy", ["get", "ParsedCategories"]],
            categoryColors["C-Store/Service/Energy"].color,

            ["in", "Distribution", ["get", "ParsedCategories"]],
            categoryColors["Distribution"].color,

            categoryColors["Agronomy"].color,
          ],
          "circle-stroke-width": 0.6,
          "circle-stroke-color": "#000",
        },
      });

      // KINGPIN (red circle)
      map.addLayer({
        id: "kingpins-layer",
        type: "circle",
        source: "retailers",
        filter: ["in", "Kingpin", ["get", "ParsedCategories"]],
        paint: {
          "circle-radius": 7,
          "circle-color": categoryColors["Kingpin"].color,
          "circle-stroke-width": 2,
          "circle-stroke-color": categoryColors["Kingpin"].outline,
        },
      });

      // KINGPIN1 (PNG)
      map.loadImage(`${basePath}/icons/kingpin1.png`, (err, image) => {
        if (!err && image && !map.hasImage("kingpin1-icon")) {
          map.addImage("kingpin1-icon", image);
        }

        map.addLayer({
          id: "kingpins1-layer",
          type: "symbol",
          source: "retailers",
          filter: ["in", "Kingpin1", ["get", "ParsedCategories"]],
          layout: {
            "icon-image": "kingpin1-icon",
            "icon-size": 0.90,
            "icon-anchor": "bottom",
            "icon-offset": [0, -12],
          },
        });
      });

      // Cursor + popup
      ["retailers-layer", "kingpins-layer", "kingpins1-layer"].forEach((id) => {
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = "grab"));
        map.on("click", id, popupHandler);
        map.on("touchstart", id, popupHandler);
      });
    });
  }, [
    geojsonPath,
    onStatesLoaded,
    onRetailersLoaded,
    onSuppliersLoaded,
    onAllStopsLoaded,
    onAddStop,
  ]);

  // ========================================================================
  // FILTERING
  // ========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!src) return;

    const normCats = selectedCategories.map(norm);
    const normStatesSel = selectedStates.map(norm);
    const normRetailersSel = selectedRetailers.map(norm);
    const normSupSel = selectedSuppliers.map(norm);

    const filtered = masterFeatures.current.filter((f: any) => {
      const p = f.properties;

      const state = norm(p.State);
      const retailer = norm(p.Retailer);
      const parsed = p.ParsedCategories || [];
      const categories = parsed.map(norm);
      const suppliers = parseSuppliers(p.Suppliers).map(norm);

      const isKP1 = categories.includes("kingpin1");
      const isKP = categories.includes("kingpin");

      // KINGPIN1 always visible
      if (isKP1) return true;

      // KINGPIN = state-only filtering
      if (isKP) {
        return normStatesSel.length === 0 || normStatesSel.includes(state);
      }

      // Regular retailer = full intersection
      const stMatch = normStatesSel.length === 0 || normStatesSel.includes(state);
      const rtMatch = normRetailersSel.length === 0 || normRetailersSel.includes(retailer);
      const ctMatch = normCats.length === 0 || normCats.some((c) => categories.includes(c));
      const spMatch = normSupSel.length === 0 || normSupSel.some((s) => suppliers.includes(s));

      return stMatch && rtMatch && ctMatch && spMatch;
    });

    src.setData({ type: "FeatureCollection", features: filtered });

    // Summary (exclude KP1)
    if (onRetailerSummary) {
      const summary = filtered.reduce((acc: any, f: any) => {
        const p = f.properties;
        const parsed = p.ParsedCategories || [];
        if (parsed.includes("Kingpin1") || parsed.includes("kingpin1")) return acc;

        const r = String(p.Retailer || "Unknown").trim();
        if (!acc[r]) {
          acc[r] = {
            retailer: r,
            count: 0,
            suppliers: new Set<string>(),
            states: new Set<string>(),
            categories: new Set<string>(),
          };
        }

        acc[r].count++;
        parseSuppliers(p.Suppliers).forEach((s) => acc[r].suppliers.add(s));
        if (p.State) acc[r].states.add(String(p.State).trim());
        parsed.forEach((c: string) => acc[r].categories.add(c));

        return acc;
      }, {});

      onRetailerSummary(
        Object.values(summary).map((x: any) => ({
          retailer: x.retailer,
          count: x.count,
          suppliers: [...x.suppliers].sort(),
          states: [...x.states].sort(),
          categories: sortCategories([...x.categories]),
        }))
      );
    }
  }, [
    selectedStates,
    selectedRetailers,
    selectedSuppliers,
    selectedCategories,
    onRetailerSummary,
  ]);

  // ========================================================================
  // HOME MARKER
  // ========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    homeMarker.current?.remove();
    homeMarker.current = null;

    if (!homeCoords) return;

    const el = document.createElement("div");
    el.style.backgroundImage = `url(${basePath}/icons/Blue_Home.png)`;
    el.style.backgroundSize = "contain";
    el.style.width = "30px";
    el.style.height = "30px";

    homeMarker.current = new mapboxgl.Marker({ element: el })
      .setLngLat(homeCoords)
      .addTo(map);
  }, [homeCoords, basePath]);

  // ========================================================================
  // ROUTING
  // ========================================================================
  const clearRoute = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer("route-line")) map.removeLayer("route-line");
    if (map.getSource("route")) map.removeSource("route");
    onRouteSummary?.(null);
  }, [onRouteSummary]);

  const coordsToString = (stops: Stop[]) =>
    stops.map((s) => `${s.coords[0]},${s.coords[1]}`).join(";");

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!tripStops || tripStops.length < 2) {
      clearRoute();
      return;
    }

    const token = mapboxgl.accessToken || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
    let ordered = [...tripStops];

    const hasHomeStart = ordered[0]?.label?.startsWith("Home");
    const hasHomeEnd = ordered[ordered.length - 1]?.label?.startsWith("Home");

    if (!hasHomeStart && homeCoords) {
      ordered.unshift({ label: "Home", address: "Home", coords: homeCoords });
    }
    if (!hasHomeEnd && homeCoords) {
      ordered.push({ label: "Home", address: "Home", coords: homeCoords });
    }

    const interior = ordered.slice(1, -1);

    const doRoute = async () => {
      try {
        if (tripMode === "optimize" && interior.length > 1) {
          const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordsToString(
            ordered
          )}?geometries=geojson&overview=full&source=first&destination=last&roundtrip=false&access_token=${token}`;

          const res = await fetch(url);
          const opt = await res.json();

          if (opt?.trips?.length > 0) {
            const trip = opt.trips[0];

            const feature = {
              type: "Feature",
              geometry: trip.geometry,
              properties: {},
            };

            const src = map.getSource("route") as mapboxgl.GeoJSONSource;
            if (src) src.setData(feature);
            else map.addSource("route", { type: "geojson", data: feature });

            if (!map.getLayer("route-line")) {
              map.addLayer({
                id: "route-line",
                type: "line",
                source: "route",
                paint: { "line-color": "#00B7FF", "line-width": 4 },
              });
            }

            onRouteSummary?.({
              distance_m: trip.distance ?? 0,
              duration_s: trip.duration ?? 0,
            });

            if (onOptimizedRoute && opt.waypoint_indices) {
              const idx = opt.waypoint_indices;
              const reordered = idx.map((i: number) => ordered[i]);
              onOptimizedRoute(reordered);
            }

            return;
          }
        }

        // SIMPLE DIRECTIONS-FALLBACK
        const dir = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsToString(
          ordered
        )}?geometries=geojson&overview=full&access_token=${token}`;

        const res = await fetch(dir);
        const data = await res.json();

        if (data?.routes?.length > 0) {
          const feature = {
            type: "Feature",
            geometry: data.routes[0].geometry,
            properties: {},
          };

          const src = map.getSource("route") as mapboxgl.GeoJSONSource;
          if (src) src.setData(feature);
          else map.addSource("route", { type: "geojson", data: feature });

          if (!map.getLayer("route-line")) {
            map.addLayer({
              id: "route-line",
              type: "line",
              source: "route",
              paint: { "line-color": "#00B7FF", "line-width": 4 },
            });
          }

          onRouteSummary?.({
            distance_m: data.routes[0].distance ?? 0,
            duration_s: data.routes[0].duration ?? 0,
          });
        }
      } catch {
        clearRoute();
      }
    };

    doRoute();
  }, [tripStops, tripMode, homeCoords, clearRoute, onRouteSummary, onOptimizedRoute]);

  // ========================================================================
  // CLEANUP
  // ========================================================================
  useEffect(() => {
    return () => {
      popupRef.current?.remove();
      homeMarker.current?.remove();
      mapRef.current?.remove();
    };
  }, []);

  // ========================================================================
  // RENDER
  // ========================================================================
  return <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />;
}
