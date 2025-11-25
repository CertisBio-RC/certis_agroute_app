// FULL REGENERATED CertisMap.tsx — PART 1/4 (K4 GOLD — Single Kingpin Layer + PNG Star) NEW

"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ============================================================================
// CATEGORY COLORS — Final (Mint Green Agronomy + White Outline + Single Kingpin PNG)
// ============================================================================
export const categoryColors: Record<string, { color: string; outline?: string }> = {
  Agronomy: { color: "#5CFF7A", outline: "#FFFFFF" }, // mint + white
  "Grain/Feed": { color: "#FFD60A" },
  "C-Store/Service/Energy": { color: "#000000", outline: "#FFFFFF" },
  Distribution: { color: "#8E8E8E" },
  "Corporate HQ": { color: "#E10600", outline: "#FFD60A" },
  Kingpin: { color: "#0040FF" }, // only used for fallback; PNG star used for display
};

// ============================================================================
// HELPERS
// ============================================================================
const norm = (v: any) => (v ?? "").toString().trim().toLowerCase();

function parseCategories(raw: string): string[] {
  if (!raw) return [];
  return raw.split(",").map((x) => x.trim()).filter(Boolean);
}

function normalizeSingleCategory(cat: string): string {
  const c = norm(cat);

  if (["grain", "feed", "grain/feed", "grain|feed"].includes(c)) return "Grain/Feed";
  if (c.includes("office") || c.includes("service") || c.includes("energy") || c.includes("c-store"))
    return "C-Store/Service/Energy";
  if (c.includes("distribution")) return "Distribution";
  if (c.includes("corporate") || c.includes("hq")) return "Corporate HQ";
  if (c.includes("kingpin")) return "Kingpin"; // ONLY Kingpin

  return "Agronomy";
}

function normalizeCategories(raw: string): string[] {
  return [...new Set(parseCategories(raw).map(normalizeSingleCategory))];
}

function parseSuppliers(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim());
  if (typeof v === "string") return v.split(/[,;/|]+/).map((x) => x.trim());
  if (typeof v === "object") return Object.values(v).map((x) => String(x).trim());
  return [];
}

const cleanAddress = (addr: string): string => (addr || "").replace(/\(.*?\)/g, "").trim();

const CATEGORY_ORDER = {
  Agronomy: 1,
  "Grain/Feed": 2,
  "C-Store/Service/Energy": 3,
  Distribution: 4,
  "Corporate HQ": 5,
  Kingpin: 6,
};

const sortCategories = (cats: string[]) => [...cats].sort((a, b) => (CATEGORY_ORDER[a] ?? 999) - (CATEGORY_ORDER[b] ?? 999));

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
// MAIN COMPONENT — START OF PART 1
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

  // Dynamic cache-busting
  const retailersPath = `${basePath}/data/retailers.geojson?v=${Date.now()}`;
  const kingpinPath = `${basePath}/data/kingpin.geojson?v=${Date.now()}`;

