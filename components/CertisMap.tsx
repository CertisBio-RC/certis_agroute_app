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
            "icon-size": 0.6,
            "icon-anchor": "bottom",
          },
        });
      };
      img.src = `${basePath}/icons/kingpin.png`;

      /* POPUPS */
      const click = (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties ?? {};
        const c = f.geometry?.coordinates;
        if (!c) return;
        const [lng, lat] = c;

        const stop: Stop = {
          label: p.Name || p.Retailer || "Unknown",
          address: p.Address || "",
          city: p.City || "",
          state: p.State || "",
          zip: p.Zip || "",
          coords: [lng, lat],
        };

        const suppliers =
          p.Suppliers?.split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
            .join(", ") || "Not listed";

        const div = document.createElement("div");
        div.style.fontSize = "13px";
        div.style.minWidth = "225px";
        div.style.color = "#111827";
        div.innerHTML = `
          <div style="font-size:15px;font-weight:700;margin-bottom:6px;">${stop.label}</div>
          <div style="margin-bottom:6px;line-height:1.3;">
            ${stop.address}<br/>
            ${stop.city}, ${stop.state} ${stop.zip}
          </div>
          <div style="margin-bottom:8px;">
            <span style="font-weight:600;">Suppliers:</span><br/>${suppliers}
          </div>
          <button id="add-stop"
            style="padding:6px 8px;border:none;background:#facc15;border-radius:5px;font-weight:700;color:#111827;cursor:pointer;">
            Add to Trip
          </button>
        `;

        new mapboxgl.Popup({ offset: 12 }).setLngLat([lng, lat]).setDOMContent(div).addTo(m);

        div.querySelector("#add-stop")?.addEventListener("click", () => onAddStop(stop));
      };

      m.on("click", "retailers-circle", click);
      m.on("click", "corp-hq-circle", click);
    });
  }, []);

  /* =========================================================================
     FILTERS + RETAILER SUMMARY (T2 — based ONLY on visible, filtered retailers)
  ========================================================================== */
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

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

    if (m.getLayer("corp-hq-circle"))
      m.setFilter("corp-hq-circle", buildCorpHqFilterExpr(selectedStates));

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

        if (!summaryStore[key]) {
          summaryStore[key] = {
            count: 0,
            suppliers: new Set(),
            categories: new Set(),
            states: new Set(),
          };
        }

        const s = summaryStore[key];
        s.count++;
        if (p.Suppliers)
          p.Suppliers.split(",")
            .map((v: string) => v.trim())
            .filter(Boolean)
            .forEach((v) => s.suppliers.add(v));
        if (p.Category) s.categories.add(p.Category);
        if (p.State) s.states.add(p.State);
      });

      onRetailerSummary(
        Object.entries(summaryStore).map(([retailer, v]) => ({
          retailer,
          count: v.count,
          suppliers: [...v.suppliers],
          categories: [...v.categories],
          states: [...v.states],
        }))
      );
    } catch {}
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  /* =========================================================================
     HOME MARKER
  ========================================================================== */
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    if (!homeCoords) {
      if (m.getLayer("home")) m.removeLayer("home");
      if (m.getSource("home")) m.removeSource("home");
      return;
    }

    const feature: any = {
      type: "Feature",
      geometry: { type: "Point", coordinates: homeCoords },
      properties: {},
    };

    if (!m.getSource("home")) m.addSource("home", { type: "geojson", data: feature });
    else (m.getSource("home") as GeoJSONSource).setData(feature);

    if (!m.hasImage("home-icon")) {
      const img = new Image();
      img.onload = () => {
        if (!m.hasImage("home-icon"))
          m.addImage("home-icon", img, { pixelRatio: 2 });
        draw();
      };
      img.src = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/Blue_Home.png`;
 img.onload = () => {
  if (!m.hasImage("home-icon"))
    m.addImage("home-icon", img, { pixelRatio: 2 });

  if (!m.getLayer("home")) {
    m.addLayer({
      id: "home",
      type: "symbol",
      source: "home",
      layout: {
        "icon-image": "home-icon",
        "icon-size": 0.45,
        "icon-anchor": "bottom",
      },
    });
  }
};

    } else if (!m.getLayer("home")) {
      m.addLayer({
        id: "home",
        type: "symbol",
        source: "home",
        layout: {
          "icon-image": "home-icon",
          "icon-size": 0.45,
          "icon-anchor": "bottom",
        },
      });
    }
  }, [homeCoords]);

  /* =========================================================================
     ROAD-FOLLOWING TRIP ROUTE — Mapbox Directions API (driving)
  ========================================================================== */
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    if (!tripStops.length) {
      if (m.getLayer("trip-route")) m.removeLayer("trip-route");
      if (m.getSource("trip-route")) m.removeSource("trip-route");
      return;
    }

    if (tripStops.length === 1) {
      if (m.getLayer("trip-route")) m.removeLayer("trip-route");
      if (m.getSource("trip-route")) m.removeSource("trip-route");
      return;
    }

    const coords = tripStops.map((s) => `${s.coords[0]},${s.coords[1]}`).join(";");
    const waypoints = tripStops.map(() => "0").join(";"); // no optimization — Map As Entered

    fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&steps=false&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
    )
      .then((r) => r.json())
      .then((json) => {
        const route = json.routes?.[0]?.geometry;
        if (!route) return;

        const feature: any = {
          type: "Feature",
          geometry: route,
          properties: {},
        };

        if (!m.getSource("trip-route"))
          m.addSource("trip-route", { type: "geojson", data: feature });
        else (m.getSource("trip-route") as GeoJSONSource).setData(feature);

        if (!m.getLayer("trip-route"))
          m.addLayer({
            id: "trip-route",
            type: "line",
            source: "trip-route",
            paint: {
              "line-color": "#facc15",
              "line-width": 4,
            },
          });
      });
  }, [tripStops]);

  return <div ref={containerRef} className="w-full h-full" />;
}
