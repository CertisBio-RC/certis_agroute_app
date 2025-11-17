// components/CertisMap.tsx

// ================================================================
// 💠 CERTIS AGROUTE — A.28 FINAL S2 GOLD (TYPE-SAFE + POPUP UPGRADE)
//   • True intersection filtering (State ∩ Retailer ∩ Category ∩ Supplier)
//   • Kingpin layer always visible and clickable
//   • Route mode: As Entered OR Optimize
//   • Home → Stops → Home enforcement
//   • Popup readability upgrade (Option A)
//   • Marker sizes: Retailer = 5, Kingpin = 4.5 → 5.5 → 6
//   • Mercator projection (locked by Bailey Rule)
// ================================================================

"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ----------------------------
// CATEGORY COLORS
// ----------------------------
export const categoryColors: Record<
  string,
  { color: string; outline?: string }
> = {
  Agronomy: { color: "#4CB5FF" },
  "Grain/Feed": { color: "#FFD60A" },
  Feed: { color: "#F2B705" },
  "Office/Service": { color: "#FFFFFF" },
  Distribution: { color: "#9E9E9E" },
  Kingpin: { color: "#E10600", outline: "#FFD60A" },
};

// ----------------------------
// NORMALIZERS
// ----------------------------
const norm = (v: any) => (v ?? "").toString().trim().toLowerCase();

function assignDisplayCategory(cat: string): string {
  const c = norm(cat);
  if (
    ["agronomy", "ag retail", "retail", "agronomy/grain", "agronomy grain"].includes(c)
  )
    return "Agronomy";
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
        if (Array.isArray(arr)) return arr.map((x: any) => String(x).trim());
      } catch {}
    }
    return v.split(/[,;/|]+/).map((x) => x.trim()).filter(Boolean);
  }
  if (typeof v === "object")
    return Object.values(v).map((x) => String(x).trim()).filter(Boolean);
  return [];
}

const cleanAddress = (addr: string): string =>
  (addr || "")
    .replace(/\(.*?\)/g, "")
    .replace(/\bP\.?O\.?\s*Box\b.*$/i, "")
    .trim();

// ----------------------------
// TYPES
// ----------------------------
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

// ----------------------------
// COMPONENT START
// ----------------------------
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

  // -------------------------------------------------------
  // 🔥 CRITICAL FIX — correct fallback for GitHub Pages path
  // -------------------------------------------------------
  const basePath =
    process.env.NEXT_PUBLIC_BASE_PATH && process.env.NEXT_PUBLIC_BASE_PATH.length > 0
      ? process.env.NEXT_PUBLIC_BASE_PATH
      : "/certis_agroute_app";

