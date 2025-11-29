// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD CANONICAL MAP (FULL, BUILD-SAFE)
//   • Satellite-streets-v12 (locked by Bailey Rule)
//   • Mercator projection (locked by Bailey Rule)
//   • Corporate HQ visible always (State filter applies)
//   • Kingpin visible ALWAYS (immune to all filters)
//   • Retailers = State ∩ Retailer ∩ Category ∩ Supplier
//   • Popups include Add-to-Trip
//   • Home icon ALWAYS visible (Blue_Home.png)
//   • Kingpins use /public/icons/kingpin.png (blue star)
//   • Static-export-safe for GitHub Pages (basePath enforced)
//   • Safe Mapbox style usage (no “Style is not done loading”)
//   • Optional callbacks for dropdowns, summary, and stops
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map } from "mapbox-gl";
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// STATIC-EXPORT-SAFE BASE PATH
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// ============================================================================
// STOP TYPE — must match page.tsx exactly
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
// GEOJSON TYPES
// ============================================================================
interface RetailerProperties {
  Retailer: string;
  Category: string;
  Address: string;
  City: string;
  State: string;
  Zip: string;
  Phone?: string;
  Email?: string;

  // Data flags
  IsCorporateHQ?: boolean;
  IsKingpin?: boolean;

  // Colors for retailers/HQ
  Color?: string;

  // Supplier data (post–PowerShell cleanup)
  Supplier?: string;        // legacy / backup
  Suppliers?: string[];     // canonical
  SuppliersText?: string;   // lowercase “pipeline” string for filtering
}

interface RetailerFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: RetailerProperties;
}

interface RetailerCollection {
  type: "FeatureCollection";
  features: RetailerFeature[];
}

// ============================================================================
// PROPS — callbacks optional so page.tsx won’t break either way
// ============================================================================
interface CertisMapProps {
  selectedStates: string[];
  selectedRetailers: string[];
  selectedCategories: string[];
  selectedSuppliers: string[];

  homeCoords: [number, number] | null;
  tripStops: Stop[];
  routeGeoJSON: any | null;

  onStatesLoaded?: (states: string[]) => void;
  onRetailersLoaded?: (retailers: string[]) => void;
  onSuppliersLoaded?: (suppliers: string[]) => void;

  // Global retailer summary (Option A — from ALL data, not filtered)
  onRetailerSummary?: (
    summary: {
      retailer: string;
      count: number;
      suppliers: string[];
      categories: string[];
      states: string[];
    }[]
  ) => void;

  onAllStopsLoaded?: (stops: Stop[]) => void;
  onAddStop?: (stop: Stop) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

// Normalize Suppliers → always array + SuppliersText
function normalizeCollection(col: RetailerCollection): RetailerCollection {
  return {
    ...col,
    features: col.features.map((feat) => {
      const props: RetailerProperties = { ...feat.properties };

      let suppliersArray: string[] = [];

      // Prefer Suppliers array if present
      if (Array.isArray(props.Suppliers)) {
        suppliersArray = props.Suppliers.filter(
          (s): s is string => typeof s === "string" && s.trim() !== ""
        );
      } else if (typeof props.Supplier === "string") {
        suppliersArray = props.Supplier.split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }

      const suppliersText = suppliersArray
        .map((s) => s.toLowerCase())
        .join("|");

      const cleaned: RetailerProperties = {
        ...props,
        Suppliers: suppliersArray,
        SuppliersText: suppliersText,
      };

      // Remove legacy Supplier string if present so we have one canonical form
      delete (cleaned as any).Supplier;

      return {
        ...feat,
        properties: cleaned,
      };
    }),
  };
}

const norm = (v: string) => (v || "").trim().toLowerCase();

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CertisMap({
  selectedStates,
  selectedRetailers,
  selectedCategories,
  selectedSuppliers,
  homeCoords,
  tripStops,
  routeGeoJSON,
  onStatesLoaded,
  onRetailersLoaded,
  onSuppliersLoaded,
  onRetailerSummary,
  onAllStopsLoaded,
  onAddStop,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  // Keep map data handy if needed later (e.g., debugging)
  const dataRef = useRef<{
    retailers: RetailerCollection | null;
    kingpin: RetailerCollection | null;
  }>({ retailers: null, kingpin: null });

  // Markers for cleanup
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const tripMarkersRef = useRef<mapboxgl.Marker[]>([]);

  // ==========================================================================
  // INITIAL MAP + DATA LOAD (fires once)
  // ==========================================================================
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      projection: "mercator",
      center: [-94, 42.5],
      zoom: 5,
      cooperativeGestures: true,
    });

