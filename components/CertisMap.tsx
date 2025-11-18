// components/CertisMap.tsx

// ============================================================================
// 💠 CERTIS AGROUTE — K2-A GOLD  (100% Filtering Fix)
//   • Retailers = State ∩ Retailer ∩ Category ∩ Supplier
//   • Kingpins = State-only filtering (immune to Retailer / Category / Supplier)
//   • DisplayCategory normalization preserved on every update
//   • Metadata populated on first load
//   • Routing + Popups unchanged
//   • Satellite-streets-v12 + Mercator enforced (Bailey Rules)
//   • GeoJSON loaded via fetch (static export compliant)
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
  Feed: { color: "#F2B705" },
  "Office/Service": { color: "#FFFFFF" },
  Distribution: { color: "#9E9E9E" },
  Kingpin: { color: "#E10600", outline: "#FFD60A" },
};

// ============================================================================
// HELPERS
// ============================================================================
const norm = (v: any) => (v ?? "").toString().trim().toLowerCase();

function assignDisplayCategory(cat: string): string {
  const c = norm(cat);
  if (["agronomy", "ag retail", "agronomy/grain", "agronomy grain"].includes(c)) return "Agronomy";
  if (c.includes("grain") || c.includes("feed")) return "Grain/Feed";
  if (c.includes("office")) return "Office/Service";
  if (c.includes("distribution")) return "Distribution";
  if (c.includes("kingpin")) return "Kingpin";
  return "Agronomy";
}

function parseSuppliers(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
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
  (addr || "")
    .replace(/\(.*?\)/g, "")
    .replace(/\bP\.?O\.?\s*Box\b.*$/i, "")
    .trim();

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
  onAllStopsLoaded?: (stops: Stop[]) => void;

  tripStops?: Stop[];
  tripMode?: "entered" | "optimize";
  onOptimizedRoute?: (stops: Stop[]) => void;
  onRouteSummary?: (summary: { distance_m: number; duration_s: number } | null) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================
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
    onOptimizedRoute,
    onRouteSummary,
  } = props;

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

  // ============================================================================
  // POPUP HANDLER
  // ============================================================================
  const popupHandler = (e: any) => {
    const map = mapRef.current;
    if (!map) return;
    const f = e.features?.[0];
    if (!f) return;

    const coords = f.geometry?.coordinates;
    const p = f.properties || {};
    const suppliers = parseSuppliers(p.Suppliers).join(", ") || "None listed";

    const html = `
      <div style="font-size:14px;width:360px;background:#1b1b1b;color:#f2f2f2;
                  padding:10px;border-radius:8px;position:relative;line-height:1.35;">
        <button id="add-${Math.random()
          .toString(36)
          .slice(2)}"
          style="position:absolute;top:6px;right:6px;padding:4px 7px;
                 background:#166534;color:#fff;border:none;border-radius:4px;
                 font-size:12px;cursor:pointer;font-weight:600;">
          + Add to Trip
        </button>

        <strong style="font-size:15px;color:#FFD700;">
          ${p.Retailer || "Unknown"}
        </strong><br/>
        <em>${p.Name || ""}</em><br/>
        ${cleanAddress(p.FullAddress || p.Address || p.Street || "")}<br/>
        ${p.City || ""} ${p.State || ""} ${p.Zip || ""}<br/><br/>

        <strong>Category:</strong> ${p.DisplayCategory}<br/>
        <strong>Suppliers:</strong> ${suppliers}
      </div>
    `;

    popupRef.current?.remove();
    popupRef.current = new mapboxgl.Popup({ closeButton: true, maxWidth: "none" })
      .setLngLat(coords as LngLatLike)
      .setHTML(html)
      .addTo(map);

    const el = popupRef.current.getElement();
    if (el && onAddStop) {
      const btn = el.querySelector("button[id^='add-']") as HTMLButtonElement | null;
      if (btn) {
        btn.onclick = () =>
          onAddStop({
            label: p.Retailer || p.Name || "Unknown",
            address: cleanAddress(p.FullAddress || p.Address || p.Street || ""),
            coords: coords as [number, number],
            city: p.City || "",
            state: p.State || "",
            zip: p.Zip || "",
          });
      }
    }
  };

  // ============================================================================
  // MAP INITIALIZATION
  // ============================================================================
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
        const c = f?.geometry?.coordinates;
        return Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]);
      });

      valid.forEach((f: any) => {
        f.properties = f.properties || {};
        f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category);
      });

      masterFeatures.current = valid;

