"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map, GeoJSONSource } from "mapbox-gl";

export interface Stop {
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  coords: [number, number];
}

export interface CertisMapProps {
  selectedStates: string[];
  selectedRetailers: string[];
  selectedCategories: string[];
  selectedSuppliers: string[];
  homeCoords: [number, number] | null;
  tripStops: Stop[];
  routeGeoJSON: any;
  onStatesLoaded: (states: string[]) => void;
  onRetailersLoaded: (retailers: string[]) => void;
  onSuppliersLoaded: (suppliers: string[]) => void;
  onRetailerSummary: (
    summary: {
      retailer: string;
      count: number;
      suppliers: string[];
      categories: string[];
      states: string[];
    }[]
  ) => void;
  onAllStopsLoaded: (stops: Stop[]) => void;
  onAddStop: (stop: Stop) => void;
}

function buildRetailerFilterExpr(
  selectedStates: string[],
  selectedRetailers: string[],
  selectedCategories: string[],
  selectedSuppliers: string[]
): any[] {
  const filter: any[] = [
    "all",
    ["!=", ["downcase", ["get", "Category"]], "corporate hq"],
    ["!=", ["downcase", ["get", "Category"]], "kingpin"],
  ];

  if (selectedStates.length)
    filter.push(["in", ["downcase", ["get", "State"]], ["literal", selectedStates]]);

  if (selectedRetailers.length)
    filter.push(["in", ["downcase", ["get", "Retailer"]], ["literal", selectedRetailers]]);

  if (selectedCategories.length)
    filter.push(["in", ["downcase", ["get", "Category"]], ["literal", selectedCategories]]);

  if (selectedSuppliers.length) {
    const ors = selectedSuppliers.map((s) => [
      ">=",
      ["index-of", s.toLowerCase(), ["downcase", ["get", "Suppliers"]]],
      0,
    ]);
    filter.push(["any", ...ors]);
  }

  return filter;
}

function buildCorpHqFilterExpr(selectedStates: string[]): any[] {
  const f: any[] = ["all", ["==", ["downcase", ["get", "Category"]], "corporate hq"]];
  if (selectedStates.length)
    f.push(["in", ["downcase", ["get", "State"]], ["literal", selectedStates]]);
  return f;
}