// === END PART 1 ===
// ============================================================================
// PART 2 — MAP INITIALIZATION + LOADING RETAILERS + KINGPINS
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
      // -----------------------------------------------------------
      // LOAD RETAILERS (Main GeoJSON)
      // -----------------------------------------------------------
      const retailersData = await fetch(retailersPath).then((r) => r.json());

      const retailerFeatures = (retailersData.features || []).filter((f: any) => {
        const c = f.geometry?.coordinates;
        return Array.isArray(c) && !isNaN(c[0]) && !isNaN(c[1]);
      });

      // Normalize retailer categories
      retailerFeatures.forEach((f: any) => {
        f.properties = f.properties || {};
        f.properties.ParsedCategories = normalizeCategories(
          f.properties.Category || ""
        );
      });

      // -----------------------------------------------------------
      // LOAD KINGPIN GEOJSON — separate and independent
      // -----------------------------------------------------------
      const kingpinData = await fetch(kingpinPath).then((r) => r.json());

      const kingpinFeatures = (kingpinData.features || []).filter((f: any) => {
        const c = f.geometry?.coordinates;
        return Array.isArray(c) && !isNaN(c[0]) && !isNaN(c[1]);
      });

      kingpinFeatures.forEach((f: any) => {
        f.properties = f.properties || {};
        f.properties.ParsedCategories = ["Kingpin"]; // ALWAYS Kingpin
        f.properties.IsKingpin = true;
      });

      // -----------------------------------------------------------
      // MERGE — Kingpins do NOT replace retailer points
      // They stack visually AND appear in popups using retailer data.
      // -----------------------------------------------------------
      const allFeatures = [...retailerFeatures, ...kingpinFeatures];
      masterFeatures.current = allFeatures;

      // -----------------------------------------------------------
      // LEFT FILTER PANEL CALLBACKS
      // (Retailers determine States, Retailers, Suppliers lists)
      // -----------------------------------------------------------
      onStatesLoaded?.(
        [...new Set(
          retailerFeatures.map((f: any) => String(f.properties.State || "")).sort()
        )].filter(Boolean)
      );

      onRetailersLoaded?.(
        [...new Set(
          retailerFeatures.map((f: any) =>
            String(f.properties.Retailer || "").trim()
          ).sort()
        )]
      );

      onSuppliersLoaded?.(
        [...new Set(
          retailerFeatures
            .flatMap((f: any) => parseSuppliers(f.properties.Suppliers))
            .map((x: any) => String(x).trim())
            .sort()
        )]
      );

      // -----------------------------------------------------------
      // ALL Stops for Trip Builder (Retail + Kingpins)
      // -----------------------------------------------------------
      onAllStopsLoaded?.(
        allFeatures.map((f: any) => {
          const p = f.properties;
          return {
            label: p.Retailer || p.Name || "Unknown",
            address: cleanAddress(p.Address),
            coords: f.geometry.coordinates,
            city: p.City,
            state: p.State,
            zip: p.Zip,
          };
        })
      );

      // -----------------------------------------------------------
      // ADD COMBINED SOURCE
      // -----------------------------------------------------------
      map.addSource("retailers", {
        type: "geojson",
        data: { type: "FeatureCollection", features: allFeatures },
      });

      // ======================================================================
      // LAYER 1 — BASE RETAILERS (Agronomy, Grain/Feed, C-Store/Energy, Dist.)
      // ======================================================================
      map.addLayer({
        id: "retailers-layer",
        type: "circle",
        source: "retailers",
        filter: [
          "all",

          // Retailers ONLY (exclude Corporate HQ + Kingpins)
          ["!", ["in", "Kingpin", ["get", "ParsedCategories"]]],
          ["!", ["in", "Corporate HQ", ["get", "ParsedCategories"]]],
        ],
        paint: {
          "circle-radius": 6,

          // Fill color  
          "circle-color": [
            "case",

            // Grain/Feed
            ["in", "Grain/Feed", ["get", "ParsedCategories"]],
            categoryColors["Grain/Feed"].color,

            // C-Store/Energy
            ["in", "C-Store/Service/Energy", ["get", "ParsedCategories"]],
            categoryColors["C-Store/Service/Energy"].color,

            // Distribution
            ["in", "Distribution", ["get", "ParsedCategories"]],
            categoryColors["Distribution"].color,

            // ELSE → Agronomy (Mint Green)
            categoryColors["Agronomy"].color,
          ],

          // Correct stroke width
          "circle-stroke-width": [
            "case",

            ["in", "Grain/Feed", ["get", "ParsedCategories"]], 0,
            ["in", "Distribution", ["get", "ParsedCategories"]], 0,

            // C-Store/Energy and Agronomy
            1.5,
          ],

          // Stroke color
          "circle-stroke-color": [
            "case",

            ["in", "C-Store/Service/Energy", ["get", "ParsedCategories"]],
            categoryColors["C-Store/Service/Energy"].outline,

            ["in", "Agronomy", ["get", "ParsedCategories"]],
            "#FFFFFF",  // ✔ White outline for Agronomy (your request)

            "#000000",
          ],
        },
      });

      // ======================================================================
      // LAYER 2 — CORPORATE HQ (Red Circle)
      // ======================================================================
      map.addLayer({
        id: "corp-hq-layer",
        type: "circle",
        source: "retailers",
        filter: ["in", "Corporate HQ", ["get", "ParsedCategories"]],
        paint: {
          "circle-radius": 7,
          "circle-color": categoryColors["Corporate HQ"].color,
          "circle-stroke-width": 2,
          "circle-stroke-color": categoryColors["Corporate HQ"].outline,
        },
      });

      // ======================================================================
      // LAYER 3 — KINGPIN STAR (PNG ICON)
      // ======================================================================
      map.loadImage(`${basePath}/icons/kingpin.png`, (err, img) => {
        if (!err && img && !map.hasImage("kingpin-icon")) {
          map.addImage("kingpin-icon", img);
        }

        map.addLayer({
          id: "kingpin-layer",
          type: "symbol",
          source: "retailers",
          filter: ["in", "Kingpin", ["get", "ParsedCategories"]],
          layout: {
            "icon-image": "kingpin-icon",
            "icon-size": 0.90, // ~7–8px visually
            "icon-anchor": "center",
          },
        });
      });

      // -----------------------------------------------------------
      // Enable pointer & popups for all layers
      // -----------------------------------------------------------
      ["retailers-layer", "corp-hq-layer", "kingpin-layer"].forEach((id) => {
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = "grab"));
        map.on("click", id, popupHandler);
        map.on("touchstart", id, popupHandler);
      });
    });
  }, [
    retailersPath,
    kingpinPath,
    onStatesLoaded,
    onRetailersLoaded,
    onSuppliersLoaded,
    onAllStopsLoaded,
    onAddStop,
  ]);