    mapRef.current = map;

    map.on("load", async () => {
      // 1️⃣ LOAD RAW GEOJSON
      const retailersRaw = (await (
        await fetch(`${basePath}/data/retailers.geojson`)
      ).json()) as RetailerCollection;

      const kingpinRaw = (await (
        await fetch(`${basePath}/data/kingpin.geojson`)
      ).json()) as RetailerCollection;

      // 2️⃣ NORMALIZE SUPPLIERS FOR BOTH COLLECTIONS
      const retailers = normalizeCollection(retailersRaw);
      const kingpins = normalizeCollection(kingpinRaw);

      dataRef.current = { retailers, kingpin: kingpins };

      const allFeatures: RetailerFeature[] = [
        ...retailers.features,
        ...kingpins.features,
      ];

      // 3️⃣ CALLBACKS — DROPDOWN POPULATION
      if (onStatesLoaded) {
        const states = Array.from(
          new Set(allFeatures.map((f) => f.properties.State).filter(Boolean))
        ).sort();
        onStatesLoaded(states);
      }

      if (onRetailersLoaded) {
        const retailersList = Array.from(
          new Set(
            allFeatures.map((f) => f.properties.Retailer).filter(Boolean)
          )
        ).sort();
        onRetailersLoaded(retailersList);
      }

      if (onSuppliersLoaded) {
        const allSuppliers = Array.from(
          new Set(
            allFeatures.flatMap((f) => f.properties.Suppliers ?? []).filter(Boolean)
          )
        ).sort();
        onSuppliersLoaded(allSuppliers);
      }

      // 4️⃣ CALLBACKS — ALL STOPS
      if (onAllStopsLoaded) {
        const stops: Stop[] = allFeatures.map((f) => ({
          label: f.properties.Retailer,
          address: f.properties.Address,
          city: f.properties.City,
          state: f.properties.State,
          zip: f.properties.Zip,
          coords: f.geometry.coordinates,
        }));
        onAllStopsLoaded(stops);
      }

      // 5️⃣ CALLBACK — GLOBAL RETAILER SUMMARY (OPTION A)
      if (onRetailerSummary) {
        const summaryMap = new Map<
          string,
          {
            retailer: string;
            count: number;
            suppliers: Set<string>;
            categories: Set<string>;
            states: Set<string>;
          }
        >();

        for (const f of allFeatures) {
          const rName = f.properties.Retailer || "Unknown";
          const key = rName.trim();
          if (!summaryMap.has(key)) {
            summaryMap.set(key, {
              retailer: rName,
              count: 0,
              suppliers: new Set<string>(),
              categories: new Set<string>(),
              states: new Set<string>(),
            });
          }
          const entry = summaryMap.get(key)!;
          entry.count += 1;

          (f.properties.Suppliers ?? []).forEach((s) =>
            entry.suppliers.add(s)
          );
          if (f.properties.Category) entry.categories.add(f.properties.Category);
          if (f.properties.State) entry.states.add(f.properties.State);
        }

        const summaryArray = Array.from(summaryMap.values()).map((s) => ({
          retailer: s.retailer,
          count: s.count,
          suppliers: Array.from(s.suppliers).sort(),
          categories: Array.from(s.categories).sort(),
          states: Array.from(s.states).sort(),
        }));

        onRetailerSummary(summaryArray);
      }

      // 6️⃣ MAP SOURCES
      map.addSource("retailers", {
        type: "geojson",
        data: retailers,
      });

      map.addSource("kingpin", {
        type: "geojson",
        data: kingpins,
      });

      map.addSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // 7️⃣ ICONS (HOME + KINGPIN STAR)
      if (!map.hasImage("home-icon")) {
        map.loadImage(`${basePath}/icons/Blue_Home.png`, (err, img) => {
          if (!err && img) {
            map.addImage("home-icon", img);
          }
        });
      }

      if (!map.hasImage("kingpin-icon")) {
        map.loadImage(`${basePath}/icons/kingpin.png`, (err, img) => {
          if (!err && img) {
            map.addImage("kingpin-icon", img);
          }
        });
      }

      // 8️⃣ LAYERS — RETAILERS
      if (!map.getLayer("retailers-layer")) {
        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          filter: ["==", ["get", "IsCorporateHQ"], false],
          paint: {
            "circle-radius": 6,
            "circle-color": ["get", "Color"],
            "circle-stroke-width": 1.4,
            "circle-stroke-color": "#ffffff",
          },
        });
      }

