// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD FINAL (STYLE-SAFE BUILD-SAFE VERSION)
//   • Satellite-streets-v12 (locked by Bailey Rule)
//   • Mercator projection (locked by Bailey Rule)
//   • Corporate HQ always visible (State-only filtering allowed)
//   • Kingpin always visible (no filtering ever)
//   • Retailers filter by State ∩ Retailer ∩ Category ∩ Supplier
//   • Popups include Add-to-Trip
//   • Fully static-export-safe for GitHub Pages (basePath enforced)
//   • Uses "styledata" event → ZERO risk of "Style is not done loading" crash
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map } from "mapbox-gl";
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// STATIC-EXPORT SAFE BASE PATH
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
interface RetailerFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    Retailer: string;
    Category: string;
    Supplier: string | string[];
    Address: string;
    City: string;
    State: string;
    Zip: string;
    Phone?: string;
    Email?: string;
    IsCorporateHQ?: boolean;
    IsKingpin?: boolean;
    Color?: string;
  };
}

interface RetailerCollection {
  type: "FeatureCollection";
  features: RetailerFeature[];
}

// ============================================================================
// PROPS
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
  onRetailerSummary, // reserved for page.tsx usage
  onAllStopsLoaded,
  onAddStop,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  // ========================================================================
  // INITIAL MAP & DATA LOAD  — styledata = SAFE AGAINST RACE CONDITIONS
  // ========================================================================
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

    map.once("styledata", async () => {
      // STATIC-EXPORT SAFE GEOJSON LOAD
      const rRes = await fetch(`${basePath}/data/retailers.geojson`);
      const retailersJSON: RetailerCollection = await rRes.json();

      const kRes = await fetch(`${basePath}/data/kingpin.geojson`);
      const kingpinJSON: RetailerCollection = await kRes.json();

      const allData = [...retailersJSON.features, ...kingpinJSON.features];

      // Normalize Supplier → always array
      allData.forEach((f) => {
        if (typeof f.properties.Supplier === "string") {
          f.properties.Supplier = f.properties.Supplier.split(",")
            .map((x) => x.trim())
            .filter(Boolean);
        }
      });

      // Canonical Stop Array
      const stops: Stop[] = allData.map((f) => ({
        label: f.properties.Retailer,
        address: f.properties.Address,
        city: f.properties.City,
        state: f.properties.State,
        zip: f.properties.Zip,
        coords: f.geometry.coordinates,
      }));
      onAllStopsLoaded?.(stops);

      // Dropdown population
      onStatesLoaded?.([...new Set(allData.map((f) => f.properties.State))].sort());
      onRetailersLoaded?.(
        [...new Set(allData.map((f) => f.properties.Retailer))].sort()
      );
      onSuppliersLoaded?.(
        [
          ...new Set(
            allData.flatMap((f) => f.properties.Supplier as string[])
          ),
        ].sort()
      );

      // Create Sources
      map.addSource("retailers", { type: "geojson", data: retailersJSON });
      map.addSource("kingpin", { type: "geojson", data: kingpinJSON });
      map.addSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // STATIC-EXPORT SAFE ICON LOAD
      map.loadImage(`${basePath}/icons/Blue_Home.png`, (err, img) => {
        if (!err && img) map.addImage("home-icon", img);
      });
      map.loadImage(`${basePath}/icons/kingpin.png`, (err, img) => {
        if (!err && img) map.addImage("kingpin-icon", img);
      });

      // ====================================================================
      // LAYER CREATION — Bailey Rules Preserved
      // ====================================================================
      map.addLayer({
        id: "retailer-circles",
        type: "circle",
        source: "retailers",
        filter: ["==", ["get", "IsCorporateHQ"], false],
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "Color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.4,
        },
      });

      map.addLayer({
        id: "corp-hq-circles",
        type: "circle",
        source: "retailers",
        filter: ["==", ["get", "IsCorporateHQ"], true],
        paint: {
          "circle-radius": 7,
          "circle-color": ["get", "Color"],
          "circle-stroke-color": "#D9C39B",
          "circle-stroke-width": 2,
        },
      });

      map.addLayer({
        id: "kingpin-layer",
        type: "symbol",
        source: "kingpin",
        filter: ["==", ["get", "IsKingpin"], true],
        layout: {
          "icon-image": "kingpin-icon",
          "icon-size": 0.55, // SAME VISUAL SCALE AS Corporate HQ
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
        },
      });
    });
  }, []);

  // ========================================================================
  // FILTERING — Retailer ∩ Category ∩ Supplier ∩ State + Kingpin Rules
  // ========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const norm = (s: string) => (s || "").trim().toLowerCase();

    const selState = new Set(selectedStates.map(norm));
    const selRetailer = new Set(selectedRetailers.map(norm));
    const selCategory = new Set(selectedCategories.map(norm));
    const selSupplier = new Set(selectedSuppliers.map(norm));

    const filterRetailer: any[] = ["all"];

    if (selectedStates.length > 0)
      filterRetailer.push([
        "in",
        ["downcase", ["get", "State"]],
        ["literal", [...selState]],
      ]);

    if (selectedRetailers.length > 0)
      filterRetailer.push([
        "in",
        ["downcase", ["get", "Retailer"]],
        ["literal", [...selRetailer]],
      ]);

    if (selectedCategories.length > 0)
      filterRetailer.push([
        "in",
        ["downcase", ["get", "Category"]],
        ["literal", [...selCategory]],
      ]);

    if (selectedSuppliers.length > 0)
      filterRetailer.push([
        "any",
        [
          "in",
          ["downcase", ["get", "Supplier"]],
          ["literal", [...selSupplier]],
        ],
      ]);

    if (map.getLayer("retailer-circles"))
      map.setFilter("retailer-circles", filterRetailer);

    // Corporate HQ — State filter allowed
    const corpHQFilter =
      selectedStates.length > 0
        ? [
            "in",
            ["downcase", ["get", "State"]],
            ["literal", [...selState]],
          ]
        : ["all"];

    if (map.getLayer("corp-hq-circles"))
      map.setFilter("corp-hq-circles", corpHQFilter);

    // Kingpin — always visible
    if (map.getLayer("kingpin-layer"))
      map.setFilter("kingpin-layer", ["all"]);
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  // ========================================================================
  // POPUPS + HOME / TRIP MARKERS + ROUTE
  // ========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true });

    const popupHTML = (p: any) => {
      const sup = (p.Supplier || []).join("<br/>");
      return `
        <div style="font-size:14px; line-height:1.25">
          <div style="font-size:16px; font-weight:bold; color:#FFD348;">
            ${p.Retailer}
          </div>
          <div>${p.Address}</div>
          <div>${p.City}, ${p.State} ${p.Zip}</div>

          <div style="margin-top:6px;">
            <strong>Category:</strong> ${p.Category}<br/>
            <strong>Suppliers:</strong><br/>${sup}
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
    };

    const bindPopup = (layerId: string) => {
      map.on("click", layerId, (e: any) => {
        const f = e.features?.[0];
        if (!f) return;

        popup.setLngLat(e.lngLat).setHTML(popupHTML(f.properties)).addTo(map);

        setTimeout(() => {
          const btn = document.getElementById("addStopBtn");
          if (!btn) return;
          btn.onclick = () => {
            const coords = (f.geometry as any).coordinates as [number, number];
            onAddStop?.({
              label: f.properties.Retailer,
              address: f.properties.Address,
              city: f.properties.City,
              state: f.properties.State,
              zip: f.properties.Zip,
              coords,
            });
          };
        }, 20);
      });
    };

    bindPopup("retailer-circles");
    bindPopup("corp-hq-circles");
    bindPopup("kingpin-layer");

    // Home marker
    if (homeCoords) {
      new mapboxgl.Marker({
        element: (() => {
          const el = document.createElement("div");
          el.style.width = "28px";
          el.style.height = "28px";
          el.style.backgroundImage = `url('${basePath}/icons/Blue_Home.png')`;
          el.style.backgroundSize = "cover";
          return el;
        })(),
      })
        .setLngLat(homeCoords)
        .addTo(map);
    }

    // Trip markers
    tripStops.forEach((stop, i) => {
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
      el.style.fontSize = "11px";
      el.style.fontWeight = "bold";
      el.title = `${i + 1}. ${stop.label}`;
      el.textContent = String(i + 1);
      new mapboxgl.Marker({ element: el }).setLngLat(stop.coords).addTo(map);
    });

    // Route line
    if (routeGeoJSON) {
      const src = map.getSource("route") as mapboxgl.GeoJSONSource;
      if (src) src.setData(routeGeoJSON);
    }
  }, [homeCoords, tripStops, routeGeoJSON, onAddStop]);

  // ========================================================================
  // RENDER
  // ========================================================================
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