// === END PART 2 ===
// ============================================================================
// PART 3 — POPUP HANDLER (Retailer + Kingpin Contact List)
// ============================================================================

  const popupHandler = (e: any) => {
    const map = mapRef.current;
    if (!map) return;

    const f = e.features?.[0];
    if (!f) return;

    const p = f.properties || {};
    const coords = f.geometry.coordinates as [number, number];

    const categories = sortCategories(p.ParsedCategories || []);
    const suppliers = parseSuppliers(p.Suppliers);

    const isKingpin = p.ParsedCategories?.includes("Kingpin");
    const isHQ = p.ParsedCategories?.includes("Corporate HQ");

    // ---------------------------------------------------------
    // RENDER CATEGORY STRING (comma separated, no brackets)
    // ---------------------------------------------------------
    const categoryText =
      categories.length > 0 ? categories.join(", ") : "Uncategorized";

    // ---------------------------------------------------------
    // KINGPIN POPUP — SPECIAL FORMAT
    // ---------------------------------------------------------
    let kingpinContactsHTML = "";

    if (isKingpin && p.ContactsJson) {
      try {
        const parsed = JSON.parse(p.ContactsJson); // entire list from kingpin.geojson

        if (Array.isArray(parsed) && parsed.length > 0) {
          kingpinContactsHTML = `
            <div style="margin-top:10px;padding-top:10px;border-top:1px solid #444;">
              <strong style="font-size:14px;color:#4DA3FF;">Key Contacts</strong><br/><br/>
              ${parsed
                .map((c: any) => {
                  return `
                    <div style="margin-bottom:10px;">
                      <strong>${c.Name || ""}</strong><br/>
                      ${c.Title ? `${c.Title}<br/>` : ""}
                      ${
                        c.Office
                          ? `<span style="color:#ccc;">Office:</span> ${c.Office}<br/>`
                          : ""
                      }
                      ${
                        c.Cell
                          ? `<span style="color:#ccc;">Cell:</span> ${c.Cell}<br/>`
                          : ""
                      }
                      ${
                        c.Email
                          ? `<span style="color:#ccc;">Email:</span> ${c.Email}<br/>`
                          : ""
                      }
                    </div>
                  `;
                })
                .join("")}
            </div>
          `;
        }
      } catch (err) {
        console.warn("Bad ContactsJson format in kingpin.geojson:", err);
      }
    }

    // ---------------------------------------------------------
    // POPUP HEADER (Retailer, HQ, or Kingpin)
    // ---------------------------------------------------------
    const headerHTML = isKingpin
      ? `<strong style="font-size:16px;color:#4DA3FF;">${p.Retailer || "Kingpin"}</strong>`
      : isHQ
      ? `<strong style="font-size:16px;color:#FFD60A;">${p.Retailer || "Corporate HQ"}</strong>`
      : `<strong style="font-size:16px;color:#FFD700;">${p.Retailer || "Unknown"}</strong>`;

    // ---------------------------------------------------------
    // ADDRESS BLOCK (Cleaned)
    // ---------------------------------------------------------
    const locationHTML = `
      ${cleanAddress(p.Address)}<br/>
      ${p.City || ""}, ${p.State || ""} ${p.Zip || ""}<br/><br/>
    `;

    // ---------------------------------------------------------
    // SUPPLIER STRING
    // ---------------------------------------------------------
    const supplierHTML = `
      <strong>Suppliers:</strong> ${suppliers.length > 0 ? suppliers.join(", ") : "None"}<br/><br/>
    `;

    // ---------------------------------------------------------
    // ASSEMBLE POPUP (Kingpins add contact list after suppliers)
    // ---------------------------------------------------------
    const html = `
      <div style="font-size:14px;width:360px;background:#1b1b1b;color:#f2f2f2;
                  padding:12px;border-radius:8px;line-height:1.35;">
        ${headerHTML}<br/><br/>

        ${locationHTML}

        <strong>Category:</strong> ${categoryText}<br/>
        ${supplierHTML}

        ${isKingpin ? kingpinContactsHTML : ""}

        <button id="btn-${Math.random()
          .toString(36)
          .slice(2)}"
          style="margin-top:12px;padding:5px 9px;background:#166534;color:white;border:none;
                 border-radius:4px;font-size:12px;cursor:pointer;">
          + Add to Trip
        </button>
      </div>
    `;

    // ---------------------------------------------------------
    // INJECT POPUP
    // ---------------------------------------------------------
    if (popupRef.current) popupRef.current.remove();

    popupRef.current = new mapboxgl.Popup({
      closeButton: true,
      maxWidth: "none",
      offset: 18,
    })
      .setLngLat(coords)
      .setHTML(html)
      .addTo(map);

    // Attach Add-to-Trip logic
    const el = popupRef.current.getElement();
    if (el && onAddStop) {
      const btn = el.querySelector("button[id^='btn-']") as HTMLButtonElement;
      if (btn) {
        btn.onclick = () =>
          onAddStop({
            label: p.Retailer || p.Name || "Unknown",
            address: cleanAddress(p.Address),
            coords,
            city: p.City,
            state: p.State,
            zip: p.Zip,
          });
      }
    }
  };

  // ========================================================================
  // PART 3 — FILTERING ENGINE
  // Kingpins do NOT respond to State/Retailer/Supplier/Category filters.
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

      const categories = (p.ParsedCategories || []).map(norm);
      const suppliers = parseSuppliers(p.Suppliers).map(norm);

      const state = norm(p.State);
      const retailer = norm(p.Retailer);

      const isKingpin = categories.includes("kingpin");
      const isHQ = categories.includes("corporate hq");

      // ---------------------------------------------------
      // RULE 1 — Kingpins ALWAYS SHOW
      // ---------------------------------------------------
      if (isKingpin) return true;

      // ---------------------------------------------------
      // RULE 2 — Corporate HQ responds ONLY to State
      // ---------------------------------------------------
      if (isHQ) {
        return (
          normStatesSel.length === 0 || normStatesSel.includes(state)
        );
      }

      // ---------------------------------------------------
      // RULE 3 — Regular retailers use full intersection logic
      // ---------------------------------------------------
      const stOk =
        normStatesSel.length === 0 || normStatesSel.includes(state);

      const rtOk =
        normRetailersSel.length === 0 ||
        normRetailersSel.includes(retailer);

      const ctOk =
        normCats.length === 0 || normCats.some((c) => categories.includes(c));

      const spOk =
        normSupSel.length === 0 || normSupSel.some((s) => suppliers.includes(s));

      return stOk && rtOk && ctOk && spOk;
    });

    src.setData({ type: "FeatureCollection", features: filtered });

    // ---------------------------------------------------------
    // CALL RETAILER SUMMARY CALLBACK (excluding Kingpins)
    // ---------------------------------------------------------
    if (onRetailerSummary) {
      const summaryMap: any = {};

      filtered.forEach((f: any) => {
        const p = f.properties;
        const isKingpin = (p.ParsedCategories || []).includes("Kingpin");
        if (isKingpin) return; // excluded

        const r = String(p.Retailer || "Unknown").trim();

        if (!summaryMap[r]) {
          summaryMap[r] = {
            retailer: r,
            count: 0,
            suppliers: new Set<string>(),
            states: new Set<string>(),
            categories: new Set<string>(),
          };
        }

        summaryMap[r].count++;
        parseSuppliers(p.Suppliers).forEach((s: string) => summaryMap[r].suppliers.add(s));
        if (p.State) summaryMap[r].states.add(String(p.State));
        (p.ParsedCategories || []).forEach((c: string) => summaryMap[r].categories.add(c));
      });

      onRetailerSummary(
        Object.values(summaryMap).map((x: any) => ({
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

// === END PART 3 ===
// ============================================================================
// PART 4 — HOME MARKER + ROUTING ENGINE + CLEANUP + RENDER
// ============================================================================

// ---------------------------------------------------------
// HOME MARKER (Blue House Icon)
// ---------------------------------------------------------
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  // Remove old marker
  if (homeMarker.current) {
    homeMarker.current.remove();
    homeMarker.current = null;
  }

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

// ---------------------------------------------------------
// ROUTING ENGINE
// ---------------------------------------------------------
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

  const token = mapboxgl.accessToken;
  let ordered = [...tripStops];

  const startsWithHome = ordered[0]?.label?.startsWith("Home");
  const endsWithHome = ordered[ordered.length - 1]?.label?.startsWith("Home");

  if (!startsWithHome && homeCoords) {
    ordered.unshift({ label: "Home", address: "Home", coords: homeCoords });
  }
  if (!endsWithHome && homeCoords) {
    ordered.push({ label: "Home", address: "Home", coords: homeCoords });
  }

  const interior = ordered.slice(1, -1);

  const doRoute = async () => {
    try {
      // ----------------------------------------
      // OPTIMIZED ROUTE REQUEST
      // ----------------------------------------
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
            distance_m: trip.distance || 0,
            duration_s: trip.duration || 0,
          });

          if (onOptimizedRoute && opt.waypoint_indices) {
            const reordered = opt.waypoint_indices.map((i: number) => ordered[i]);
            onOptimizedRoute(reordered);
          }

          return;
        }
      }

      // ----------------------------------------
      // FALLBACK → STANDARD DIRECTIONS API
      // ----------------------------------------
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsToString(
        ordered
      )}?geometries=geojson&overview=full&access_token=${token}`;

      const res = await fetch(url);
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
          distance_m: data.routes[0].distance || 0,
          duration_s: data.routes[0].duration || 0,
        });
      }
    } catch {
      clearRoute();
    }
  };

  doRoute();
}, [
  tripStops,
  tripMode,
  homeCoords,
  clearRoute,
  onRouteSummary,
  onOptimizedRoute,
]);

// ---------------------------------------------------------
// CLEANUP
// ---------------------------------------------------------
useEffect(() => {
  return () => {
    popupRef.current?.remove();
    homeMarker.current?.remove();
    if (mapRef.current) mapRef.current.remove();
  };
}, []);

// ---------------------------------------------------------
// FINAL RENDER
// ---------------------------------------------------------
return (
  <div
    ref={mapContainer}
    className="w-full h-full border-t border-gray-400"
  />
);

// === END PART 4 ===
}