      // 9️⃣ LAYERS — CORPORATE HQ (slightly larger, tan border)
      if (!map.getLayer("hq-layer")) {
        map.addLayer({
          id: "hq-layer",
          type: "circle",
          source: "retailers",
          filter: ["==", ["get", "IsCorporateHQ"], true],
          paint: {
            "circle-radius": 7,
            "circle-color": ["get", "Color"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#D9C39B",
          },
        });
      }

      // 🔟 LAYERS — KINGPIN (BLUE STAR ICON)
      if (!map.getLayer("kingpin-layer")) {
        map.addLayer({
          id: "kingpin-layer",
          type: "symbol",
          source: "kingpin",
          filter: ["==", ["get", "IsKingpin"], true],
          layout: {
            "icon-image": "kingpin-icon",
            "icon-size": 0.55,
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
          },
        });
      }

      // 1️⃣1️⃣ LAYER — ROUTE LINE (YELLOW)
      if (!map.getLayer("route-layer")) {
        map.addLayer({
          id: "route-layer",
          type: "line",
          source: "route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#facc15",
            "line-width": 4,
          },
        });
      }

      // 1️⃣2️⃣ POPUPS + ADD-TO-TRIP
      const popup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true,
      });

      function popupHTML(p: any) {
        const supArr: string[] = Array.isArray(p.Suppliers)
          ? p.Suppliers
          : [];
        const supHTML =
          supArr.length > 0 ? supArr.join("<br/>") : "None listed";

        return `
          <div style="font-size:14px; line-height:1.25">
            <div style="font-size:16px; font-weight:bold; color:#FFD348;">
              ${p.Retailer ?? ""}
            </div>
            <div>${p.Address ?? ""}</div>
            <div>${p.City ?? ""}, ${p.State ?? ""} ${p.Zip ?? ""}</div>

            <div style="margin-top:6px;">
              <strong>Category:</strong> ${p.Category ?? ""}<br/>
              <strong>Suppliers:</strong><br/>${supHTML}
            </div>

            <button id="addStopBtn"
              style="
                margin-top:8px;
                padding:5px 10px;
                background:#1e40af;
                color:white;
                border-radius:4px;
                cursor:pointer;
              ">
              Add to Trip
            </button>
          </div>
        `;
      }

      function bindPopup(layerId: string) {
        map.on("click", layerId, (e) => {
          const f = e.features?.[0] as any;
          if (!f) return;

          popup.setLngLat(e.lngLat).setHTML(popupHTML(f.properties)).addTo(map);

          setTimeout(() => {
            const btn = document.getElementById("addStopBtn");
            if (!btn) return;
            btn.onclick = () => {
              const coords = (f.geometry?.coordinates ??
                [-94, 42.5]) as [number, number];
              onAddStop?.({
                label: f.properties.Retailer ?? "",
                address: f.properties.Address ?? "",
                city: f.properties.City ?? "",
                state: f.properties.State ?? "",
                zip: f.properties.Zip ?? "",
                coords,
              });
            };
          }, 40);
        });
      }

      bindPopup("retailers-layer");
      bindPopup("hq-layer");
      bindPopup("kingpin-layer");
    });
  }, [
    onAllStopsLoaded,
    onRetailerSummary,
    onRetailersLoaded,
    onStatesLoaded,
    onSuppliersLoaded,
    onAddStop,
  ]);

  // ==========================================================================
  // FILTERING — RETAILERS / HQ / KINGPIN
  //   • Retailers: State ∩ Retailer ∩ Category ∩ Supplier
  //   • HQ: State-only
  //   • Kingpin: ALWAYS visible
  // ==========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sState = new Set(selectedStates.map(norm));
    const sRetailer = new Set(selectedRetailers.map(norm));
    const sCat = new Set(selectedCategories.map(norm));
    const sSup = new Set(selectedSuppliers.map(norm));

    const retailerFilter: any[] = ["all"];

    // State
    if (selectedStates.length > 0) {
      retailerFilter.push([
        "in",
        ["downcase", ["get", "State"]],
        ["literal", Array.from(sState)],
      ]);
    }

    // Retailer
    if (selectedRetailers.length > 0) {
      retailerFilter.push([
        "in",
        ["downcase", ["get", "Retailer"]],
        ["literal", Array.from(sRetailer)],
      ]);
    }

    // Category
    if (selectedCategories.length > 0) {
      retailerFilter.push([
        "in",
        ["downcase", ["get", "Category"]],
        ["literal", Array.from(sCat)],
      ]);
    }

    // Suppliers — use SuppliersText string (e.g. "winfield|nutrien|chs")
    if (selectedSuppliers.length > 0) {
      const lowered = Array.from(sSup);
      retailerFilter.push([
        "any",
        ...lowered.map(
          (s) =>
            [
              "in",
              s,
              ["coalesce", ["get", "SuppliersText"], ""],
            ] as any
        ),
      ]);
    }

    if (map.getLayer("retailers-layer")) {
      map.setFilter("retailers-layer", retailerFilter);
    }

    // HQ — only State filter
    const hqFilter =
      selectedStates.length > 0
        ? [
            "in",
            ["downcase", ["get", "State"]],
            ["literal", Array.from(sState)],
          ]
        : ["all"];

    if (map.getLayer("hq-layer")) {
      map.setFilter("hq-layer", hqFilter);
    }

    // Kingpin — always visible
    if (map.getLayer("kingpin-layer")) {
      map.setFilter("kingpin-layer", ["all"]);
    }
  }, [
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers,
  ]);

  // ==========================================================================
  // ROUTE + HOME MARKER + TRIP MARKERS
  // ==========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // ROUTE
    const routeSource = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    if (routeSource) {
      routeSource.setData(
        routeGeoJSON ?? { type: "FeatureCollection", features: [] }
      );
    }

    // HOME MARKER (ALWAYS ONE)
    if (homeMarkerRef.current) {
      homeMarkerRef.current.remove();
      homeMarkerRef.current = null;
    }

    if (homeCoords) {
      const el = document.createElement("div");
      el.style.width = "28px";
      el.style.height = "28px";
      el.style.backgroundImage = `url('${basePath}/icons/Blue_Home.png')`;
      el.style.backgroundSize = "contain";
      el.style.backgroundRepeat = "no-repeat";

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(homeCoords)
        .addTo(map);

      homeMarkerRef.current = marker;
    }

    // TRIP MARKERS — CLEAR OLD, THEN ADD
    tripMarkersRef.current.forEach((m) => m.remove());
    tripMarkersRef.current = [];

    tripStops.forEach((stop, index) => {
      const el = document.createElement("div");
      el.style.width = "20px";
      el.style.height = "20px";
      el.style.borderRadius = "50%";
      el.style.background = "#f97316";
      el.style.border = "2px solid white";
      el.style.color = "white";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.fontSize = "10px";
      el.style.fontWeight = "bold";
      el.textContent = String(index + 1);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(stop.coords)
        .addTo(map);

      tripMarkersRef.current.push(marker);
    });
  }, [homeCoords, tripStops, routeGeoJSON]);

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div
      ref={mapContainer}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        inset: 0,
      }}
    />
  );
}
