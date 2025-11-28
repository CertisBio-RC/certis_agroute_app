// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD FINAL (CANONICAL VERSION — BUILD-SAFE)
//   • Satellite-streets-v12 (locked by Bailey Rule)
//   • Mercator projection (locked by Bailey Rule)
//   • Kingpin1 always visible / not filtered
//   • Corporate HQ filters ONLY by State
//   • Retailers filter by State ∩ Retailer ∩ Category ∩ Supplier
//   • Popup supports Add-to-Trip directly
//   • Fully static-export-safe for GitHub Pages
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map } from "mapbox-gl";
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ============================================================================
// 🧭 STOP TYPE — must match page.tsx exactly
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
// 🗂️ GEOJSON TYPES (retailers + kingpin1)
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
    IsKingpin1?: boolean;
    IsCorporateHQ?: boolean;
    Color?: string;
  };
}

interface RetailerCollection {
  type: "FeatureCollection";
  features: RetailerFeature[];
}

// ============================================================================
// 📌 PROPS
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
// 🗺️ MAIN COMPONENT
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

  // ==========================================================================
  // 🌐 INITIAL MAP + DATA LOAD
  // ==========================================================================
  useEffect(() => {
    if (!mapContainer.current) return;
    if (mapRef.current) return;

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
      const rRes = await fetch("/data/retailers.geojson");
      const retailersJSON: RetailerCollection = await rRes.json();

      const kRes = await fetch("/data/kingpin.geojson");
      const kingpinJSON: RetailerCollection = await kRes.json();

      const allData: RetailerFeature[] = [
        ...retailersJSON.features,
        ...kingpinJSON.features,
      ];

      // Supplier → always array
      allData.forEach((f) => {
        if (typeof f.properties.Supplier === "string") {
          f.properties.Supplier = f.properties.Supplier.split(",")
            .map((x) => x.trim())
            .filter(Boolean);
        }
      });

      // Canonical Stop[]
      const stops: Stop[] = allData.map((f) => ({
        label: f.properties.Retailer,
        address: f.properties.Address,
        city: f.properties.City,
        state: f.properties.State,
        zip: f.properties.Zip,
        coords: f.geometry.coordinates,
      }));

      onAllStopsLoaded?.(stops);

      // Populate dropdowns
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

      // Map sources
      map.addSource("retailers", {
        type: "geojson",
        data: retailersJSON,
      });

      map.addSource("kingpin", {
        type: "geojson",
        data: kingpinJSON,
      });

      map.addSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    });
  }, []);

  // ==========================================================================
  // 🧮 SUMMARY + FILTERING (K4 GOLD FINAL)
  // ==========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const norm = (s: string) => (s || "").trim().toLowerCase();

    const selState = new Set(selectedStates.map(norm));
    const selRetailer = new Set(selectedRetailers.map(norm));
    const selCategory = new Set(selectedCategories.map(norm));
    const selSupplier = new Set(selectedSuppliers.map(norm));

    // ------------- SUMMARY -----------------------------------------------
    (async () => {
      const rRes = await fetch("/data/retailers.geojson");
      const retailersJSON: RetailerCollection = await rRes.json();

      const kRes = await fetch("/data/kingpin.geojson");
      const kingpinJSON: RetailerCollection = await kRes.json();

      const all = [...retailersJSON.features, ...kingpinJSON.features];

      const summary: Record<
        string,
        {
          retailer: string;
          count: number;
          suppliers: Set<string>;
          categories: Set<string>;
          states: Set<string>;
        }
      > = {};

      for (const f of all) {
        const key = f.properties.Retailer;
        const supArr = f.properties.Supplier as string[];

        if (!summary[key]) {
          summary[key] = {
            retailer: key,
            count: 1,
            suppliers: new Set(supArr),
            categories: new Set([f.properties.Category]),
            states: new Set([f.properties.State]),
          };
        } else {
          const s = summary[key];
          s.count++;
          supArr.forEach((x) => s.suppliers.add(x));
          s.categories.add(f.properties.Category);
          s.states.add(f.properties.State);
        }
      }

      onRetailerSummary?.(
        Object.values(summary).map((x) => ({
          retailer: x.retailer,
          count: x.count,
          suppliers: [...x.suppliers].sort(),
          categories: [...x.categories].sort(),
          states: [...x.states].sort(),
        }))
      );
    })();

    // ------------- FILTERS -----------------------------------------------
    const retailerFilter: any[] = ["all"];

    if (selectedStates.length > 0) {
      retailerFilter.push([
        "in",
        ["downcase", ["get", "State"]],
        ["literal", [...selState]],
      ]);
    }

    if (selectedRetailers.length > 0) {
      retailerFilter.push([
        "in",
        ["downcase", ["get", "Retailer"]],
        ["literal", [...selRetailer]],
      ]);
    }

    if (selectedCategories.length > 0) {
      retailerFilter.push([
        "in",
        ["downcase", ["get", "Category"]],
        ["literal", [...selCategory]],
      ]);
    }

    if (selectedSuppliers.length > 0) {
      retailerFilter.push([
        "any",
        [
          "in",
          ["downcase", ["get", "Supplier"]],
          ["literal", [...selSupplier]],
        ],
      ]);
    }

    if (map.getLayer("retailer-circles")) {
      map.setFilter("retailer-circles", retailerFilter);
    }

    // Corporate HQ — only State filter allowed
    const corpHQFilter =
      selectedStates.length > 0
        ? [
            "in",
            ["downcase", ["get", "State"]],
            ["literal", [...selState]],
          ]
        : ["all"];

    if (map.getLayer("corp-hq-circles")) {
      map.setFilter("corp-hq-circles", corpHQFilter);
    }

    // Kingpin1 — always visible
    if (map.getLayer("kingpin1-layer")) {
      map.setFilter("kingpin1-layer", ["all"]);
    }
  }, [
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers,
  ]);

  // ==========================================================================
  // 🔎 POPUPS + MARKERS + ROUTE RENDERING
  // ==========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // ICON LOAD
    if (!map.hasImage("home-icon")) {
      map.loadImage("/icons/Blue_Home.png", (err, img) => {
        if (!err && img) map.addImage("home-icon", img);
      });
    }

    if (!map.hasImage("kingpin-icon")) {
      map.loadImage("/icons/kingpin1.png", (err, img) => {
        if (!err && img) map.addImage("kingpin-icon", img);
      });
    }

    // -----------------------------
    // Retailer circles
    // -----------------------------
    if (!map.getLayer("retailer-circles")) {
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
    }

    // -----------------------------
    // Corporate HQ
    // -----------------------------
    if (!map.getLayer("corp-hq-circles")) {
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
    }

    // -----------------------------
    // Kingpin PNG icon
    // -----------------------------
    if (!map.getLayer("kingpin1-layer")) {
      map.addLayer({
        id: "kingpin1-layer",
        type: "symbol",
        source: "kingpin",
        filter: ["==", ["get", "IsKingpin1"], true],
        layout: {
          "icon-image": "kingpin-icon",
          "icon-size": 0.85,
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
        },
      });
    }

    // -----------------------------
    // Popup + Add To Trip
    // -----------------------------
    const popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: true,
    });

    function popupHTML(p: any) {
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
    }

    function bindPopup(layerId: string) {
      map.on("click", layerId, (e) => {
        const f = e.features?.[0];
        if (!f) return;

        popup.setLngLat(e.lngLat).setHTML(popupHTML(f.properties)).addTo(map);

        // attach Add-to-Trip
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
    }

    bindPopup("retailer-circles");
    bindPopup("corp-hq-circles");
    bindPopup("kingpin1-layer");

    // -----------------------------
    // Home marker
    // -----------------------------
    if (homeCoords) {
      new mapboxgl.Marker({
        element: (() => {
          const el = document.createElement("div");
          el.style.width = "32px";
          el.style.height = "32px";
          el.style.backgroundImage = "url('/icons/Blue_Home.png')";
          el.style.backgroundSize = "cover";
          return el;
        })(),
      })
        .setLngLat(homeCoords)
        .addTo(map);
    }

    // -----------------------------
    // Trip stop markers (numbered)
    // -----------------------------
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

      new mapboxgl.Marker({ element: el })
        .setLngLat(stop.coords)
        .addTo(map);
    });

    // -----------------------------
    // Route Line
    // -----------------------------
    if (routeGeoJSON) {
      const src = map.getSource("route") as mapboxgl.GeoJSONSource;
      if (src) src.setData(routeGeoJSON);
    }
  }, [homeCoords, tripStops, routeGeoJSON, onAddStop]);

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