// ============================================================
// 🔄 SEND ALL STOPS UP TO PAGE (SearchLocationsTile)
// ============================================================
if (onAllStopsLoaded) {
  const stops = valid.map((f: any) => {
    const p = f.properties || {};
    return {
      label: p.Retailer || p.Name || "Unknown",
      address: p.FullAddress || p.Address || p.Street || "",
      coords: f.geometry.coordinates as [number, number],
      city: p.City || "",
      state: p.State || "",
      zip: p.Zip || "",
    };
  });
  onAllStopsLoaded(stops);
}


// Populate dropdowns
onStatesLoaded?.(
  ([...new Set(
    valid.map((f: any) =>
      String(f.properties?.State || "").trim()
    )
  )] as string[])
    .filter(Boolean)
    .sort()
);

onRetailersLoaded?.(
  ([...new Set(
    valid.map((f: any) =>
      String(f.properties?.Retailer || "").trim()
    )
  )] as string[])
    .filter(Boolean)
    .sort()
);

onSuppliersLoaded?.(
  ([...new Set(
    valid.flatMap((f: any) =>
      parseSuppliers(f.properties?.Suppliers)
        .map((x: any) => String(x).trim())
    )
  )] as string[])
    .filter((x) => x.length > 0)
    .sort()
);
map.addSource("retailers", {
  type: "geojson",
  data: {
    type: "FeatureCollection",
    features: valid
  }
});
      map.addLayer({
        id: "retailers-layer",
        type: "circle",
        source: "retailers",
        filter: ["!=", ["get", "DisplayCategory"], "Kingpin"],
        paint: {
          "circle-radius": 5,
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
            "#4CB5FF",
          ],
          "circle-stroke-width": 0.6,
          "circle-stroke-color": "#000",
        },
      });

      map.addLayer({
        id: "kingpins-layer",
        type: "circle",
        source: "retailers",
        filter: ["==", ["get", "DisplayCategory"], "Kingpin"],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            4.5,
            6,
            5.5,
            9,
            6,
          ],
          "circle-color": categoryColors.Kingpin.color,
          "circle-stroke-width": 2,
          "circle-stroke-color": categoryColors.Kingpin.outline,
        },
      });

      map.getCanvas().style.cursor = "grab";
      const enter = () => (map.getCanvas().style.cursor = "pointer");
      const leave = () => (map.getCanvas().style.cursor = "grab");
      map.on("mouseenter", "retailers-layer", enter);
      map.on("mouseleave", "retailers-layer", leave);
      map.on("mouseenter", "kingpins-layer", enter);
      map.on("mouseleave", "kingpins-layer", leave);
      map.on("click", "retailers-layer", popupHandler);
      map.on("click", "kingpins-layer", popupHandler);
// ============================================================================
// 📱 MOBILE POPUP FIX — improves tap detection & hitbox size
//   • Adds "touchstart" popup triggers for iOS/Android
//   • Increases retailer/kingpin hitboxes slightly on mobile only
//   • ZERO impact on filtering logic or desktop behavior
// ============================================================================
const isMobile =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);

//1️⃣ Improve touch hitboxes on mobile
if (isMobile) {
  try {
    // Retailers a bit larger for easier tapping
    map.setPaintProperty("retailers-layer", "circle-radius", 8);

    // Kingpins enlarged proportionally (still respects Bailey Rule scaling)
    map.setPaintProperty("kingpins-layer", "circle-radius", [
      "interpolate",
      ["linear"],
      ["zoom"],
      3, 6,
      6, 7.5,
      9, 9
    ]);
  } catch (e) {
    console.warn("Mobile hitbox patch skipped:", e);
  }
}

// 2️⃣ Add touchstart (mobile primary tap) for popups
map.on("touchstart", "retailers-layer", popupHandler);
map.on("touchstart", "kingpins-layer", popupHandler);

// 3️⃣ Defensive re-bind of click (does not overwrite your existing handlers)
map.on("click", "retailers-layer", popupHandler);
map.on("click", "kingpins-layer", popupHandler);

// ============================================================================
    });
  }, [
    geojsonPath,
    onStatesLoaded,
    onRetailersLoaded,
    onSuppliersLoaded,
    onAllStopsLoaded,
    onAddStop,
  ]);