/* =========================================================================
   MAIN COMPONENT
=========================================================================== */
export default function CertisMap(props: CertisMapProps) {
  const {
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers,
    homeCoords,
    tripStops,
    onStatesLoaded,
    onRetailersLoaded,
    onSuppliersLoaded,
    onRetailerSummary,
    onAllStopsLoaded,
    onAddStop,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

  /* =========================================================================
     INIT MAP + DATA LOAD
  ========================================================================== */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.5],
      zoom: 5,
      projection: { name: "mercator" },
    });

    mapRef.current = map;

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    Promise.all([
      fetch(`${basePath}/data/retailers.geojson`).then((r) => r.json()),
      fetch(`${basePath}/data/kingpin.geojson`).then((r) => r.json()),
    ]).then(([retailersData, kingpinData]) => {
      if (!mapRef.current) return;
      const m = mapRef.current;

      const all = [
        ...(retailersData.features ?? []),
        ...(kingpinData.features ?? []),
      ];

      const stops: Stop[] = all
        .map((f: any) => {
          const p = f.properties ?? {};
          const c = f.geometry?.coordinates;
          if (!c) return null;
          return {
            label: p.Name || p.Retailer || "Unknown",
            address: p.Address || "",
            city: p.City || "",
            state: p.State || "",
            zip: p.Zip || "",
            coords: c as [number, number],
          };
        })
        .filter(Boolean) as Stop[];

      onAllStopsLoaded(stops);

      const states = Array.from(
        new Set(
          all
            .map((f) => String(f.properties?.State ?? "").trim().toUpperCase())
            .filter(Boolean)
        )
      ).sort();
      onStatesLoaded(states);

      const retailers = Array.from(
        new Set(
          (retailersData.features ?? [])
            .map((f: any): string => String(f.properties?.Retailer ?? "").trim())
        )
      )
        .filter(Boolean)
        .sort() as string[];
      onRetailersLoaded(retailers);

      const suppliers = Array.from(
        new Set(
          all.flatMap((f: any) =>
            String(f.properties?.Suppliers || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          )
        )
      ).sort();
      onSuppliersLoaded(suppliers);

      /* LAYERS */
      m.addSource("retailers", { type: "geojson", data: retailersData });
      m.addSource("kingpins", { type: "geojson", data: kingpinData });

      /* Retailer category coloring */
      m.addLayer({
        id: "retailers-circle",
        type: "circle",
        source: "retailers",
        filter: buildRetailerFilterExpr([], [], [], []),
        paint: {
          "circle-radius": 4,
          "circle-color": [
            "match",
            ["downcase", ["get", "Category"]],
            "agronomy", "#22c55e",
            "grain/feed", "#f97316",
            "c-store/service/energy", "#0ea5e9",
            "distribution", "#a855f7",
            "#f9fafb",
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#111827",
        },
      });

      /* Corporate HQ — red fill + yellow border */
      m.addLayer({
        id: "corp-hq-circle",
        type: "circle",
        source: "retailers",
        filter: buildCorpHqFilterExpr([]),
        paint: {
          "circle-radius": 7,
          "circle-color": "#ff0000",
          "circle-stroke-color": "#facc15",
          "circle-stroke-width": 2,
        },
      });

      /* Kingpin PNG */
      const img = new Image();
      img.onload = () => {
        if (!m.hasImage("kingpin-icon")) m.addImage("kingpin-icon", img, { pixelRatio: 2 });
        m.addLayer({
          id: "kingpin-symbol",
          type: "symbol",
          source: "kingpins",
          layout: {
            "icon-image": "kingpin-icon",
            "icon-size": 0.20,
            "icon-anchor": "bottom",
            "icon-allow-overlap": true
          },
        });
      };
      img.src = `${basePath}/icons/kingpin.png`;
      /* =========================================================================
         POPUPS (with formatting + Add to Trip)
      ========================================================================== */
      const click = (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties ?? {};
        const c = f.geometry?.coordinates;
        if (!c) return;
        const [lng, lat] = c;

        const stop: Stop = {
          label: "",
          address: p.Address || "",
          city: p.City || "",
          state: p.State || "",
          zip: p.Zip || "",
          coords: [lng, lat],
        };

        /* =========================
           Data field resolution
           ========================= */
        const retailerTitle =
          (p.Retailer && String(p.Retailer)) ||
          (p.RetailerName && String(p.RetailerName)) ||
          "Unknown retailer";

        const locationTitle =
          (p.Name && String(p.Name)) ||
          (p.LongName && String(p.LongName)) ||
          retailerTitle;

        // For trip list, the stop name should ALWAYS be the LOCATION (branch) name
        stop.label = locationTitle;

        const suppliers =
          p.Suppliers?.split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
            .join(", ") || "Not listed";

        /* =========================
           Render popup HTML
           ========================= */
        const div = document.createElement("div");
        div.style.fontSize = "13px";
        div.style.minWidth = "260px";
        div.style.color = "#ffffff";
        div.style.lineHeight = "1.3";
        div.style.fontFamily = "Segoe UI, Arial";

        const locationLineHtml =
          locationTitle && locationTitle !== retailerTitle
            ? `<div style="font-style:italic;color:#ffffff;">
                 ${locationTitle}
               </div>`
            : "";

        div.innerHTML = `
          <!-- Retailer first (yellow, bold) -->
          <div style="font-size:15px;font-weight:700;margin-bottom:4px;color:#facc15;">
            ${retailerTitle}
          </div>

          <div style="margin-bottom:6px;">
            ${locationLineHtml}
            <div>
              ${stop.address}<br />
              ${stop.city}, ${stop.state} ${stop.zip}
            </div>
          </div>

          <div style="margin-bottom:8px;color:#ffffff;">
            <span style="font-weight:700;">Suppliers:</span><br/>
            ${suppliers}
          </div>

          <button id="add-stop"
            style="
              padding:7px 10px;
              margin-top:4px;
              border:none;
              background:#facc15;
              border-radius:5px;
              font-weight:700;
              font-size:13px;
              color:#111827;
              cursor:pointer;
              width:100%;
            ">
            ➕ Add to Trip
          </button>
        `;

        /* =========================
           Popup bind + "Add to Trip"
           ========================= */
        new mapboxgl.Popup({
          offset: 14,
          closeButton: true,
          closeOnMove: false,
          maxWidth: "300px",
          className: "certis-popup"
        })
          .setLngLat([lng, lat])
          .setDOMContent(div)
          .addTo(m);

        div.querySelector("#add-stop")?.addEventListener("click", () => onAddStop(stop));
      };

      m.on("click", "retailers-circle", click);
      m.on("click", "corp-hq-circle", click);
      m.on("click", "kingpin-symbol", click);
    });
  }, []);

