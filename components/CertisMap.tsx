// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD FINAL (CANONICAL VERSION — BUILD-SAFE)
//   • Satellite-streets-v12 (locked by Bailey Rule)
//   • Mercator projection (locked by Bailey Rule)
//   • Corporate HQ visible always (State filter applies)
//   • Kingpin visible ALWAYS (immune to ALL filters)
//   • Retailers = State ∩ Retailer ∩ Category ∩ Supplier
//   • Popups include Add-to-Trip
//   • Home icon ALWAYS visible
//   • Fully static-export-safe for GitHub Pages (basePath enforced)
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

  onStatesLoaded?: (v: string[]) => void;
  onRetailersLoaded?: (v: string[]) => void;
  onSuppliersLoaded?: (v: string[]) => void;
  onRetailerSummary?: (
    v: {
      retailer: string;
      count: number;
      suppliers: string[];
      categories: string[];
      states: string[];
    }[]
  ) => void;
  onAllStopsLoaded?: (v: Stop[]) => void;
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
  onRetailerSummary,
  onAllStopsLoaded,
  onAddStop,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  const norm = (v: string) => (v || "").trim().toLowerCase();

  // ==========================================================================
  // INITIAL MAP + DATA LOAD
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
      const retailers = await (await fetch(`${basePath}/data/retailers.geojson`)).json();
      const kingpins = await (await fetch(`${basePath}/data/kingpin.geojson`)).json();

      // SOURCES
      map.addSource("retailers", { type: "geojson", data: retailers });
      map.addSource("kingpin", { type: "geojson", data: kingpins });
      map.addSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // ICONS
      map.loadImage(`${basePath}/icons/Blue_Home.png`, (err, img) => {
        if (!err && img && !map.hasImage("home-icon")) map.addImage("home-icon", img);
      });
      map.loadImage(`${basePath}/icons/kingpin.png`, (err, img) => {
        if (!err && img && !map.hasImage("kingpin-icon")) map.addImage("kingpin-icon", img);
      });

      // HQ + RETAILER CIRCLES
      map.addLayer({
        id: "retailers-layer",
        type: "circle",
        source: "retailers",
        filter: [
          "all",
          ["!=", ["get", "IsCorporateHQ"], true],
          ["!=", ["get", "IsKingpin"], true],
        ],
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "Color"],
          "circle-stroke-width": 1.4,
          "circle-stroke-color": "#ffffff",
        },
      });

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

      // KINGPIN STAR ICONS (yellow)
      map.addLayer({
        id: "kingpin-layer",
        type: "symbol",
        source: "kingpin",
        layout: {
          "icon-image": "kingpin-icon",
          "icon-size": 0.75,
          "icon-anchor": "center",
          "icon-allow-overlap": true,
        },
      });

      // ROUTE POLYLINE (BLUE)
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#3B82F6",
          "line-width": 4,
        },
      });

      // ======================================================================
      // POPUPS + ADD TO TRIP
      // ======================================================================
      const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true });

      function bindPopup(layerId: string) {
        map.on("click", layerId, (e) => {
          const f = e.features?.[0];
          if (!f) return;

          popup
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font-size:14px; color:white;">
                <strong style="color:#FFD348; font-size:16px">${f.properties.Retailer}</strong><br/>
                ${f.properties.Address}<br/>
                ${f.properties.City}, ${f.properties.State} ${f.properties.Zip}<br/>
                <div style="margin-top:4px">
                  <strong>Category:</strong> ${f.properties.Category}<br/>
                  <strong>Suppliers:</strong><br/>${(f.properties.Suppliers || []).join("<br/>")}
                </div>
                <button id="addStopBtn" style="margin-top:7px; padding:6px 12px; background:#1e40af; border-radius:4px; color:white;">
                  Add to Trip
                </button>
              </div>
            `)
            .addTo(map);

          setTimeout(() => {
            const btn = document.getElementById("addStopBtn");
            if (!btn) return;
            btn.onclick = () => {
              const c = (f.geometry as any).coordinates as [number, number];
              onAddStop?.({
                label: f.properties.Retailer,
                address: f.properties.Address,
                city: f.properties.City,
                state: f.properties.State,
                zip: f.properties.Zip,
                coords: c,
              });
            };
          }, 50);
        });
      }

      bindPopup("retailers-layer");
      bindPopup("hq-layer");
      bindPopup("kingpin-layer");

      // ======================================================================
      // SEND ALL STOPS TO PAGE.TSX ON LOAD  (Option A — prevents build failure)
      // ======================================================================
      if (onAllStopsLoaded) {
        const collected: Stop[] = [];
        retailers.features.forEach((f: any) => {
          collected.push({
            label: f.properties.Retailer,
            address: f.properties.Address,
            city: f.properties.City,
            state: f.properties.State,
            zip: f.properties.Zip,
            coords: f.geometry.coordinates,
          });
        });
        kingpins.features.forEach((f: any) => {
          collected.push({
            label: f.properties.Retailer,
            address: f.properties.Address,
            city: f.properties.City,
            state: f.properties.State,
            zip: f.properties.Zip,
            coords: f.geometry.coordinates,
          });
        });
        onAllStopsLoaded(collected);
      }

      // ======================================================================
      // SEND AVAILABLE FILTER VALUES (States, Retailers, Suppliers)
      // ======================================================================
if (onStatesLoaded) {
  const stateList = (
    [...new Set(retailers.features.map((f: any) => String(f.properties.State || "")))]
      .filter(Boolean)
      .sort()
  ) as string[];

  onStatesLoaded(stateList);
}
      if (onRetailersLoaded)
        onRetailersLoaded(
          [...new Set(retailers.features.map((f: any) => f.properties.Retailer || ""))]
            .filter(Boolean)
            .sort()
        );

      if (onSuppliersLoaded)
        onSuppliersLoaded(
          [
            ...new Set(
              retailers.features.flatMap((f: any) => f.properties.Suppliers || [])
            ),
          ]
            .filter(Boolean)
            .sort()
        );

      // ======================================================================
      // RETAILER SUMMARY
      // ======================================================================
      if (onRetailerSummary) {
        const mapSummary = new Map<
          string,
          {
            retailer: string;
            count: number;
            suppliers: string[];
            categories: string[];
            states: string[];
          }
        >();

        retailers.features.forEach((f: any) => {
          const r = f.properties.Retailer;
          if (!r) return;
          const entry = mapSummary.get(r) || {
            retailer: r,
            count: 0,
            suppliers: [],
            categories: [],
            states: [],
          };
          entry.count++;
          entry.suppliers = Array.from(
            new Set([...entry.suppliers, ...(f.properties.Suppliers || [])])
          );
          entry.categories = Array.from(
            new Set([...entry.categories, f.properties.Category])
          );
          entry.states = Array.from(
            new Set([...entry.states, f.properties.State])
          );
          mapSummary.set(r, entry);
        });

        onRetailerSummary(Array.from(mapSummary.values()).sort((a, b) => a.retailer.localeCompare(b.retailer)));
      }
    });
  }, []);

  // ==========================================================================
  // FILTERING — SAFE (NO NEW LAYERS EVER ADDED)
  // ==========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sState = new Set(selectedStates.map(norm));
    const sRetail = new Set(selectedRetailers.map(norm));
    const sCat = new Set(selectedCategories.map(norm));
    const sSup = new Set(selectedSuppliers.map(norm));

    const retailerFilter: any[] = ["all"];

    if (selectedStates.length)
      retailerFilter.push(["in", ["downcase", ["get", "State"]], ["literal", [...sState]]]);
    if (selectedRetailers.length)
      retailerFilter.push(["in", ["downcase", ["get", "Retailer"]], ["literal", [...sRetail]]]);
    if (selectedCategories.length)
      retailerFilter.push(["in", ["downcase", ["get", "Category"]], ["literal", [...sCat]]]);
    if (selectedSuppliers.length)
      retailerFilter.push([
        "in",
        ["downcase", ["get", "Suppliers"]],
        ["literal", [...sSup]],
      ]);

    // Retailers
    map.setFilter("retailers-layer", retailerFilter);

    // HQ — ONLY State filter applies
    map.setFilter(
      "hq-layer",
      selectedStates.length
        ? ["in", ["downcase", ["get", "State"]], ["literal", [...sState]]]
        : ["all"]
    );

    // Kingpin — ALWAYS VISIBLE
    map.setFilter("kingpin-layer", ["all"]);
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  // ==========================================================================
  // HOME + TRIP MARKERS + ROUTE LINE
  // ==========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Route line
    const routeSrc = map.getSource("route") as mapboxgl.GeoJSONSource;
    if (routeSrc && routeGeoJSON) routeSrc.setData(routeGeoJSON);

    // Home marker
    if (homeCoords) {
      const el = document.createElement("div");
      el.style.width = "24px";
      el.style.height = "24px";
      el.style.backgroundImage = `url('${basePath}/icons/Blue_Home.png')`;
      el.style.backgroundSize = "contain";
      el.style.backgroundRepeat = "no-repeat";
      new mapboxgl.Marker({ element: el }).setLngLat(homeCoords).addTo(map);
    }

    // Numbered trip markers
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
      el.style.fontSize = "10px";
      el.style.fontWeight = "bold";
      el.textContent = `${i + 1}`;
      new mapboxgl.Marker({ element: el }).setLngLat(stop.coords).addTo(map);
    });
  }, [homeCoords, tripStops, routeGeoJSON]);

  return (
    <div
      ref={mapContainer}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
    />
  );
}