// ============================================================================
// FILTERING (K2-A GOLD)
// ============================================================================
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;
  const src = map.getSource("retailers") as mapboxgl.GeoJSONSource | null;
  if (!src) return;

  const filtered = masterFeatures.current
    .filter((f: any) => {
      const p = f.properties || {};

      // Fix normalization
      const state = norm(p.State);
      const retailer = norm(p.Retailer);
      const category = norm(p.DisplayCategory);
      const suppliers = parseSuppliers(p.Suppliers).map(norm);
      const isKingpin = category === "kingpin";

      // Normalize all dropdown selections
      const normStates = selectedStates.map(norm);
      const normRetailers = selectedRetailers.map(norm);
      const normCategories = selectedCategories.map(norm);
      const normSuppliers = selectedSuppliers.map(norm);

      // KINGPINS → State-only filtering
      if (isKingpin) {
        return normStates.length === 0 || normStates.includes(state);
      }

      // RETAILERS → FULL INTERSECTION
      const stMatch = normStates.length === 0 || normStates.includes(state);
      const rtMatch =
        normRetailers.length === 0 || normRetailers.includes(retailer);
      const ctMatch =
        normCategories.length === 0 || normCategories.includes(category);
      const spMatch =
        normSuppliers.length === 0 ||
        normSuppliers.some((s) => suppliers.includes(s));

      return stMatch && rtMatch && spMatch && ctMatch;
    })
    .map((f: any) => {
      const p = f.properties || {};
      return {
        ...f,
        properties: {
          ...p,
          DisplayCategory: assignDisplayCategory(p.Category),
          Suppliers: p.Suppliers ?? "",
          State: p.State ?? "",
          Retailer: p.Retailer ?? "",
        },
      };
    });

  src.setData({ type: "FeatureCollection", features: filtered });

  if (onRetailerSummary) {
    const summary = filtered.reduce((acc: any, f: any) => {
      const p = f.properties || {};
      const r = String(p.Retailer || "Unknown").trim();
      if (!acc[r])
        acc[r] = {
          retailer: r,
          count: 0,
          suppliers: new Set<string>(),
          states: new Set<string>(),
          categories: new Set<string>(),
        };
      acc[r].count++;
      parseSuppliers(p.Suppliers).forEach((s) => acc[r].suppliers.add(s));
      if (p.State) acc[r].states.add(String(p.State).trim());
      if (p.DisplayCategory)
        acc[r].categories.add(String(p.DisplayCategory).trim());
      return acc;
    }, {});
    onRetailerSummary(
      Object.values(summary).map((x: any) => ({
        retailer: x.retailer,
        count: x.count,
        suppliers: [...x.suppliers].sort(),
        states: [...x.states].sort(),
        categories: [...x.categories].sort(),
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

  // ============================================================================
  // HOME MARKER
  // ============================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    homeMarker.current?.remove();
    homeMarker.current = null;
    if (!homeCoords) return;

    const el = document.createElement("div");
    el.className = "home-marker";
    el.style.backgroundImage = `url(${basePath}/icons/Blue_Home.png)`;
    el.style.backgroundSize = "contain";
    el.style.backgroundRepeat = "no-repeat";
    el.style.width = "30px";
    el.style.height = "30px";

    homeMarker.current = new mapboxgl.Marker({ element: el })
      .setLngLat(homeCoords as LngLatLike)
      .addTo(map);
  }, [homeCoords, basePath]);

  // ============================================================================
  // ROUTING (unchanged)
  // ============================================================================
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
          const optURL = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordsToString(
            ordered
          )}?geometries=geojson&overview=full&source=first&destination=last&roundtrip=false&access_token=${encodeURIComponent(
            token
          )}`;
          const optResp = await fetch(optURL);
          const opt = await optResp.json();

          if (opt?.trips?.length > 0) {
            const trip = opt.trips[0];
            const feature: GeoJSON.Feature = {
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
              const indices = opt.waypoint_indices;
              const reordered = indices.map((i: number) => ordered[i]);
              onOptimizedRoute(reordered);
            }

            return;
          }
        }

        const dirURL = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsToString(
          ordered
        )}?geometries=geojson&overview=full&steps=false&access_token=${encodeURIComponent(
          token
        )}`;
        const dirResp = await fetch(dirURL);
        const dirData = await dirResp.json();

        if (dirData?.routes?.length > 0) {
          const feature: GeoJSON.Feature = {
            type: "Feature",
            geometry: dirData.routes[0].geometry,
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
            distance_m: dirData.routes[0].distance ?? 0,
            duration_s: dirData.routes[0].duration ?? 0,
          });

          if (
            tripMode === "optimize" &&
            onOptimizedRoute &&
            dirData.routes?.[0]?.waypoint_indices
          ) {
            const indices = dirData.routes[0].waypoint_indices;
            const reordered = indices.map((i: number) => ordered[i]);
            onOptimizedRoute(reordered);
          }
        }
      } catch {
        clearRoute();
      }
    };

    doRoute();
  }, [tripStops, tripMode, homeCoords, clearRoute, onRouteSummary, onOptimizedRoute]);

  // ============================================================================
  // UNMOUNT CLEANUP
  // ============================================================================
  useEffect(() => {
    return () => {
      popupRef.current?.remove();
      homeMarker.current?.remove();
      mapRef.current?.remove();
    };
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================
  return <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />;
}