/* =========================================================================
     FILTERS + RETAILER SUMMARY (based ONLY on visible, filtered retailers)
  ========================================================================== */
useEffect(() => {
  const m = mapRef.current;
  if (!m) return;

  // Apply filters to Retailers
  if (m.getLayer("retailers-circle"))
    m.setFilter(
      "retailers-circle",
      buildRetailerFilterExpr(
        selectedStates,
        selectedRetailers,
        selectedCategories,
        selectedSuppliers
      )
    );

  // Apply filters to Corporate HQ (State only)
  if (m.getLayer("corp-hq-circle"))
    m.setFilter("corp-hq-circle", buildCorpHqFilterExpr(selectedStates));

  // Build Retailer Summary based on visible (filtered) points
  try {
    const visible = m.queryRenderedFeatures({ layers: ["retailers-circle"] });

    const summaryStore: Record<
      string,
      { count: number; suppliers: Set<string>; categories: Set<string>; states: Set<string> }
    > = {};

    visible.forEach((f: any) => {
      const p = f.properties ?? {};
      const key = (p.Retailer || p.Name || "").trim();
      if (!key) return;

      // Initialize record if encountering this retailer for the first time
      if (!summaryStore[key]) {
        summaryStore[key] = {
          count: 0,
          suppliers: new Set(),
          categories: new Set(),
          states: new Set(),
        };
      }

      const entry = summaryStore[key];
      entry.count++;

      if (p.Suppliers)
        p.Suppliers.split(",")
          .map((v: string) => v.trim())
          .filter(Boolean)
          .forEach((v) => entry.suppliers.add(v));

      if (p.Category) entry.categories.add(p.Category);
      if (p.State) entry.states.add(p.State);
    });

    // Emit summary upward
    onRetailerSummary(
      Object.entries(summaryStore).map(([retailer, v]) => ({
        retailer,
        count: v.count,
        suppliers: [...v.suppliers],
        categories: [...v.categories],
        states: [...v.states],
      }))
    );
  } catch {
    /* fail silently if map not fully rendered */
  }
}, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    // If no stops → remove route if present
    if (!tripStops.length) {
      if (m.getLayer("trip-route")) m.removeLayer("trip-route");
      if (m.getSource("trip-route")) m.removeSource("trip-route");
      return;
    }

    // If only one stop → no route
    if (tripStops.length === 1) {
      if (m.getLayer("trip-route")) m.removeLayer("trip-route");
      if (m.getSource("trip-route")) m.removeSource("trip-route");
      return;
    }

    // Build “coords” string: lng,lat;lng,lat;lng,lat...
    const coords = tripStops.map((s) => `${s.coords[0]},${s.coords[1]}`).join(";");

    // Map As Entered mode → do NOT optimize order (intentionally)
    // (waypoints array is ignored by Mapbox when steps=false, but included for future extensibility)
    const waypoints = tripStops.map(() => "0").join(";");

    fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&steps=false&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
    )
      .then((r) => r.json())
      .then((json) => {
        const route = json?.routes?.[0]?.geometry;
        if (!route) return;

        const feature: any = {
          type: "Feature",
          geometry: route,
          properties: {},
        };

        // Add or update the geojson route source
        if (!m.getSource("trip-route")) {
          m.addSource("trip-route", { type: "geojson", data: feature });
        } else {
          (m.getSource("trip-route") as GeoJSONSource).setData(feature);
        }

        // Add route layer if missing
        if (!m.getLayer("trip-route")) {
          m.addLayer({
            id: "trip-route",
            type: "line",
            source: "trip-route",
            paint: {
              "line-color": "#facc15",
              "line-width": 4,
            },
          });
        }
      })
      .catch(() => {});
  }, [tripStops]);

  /* =========================================================================
     CLEANUP ON COMPONENT UNMOUNT (prevents memory leaks / duplicate maps)
  ========================================================================== */
  useEffect(() => {
    const m = mapRef.current;

    return () => {
      if (m) {
        try {
          m.remove();
        } catch {}
      }
    };
  }, []);

  /* =========================================================================
     RENDER MAP CONTAINER
  ========================================================================== */
  return <div ref={containerRef} className="w-full h-full" />;
}
