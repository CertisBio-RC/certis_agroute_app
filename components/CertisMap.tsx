// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD FINAL (CANONICAL, STATIC-EXPORT SAFE)
//   • Satellite-streets-v12  | Mercator | Static Export (GitHub Pages)
//   • Kingpin1 ALWAYS visible (no filters)
//   • Corporate HQ filters ONLY by state
//   • Retailers filter by State ∩ Retailer ∩ Category ∩ Supplier
//   • Marker Style = R MODE: Retailer circles | HQ circles | PNG star for Kingpin1
//   • Add-to-Trip popup preserved
//   • basePath-safe everywhere (required for /certis_agroute_app/ deployment)
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map } from "mapbox-gl";
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// prefix for GitHub Pages static export
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// ============================================================================
// STOP (must match page.tsx exactly)
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
export default function CertisMap(props: CertisMapProps) {
  const {
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
  } = props;

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  // ==========================================================================
  // INITIAL LOAD
  // ==========================================================================
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

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
      const rRes = await fetch(`${basePath}/data/retailers.geojson`);
      const retailersJSON: RetailerCollection = await rRes.json();

      const kRes = await fetch(`${basePath}/data/kingpin.geojson`);
      const kingpinJSON: RetailerCollection = await kRes.json();

      const allData: RetailerFeature[] = [
        ...retailersJSON.features,
        ...kingpinJSON.features,
      ];

      // normalise suppliers → always array
      allData.forEach((f) => {
        if (typeof f.properties.Supplier === "string") {
          f.properties.Supplier = f.properties.Supplier.split(",")
            .map((x) => x.trim())
            .filter(Boolean);
        }
      });

      // canonical STOP[]
      const stops: Stop[] = allData.map((f) => ({
        label: f.properties.Retailer,
        address: f.properties.Address,
        city: f.properties.City,
        state: f.properties.State,
        zip: f.properties.Zip,
        coords: f.geometry.coordinates,
      }));
      onAllStopsLoaded?.(stops);

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

      map.addSource("retailers", { type: "geojson", data: retailersJSON });
      map.addSource("kingpin", { type: "geojson", data: kingpinJSON });
      map.addSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    });
  }, []);

  // ==========================================================================
  // FILTERING + RETAILER SUMMARY
  // ==========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const norm = (s: string) => (s || "").trim().toLowerCase();
    const sState = new Set(selectedStates.map(norm));
    const sRetail = new Set(selectedRetailers.map(norm));
    const sCat = new Set(selectedCategories.map(norm));
    const sSup = new Set(selectedSuppliers.map(norm));

    // summary refresh
    (async () => {
      const rRes = await fetch(`${basePath}/data/retailers.geojson`);
      const retailersJSON: RetailerCollection = await rRes.json();
      const kRes = await fetch(`${basePath}/data/kingpin.geojson`);
      const kingpinJSON: RetailerCollection = await kRes.json();

      const combined = [...retailersJSON.features, ...kingpinJSON.features];
      const out: any[] = [];
      const memo: any = {};

      for (const f of combined) {
        const key = f.properties.Retailer;
        const sup = f.properties.Supplier as string[];
        if (!memo[key]) {
          memo[key] = {
            retailer: key,
            count: 0,
            suppliers: new Set<string>(),
            categories: new Set<string>(),
            states: new Set<string>(),
          };
        }
        memo[key].count++;
        sup.forEach((x) => memo[key].suppliers.add(x));
        memo[key].categories.add(f.properties.Category);
        memo[key].states.add(f.properties.State);
      }
      Object.values(memo).forEach((x: any) =>
        out.push({
          retailer: x.retailer,
          count: x.count,
          suppliers: [...x.suppliers].sort(),
          categories: [...x.categories].sort(),
          states: [...x.states].sort(),
        })
      );
      onRetailerSummary?.(out);
    })();

    // retailer filter
    const f: any[] = ["all"];
    if (selectedStates.length > 0) f.push(["in", ["downcase", ["get", "State"]], ["literal", [...sState]]]);
    if (selectedRetailers.length > 0) f.push(["in", ["downcase", ["get", "Retailer"]], ["literal", [...sRetail]]]);
    if (selectedCategories.length > 0) f.push(["in", ["downcase", ["get", "Category"]], ["literal", [...sCat]]]);
    if (selectedSuppliers.length > 0) f.push(["any", ["in", ["downcase", ["get", "Supplier"]], ["literal", [...sSup]]]]);

    if (map.getLayer("retailer-circles")) map.setFilter("retailer-circles", f);

    // HQ — state only
    const hqFilter =
      selectedStates.length > 0
        ? ["in", ["downcase", ["get", "State"]], ["literal", [...sState]]]
        : ["all"];
    if (map.getLayer("corp-hq-circles")) map.setFilter("corp-hq-circles", hqFilter);

    // Kingpin — always visible
    if (map.getLayer("kingpin1-layer")) map.setFilter("kingpin1-layer", ["all"]);
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  // ==========================================================================
  // ICONS + POPUPS + ROUTE
  // ==========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // PNG icon loads (basePath-safe)
    if (!map.hasImage("home-icon"))
      map.loadImage(`${basePath}/icons/Blue_Home.png`, (err, img) => {
        if (!err && img) map.addImage("home-icon", img);
      });

    if (!map.hasImage("kingpin-icon"))
      map.loadImage(`${basePath}/icons/kingpin.png`, (err, img) => {
        if (!err && img) map.addImage("kingpin-icon", img);
      });

    // retailer circles (R MODE)
    if (!map.getLayer("retailer-circles"))
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

    // corporate HQ — circle w/ yellow stroke
    if (!map.getLayer("corp-hq-circles"))
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

    // Kingpin — PNG star
    if (!map.getLayer("kingpin1-layer"))
      map.addLayer({
        id: "kingpin1-layer",
        type: "symbol",
        source: "kingpin",
        layout: {
          "icon-image": "kingpin-icon",
          "icon-size": 0.85,
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
        },
      });

    // popups
    const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true });

    function popupHTML(p: any) {
      return `
        <div style="font-size:14px; line-height:1.25">
          <div style="font-size:16px; font-weight:bold; color:#FFD348;">
            ${p.Retailer}
          </div>
          <div>${p.Address}</div>
          <div>${p.City}, ${p.State} ${p.Zip}</div>
          <div style="margin-top:6px;">
            <strong>Category:</strong> ${p.Category}<br/>
            <strong>Suppliers:</strong><br/>${(p.Supplier || []).join("<br/>")}
          </div>
          <button id="addStopBtn"
            style="margin-top:8px; padding:5px 10px; background:#1e40af; color:white; border-radius:4px; cursor:pointer;">
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

    // Home marker
    if (homeCoords) {
      new mapboxgl.Marker({
        element: (() => {
          const el = document.createElement("div");
          el.style.width = "32px";
          el.style.height = "32px";
          el.style.backgroundImage = `url('${basePath}/icons/Blue_Home.png')`;
          el.style.backgroundSize = "cover";
          return el;
        })(),
      })
        .setLngLat(homeCoords)
        .addTo(map);
    }

    // Trip markers (numbered)
    tripStops.forEach((stop, idx) => {
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
      el.title = `${idx + 1}. ${stop.label}`;
      el.textContent = String(idx + 1);
      new mapboxgl.Marker({ element: el }).setLngLat(stop.coords).addTo(map);
    });

    // route line
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
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
    />
  );
}
