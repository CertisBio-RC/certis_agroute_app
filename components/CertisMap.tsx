// ============================================================================
// 💠 CERTIS AGROUTE — K4 GOLD FINAL (CANONICAL VERSION — BUILD-SAFE)
//   • Satellite-streets-v12  (Bailey Rule — locked)
//   • Mercator projection    (Bailey Rule — locked)
//   • Retailers filter = State ∩ Retailer ∩ Category ∩ Supplier
//   • Corporate HQ always visible (State filter allowed)
//   • Kingpin always visible — immune to all filters
//   • Kingpin = PNG Blue Star (kingpin.png) — symbol layer
//   • Popups include Add-to-Trip
//   • Home icon ALWAYS visible (H1 locked)
//   • Fully static-export-safe for GitHub Pages (basePath enforced)
// ============================================================================

"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map } from "mapbox-gl";
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// STATIC-EXPORT SAFE BASE PATH for GitHub Pages
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// STOP TYPE (must match page.tsx)
export interface Stop {
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  coords: [number, number];
}

// PROPS
interface CertisMapProps {
  selectedStates: string[];
  selectedRetailers: string[];
  selectedCategories: string[];
  selectedSuppliers: string[];

  homeCoords: [number, number] | null;
  tripStops: Stop[];
  routeGeoJSON: any | null;

  onAddStop?: (stop: Stop) => void;
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
}