// 🚫 no timestamp cache-buster (GH Pages ignores it anyway)
// 🚫 no version cycling
// 🔥 permanent canonical dataset path
const geojsonPath = `${basePath}/data/retailers_master.geojson`;

  // ----------------------------
  // POPUP HANDLER
  // ----------------------------
  const popupHandler = (e: any) => {
    const map = mapRef.current;
    if (!map) return;
    const f = e.features?.[0];
    if (!f) return;

    const coords = f.geometry?.coordinates;
    if (!coords) return;

    const p = f.properties || {};
    const suppliers = parseSuppliers(p.Suppliers).join(", ") || "None listed";

    const html = `
      <div style="font-size:14px;width:360px;background:#1b1b1b;color:#f2f2f2;
                  padding:10px;border-radius:8px;position:relative;line-height:1.35;">
        <button id="add-${Math.random().toString(36).slice(2)}"
          style="position:absolute;top:6px;right:6px;padding:4px 7px;
                 background:#166534;color:#fff;border:none;border-radius:4px;
                 font-size:12px;cursor:pointer;font-weight:600;">
          + Add to Trip
        </button>

        <div style="margin-top:6px;">
          <strong style="font-size:15px;color:#FFD700;">
            ${p.Retailer || "Unknown"}
          </strong><br/>
          <em>${p.Name || ""}</em><br/>
          ${cleanAddress(p.FullAddress || p.Address || p.Street || "")}<br/>
          ${p.City || ""} ${p.State || ""} ${p.Zip || ""}<br/><br/>

          <strong>Category:</strong> ${p.DisplayCategory}<br/>
          <strong>Suppliers:</strong> ${suppliers}
        </div>
      </div>
    `;

    popupRef.current?.remove();
    popupRef.current = new mapboxgl.Popup({
      closeButton: true,
      maxWidth: "none",
    })
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

  // ----------------------------
  // GEOJSON INITIAL LOAD
  // ----------------------------
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
      try {
        const data = await fetch(geojsonPath).then((r) => r.json());
        const valid = (Array.isArray(data.features) ? data.features : []).filter(
          (f) => {
            const c = f?.geometry?.coordinates;
            return Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]);
          }
        );

        valid.forEach((f) => {
          f.properties = f.properties || {};
          f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category);
        });

        masterFeatures.current = valid;

        // STATES — TS-SAFE
        const states = Array.from(
          new Set(valid.map((f) => String(f.properties?.State || "").trim()))
        )
          .filter(Boolean)
          .sort() as string[];

        onStatesLoaded?.(states);

        // RETAILERS — TS-SAFE
        const retailers = Array.from(
          new Set(valid.map((f) => String(f.properties?.Retailer || "").trim()))
        )
          .filter(Boolean)
          .sort() as string[];

        onRetailersLoaded?.(retailers);

        // SUPPLIERS — TS-SAFE
        const suppliers = Array.from(
          new Set(valid.flatMap((f) => parseSuppliers(f.properties?.Suppliers)))
        )
          .map((s) => String(s || "").trim())
          .filter(
            (s) =>
              s.length > 0 && s.toLowerCase() !== "null" && s.toLowerCase() !== "winfiel"
          )
          .map((s) => (s.toLowerCase() === "winfield" ? "Winfield" : s))
          .sort() as string[];

        onSuppliersLoaded?.(suppliers);

        // STOPS for Search Tile
        const stops: Stop[] = valid.map((f) => {
          const p = f.properties || {};
          return {
            label: p.Retailer || p.Name || "Unknown",
            address: cleanAddress(p.FullAddress || p.Address || p.Street || ""),
            coords: f.geometry.coordinates as [number, number],
            city: p.City || "",
            state: p.State || "",
            zip: p.Zip || "",
          };
        });
        onAllStopsLoaded?.(stops);

        map.addSource("retailers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: valid },
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
      } catch (err) {
        console.error("❌ Map initialization failed:", err);
      }
    });
  }, [
    geojsonPath,
    onStatesLoaded,
    onRetailersLoaded,
    onSuppliersLoaded,
    onAddStop,
    onAllStopsLoaded,
  ]);

  // ----------------------------
  // HOME MARKER
  // ----------------------------
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

  // ----------------------------
  // FILTERING
  // ----------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource | null;
    if (!src) return;

    const filtered = masterFeatures.current.filter((f) => {
      const p = f.properties || {};
      const state = norm(p.State);
      const retailer = norm(p.Retailer);
      const category = norm(p.DisplayCategory);
      const suppliers = parseSuppliers(p.Suppliers).map(norm);

      const stMatch = selectedStates.length === 0 || selectedStates.includes(state);
      const rtMatch =
        selectedRetailers.length === 0 || selectedRetailers.includes(retailer);
      const spMatch =
        selectedSuppliers.length === 0 ||
        selectedSuppliers.some((s) => suppliers.includes(norm(s)));
      const ctMatch =
        category === "kingpin" ||
        selectedCategories.length === 0 ||
        selectedCategories.includes(category);

      return stMatch && rtMatch && spMatch && ctMatch;
    });

    src.setData({
      type: "FeatureCollection",
      features: filtered,
    });

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
        if (p.DisplayCategory) acc[r].categories.add(String(p.DisplayCategory).trim());
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

  // ----------------------------
  // ROUTING
  // ----------------------------
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
              const indices = trip.waypoint_indices;
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

  // ----------------------------
  // CLEANUP
  // ----------------------------
  useEffect(() => {
    return () => {
      popupRef.current?.remove();
      homeMarker.current?.remove();
      mapRef.current?.remove();
    };
  }, []);

  // ----------------------------
  // RENDER
  // ----------------------------
  return (
    <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />
  );
}