export default function CertisMap({
  selectedStates,
  selectedRetailers,
  selectedCategories,
  selectedSuppliers,
  homeCoords,
  tripStops,
  routeGeoJSON,
  onAddStop,
  onStatesLoaded,
  onRetailersLoaded,
  onSuppliersLoaded,
  onRetailerSummary,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  // ==========================================================================
  // INITIAL MAP + DATA LOAD (runs once)
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
      // STATIC-EXPORT SAFE GEOJSON LOAD
      const retailersRes = await fetch(`${basePath}/data/retailers.geojson`);
      const retailers = await retailersRes.json();

      const kingpinRes = await fetch(`${basePath}/data/kingpin.geojson`);
      const kingpins = await kingpinRes.json();

      // SOURCES
      map.addSource("retailers", { type: "geojson", data: retailers });
      map.addSource("kingpin", { type: "geojson", data: kingpins });
      map.addSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // ICONS
      map.loadImage(`${basePath}/icons/Blue_Home.png`, (err, img) => {
        if (!err && img && !map.hasImage("home-icon")) {
          map.addImage("home-icon", img);
        }
      });

      map.loadImage(`${basePath}/icons/kingpin.png`, (err, img) => {
        if (!err && img && !map.hasImage("kingpin-icon")) {
          map.addImage("kingpin-icon", img);
        }
      });

      // LAYERS — SAFE because created only once
      map.addLayer({
        id: "retailers-layer",
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
        id: "hq-layer",
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
        layout: {
          "icon-image": "kingpin-icon",
          "icon-size": 0.38, // 🔥 Final locked size (prevents giant stars)
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
        },
      });

      // DROPDOWN POPULATION + SUMMARY
      if (onStatesLoaded) {
        onStatesLoaded(
          [...new Set(retailers.features.map((f: any) => f.properties.State))].sort()
        );
      }
      if (onRetailersLoaded) {
        onRetailersLoaded(
          [...new Set(retailers.features.map((f: any) => f.properties.Retailer))].sort()
        );
      }
      if (onSuppliersLoaded) {
        onSuppliersLoaded(
          [
            ...new Set(
              retailers.features.flatMap((f: any) => f.properties.Suppliers ?? [])
            ),
          ].sort()
        );
      }
      if (onRetailerSummary) {
        const summary = new Map<string, any>();
        for (const f of retailers.features) {
          const r = f.properties.Retailer;
          if (!summary.has(r)) {
            summary.set(r, {
              retailer: r,
              count: 0,
              suppliers: new Set<string>(),
              categories: new Set<string>(),
              states: new Set<string>(),
            });
          }
          const s = summary.get(r);
          s.count++;
          (f.properties.Suppliers ?? []).forEach((x: string) => s.suppliers.add(x));
          s.categories.add(f.properties.Category);
          s.states.add(f.properties.State);
        }
        onRetailerSummary(
          [...summary.values()].map((x) => ({
            retailer: x.retailer,
            count: x.count,
            suppliers: [...x.suppliers],
            categories: [...x.categories],
            states: [...x.states],
          }))
        );
      }

      // POPUP
      const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true });
      function bindPopup(layerId: string) {
        map.on("click", layerId, (e) => {
          const f = e.features?.[0];
          if (!f) return;

          popup
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font-size:14px; line-height:1.25; color:white;">
                <strong style="color:#FFD348; font-size:16px">${f.properties.Retailer}</strong><br/>
                ${f.properties.Address}<br/>
                ${f.properties.City}, ${f.properties.State} ${f.properties.Zip}<br/>
                <strong>Category:</strong> ${f.properties.Category}<br/>
                <strong>Suppliers:</strong><br/>${(f.properties.Suppliers ?? []).join("<br/>")}
                <button id="addStopBtn" style="margin-top:8px; padding:6px 12px; background:#1e40af; border-radius:4px; color:white;">
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
    });
  }, [
    onStatesLoaded,
    onRetailersLoaded,
    onSuppliersLoaded,
    onRetailerSummary,
    onAddStop,
  ]);

  // ==========================================================================
  // FILTERING — SAFE (no new layer creation)
  // ==========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const norm = (v: string) => (v || "").trim().toLowerCase();

    const sState = new Set(selectedStates.map(norm));
    const sRetailer = new Set(selectedRetailers.map(norm));
    const sCat = new Set(selectedCategories.map(norm));
    const sSup = new Set(selectedSuppliers.map(norm));

    const retailerFilter: any[] = ["all"];
    if (selectedStates.length)
      retailerFilter.push(["in", ["downcase", ["get", "State"]], ["literal", [...sState]]]);
    if (selectedRetailers.length)
      retailerFilter.push(["in", ["downcase", ["get", "Retailer"]], ["literal", [...sRetailer]]]);
    if (selectedCategories.length)
      retailerFilter.push(["in", ["downcase", ["get", "Category"]], ["literal", [...sCat]]]);
    if (selectedSuppliers.length) {
      retailerFilter.push([
        "any",
        ["in", ["downcase", ["get", "Supplier"]], ["literal", [...sSup]]],
        ["in", ["downcase", ["get", "Suppliers"]], ["literal", [...sSup]]],
      ]);
    }
    map.setFilter("retailers-layer", retailerFilter);

    map.setFilter(
      "hq-layer",
      selectedStates.length
        ? ["in", ["downcase", ["get", "State"]], ["literal", [...sState]]]
        : ["all"]
    );

    map.setFilter("kingpin-layer", ["all"]);
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  // ==========================================================================
  // HOME + TRIP MARKERS + ROUTE
  // ==========================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Route
    const src = map.getSource("route") as mapboxgl.GeoJSONSource;
    if (src && routeGeoJSON) src.setData(routeGeoJSON);

    // HOME ICON — ALWAYS VISIBLE
    if (homeCoords) {
      const el = document.createElement("div");
      el.style.width = "24px";
      el.style.height = "24px";
      el.style.backgroundImage = `url('${basePath}/icons/Blue_Home.png')`;
      el.style.backgroundSize = "contain";
      el.style.backgroundRepeat = "no-repeat";
      new mapboxgl.Marker({ element: el }).setLngLat(homeCoords).addTo(map);
    }

    // NUMBERED TRIP MARKERS
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
      el.textContent = String(i + 1);
      new mapboxgl.Marker({ element: el }).setLngLat(stop.coords).addTo(map);
    });
  }, [homeCoords, tripStops, routeGeoJSON]);

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div
      ref={mapContainer}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
      }}
    />
  );
}
