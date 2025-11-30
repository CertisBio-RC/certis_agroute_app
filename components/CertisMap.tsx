"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map, GeoJSONSource } from "mapbox-gl";

/* =========================================================================
   ⛳ STOP TYPE
=========================================================================== */
export interface Stop {
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  coords: [number, number];
}

/* =========================================================================
   📌 PROPS
=========================================================================== */
export interface CertisMapProps {
  selectedStates: string[];
  selectedRetailers: string[];
  selectedCategories: string[];
  selectedSuppliers: string[];
  homeCoords: [number, number] | null;
  tripStops: Stop[];
  routeGeoJSON: any;

  onStatesLoaded: (s: string[]) => void;
  onRetailersLoaded: (r: string[]) => void;
  onSuppliersLoaded: (s: string[]) => void;
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

/* =========================================================================
   🎨 FILTERS — Bailey Rules
=========================================================================== */
function buildRetailerFilterExpr(
  states: string[],
  retailers: string[],
  categories: string[],
  suppliers: string[]
): any[] {
  const f: any[] = [
    "all",
    ["!=", ["downcase", ["get", "Category"]], "corporate hq"],
    ["!=", ["downcase", ["get", "Category"]], "kingpin"],
  ];
  if (states.length) f.push(["in", ["downcase", ["get", "State"]], ["literal", states]]);
  if (retailers.length) f.push(["in", ["downcase", ["get", "Retailer"]], ["literal", retailers]]);
  if (categories.length) f.push(["in", ["downcase", ["get", "Category"]], ["literal", categories]]);
  if (suppliers.length) {
    const ors = suppliers.map((s) => [
      ">=",
      ["index-of", s.toLowerCase(), ["downcase", ["get", "Suppliers"]]],
      0,
    ]);
    f.push(["any", ...ors]);
  }
  return f;
}

function buildCorpHqFilterExpr(states: string[]): any[] {
  const f: any[] = ["all", ["==", ["downcase", ["get", "Category"]], "corporate hq"]];
  if (states.length) f.push(["in", ["downcase", ["get", "State"]], ["literal", states]]);
  return f;
}

/* =========================================================================
   🗺 SOURCES + LAYERS (Retailers / Corporate HQ / Kingpin)
=========================================================================== */
function initializeLayers(
  map: Map,
  retailersData: any,
  kingpinData: any,
  onAddStop: (stop: Stop) => void
) {
  if (!map.getSource("retailers"))
    map.addSource("retailers", { type: "geojson", data: retailersData });

  if (!map.getSource("kingpins"))
    map.addSource("kingpins", { type: "geojson", data: kingpinData });

  const categoryColors: Record<string, string> = {
    agronomy: "#22c55e",
    "grain/feed": "#f97316",
    "c-store/service/energy": "#0ea5e9",
    distribution: "#a855f7",
    "corporate hq": "#facc15",
    kingpin: "#38bdf8",
  };

  const categoryColorExpr: any[] = [
    "case",
    ["==", ["downcase", ["get", "Category"]], "agronomy"], categoryColors["agronomy"],
    ["==", ["downcase", ["get", "Category"]], "grain/feed"], categoryColors["grain/feed"],
    ["==", ["downcase", ["get", "Category"]], "c-store/service/energy"], categoryColors["c-store/service/energy"],
    ["==", ["downcase", ["get", "Category"]], "distribution"], categoryColors["distribution"],
    "#f9fafb",
  ];

  /* Retailers */
  if (!map.getLayer("retailers-circle"))
    map.addLayer({
      id: "retailers-circle",
      type: "circle",
      source: "retailers",
      filter: buildRetailerFilterExpr([], [], [], []),
      paint: {
        "circle-radius": 4,
        "circle-color": categoryColorExpr as any,
        "circle-stroke-color": "#111827",
        "circle-stroke-width": 1,
      },
    });

  /* Corporate HQ — Red fill + Yellow border */
  if (!map.getLayer("corp-hq-circle"))
    map.addLayer({
      id: "corp-hq-circle",
      type: "circle",
      source: "retailers",
      filter: buildCorpHqFilterExpr([]),
      paint: {
        "circle-radius": 7,
        "circle-color": "#b91c1c",       // red
        "circle-stroke-color": "#facc15", // yellow border
        "circle-stroke-width": 1.5,
      },
    });

  /* Kingpin PNG icon */
  const loadKingpin = () => {
    if (map.hasImage("kingpin-icon")) return;
    const img = new Image();
    img.onload = () => {
      if (!map.hasImage("kingpin-icon"))
        map.addImage("kingpin-icon", img, { pixelRatio: 2 });
      if (!map.getLayer("kingpin-symbol"))
        map.addLayer({
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
    img.src = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/kingpin.png`;
  };
  loadKingpin();

  /* Popup / Add-to-Trip */
  const click = (e: any) => {
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties || {};
    const coords = f.geometry?.coordinates;
    if (!coords) return;
    const [lng, lat] = coords;

    const stop: Stop = {
      label: p.Name || p.Retailer || "Unknown",
      address: p.Address || "",
      city: p.City || "",
      state: p.State || "",
      zip: p.Zip || "",
      coords: [lng, lat],
    };

    const div = document.createElement("div");
    div.style.fontSize = "12px";
    div.style.color = "#111827";
    div.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px;">${stop.label}</div>
      <div style="margin-bottom:4px;">
        ${stop.address}<br/>
        ${stop.city}, ${stop.state} ${stop.zip}
      </div>
      <button id="add-trip" style="padding:4px 6px;background:#facc15;border:none;border-radius:4px;font-weight:600;cursor:pointer;">
        Add to Trip
      </button>
    `;

    const popup = new mapboxgl.Popup({ offset: 12 })
      .setLngLat([lng, lat])
      .setDOMContent(div)
      .addTo(map);

    div.querySelector("#add-trip")!.addEventListener("click", () => {
      onAddStop(stop);
      popup.remove();
    });
  };

  map.on("click", "retailers-circle", click);
  map.on("mouseenter", "retailers-circle", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "retailers-circle", () => (map.getCanvas().style.cursor = ""));

  map.on("click", "corp-hq-circle", click);
  map.on("mouseenter", "corp-hq-circle", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "corp-hq-circle", () => (map.getCanvas().style.cursor = ""));
}

/* =========================================================================
   🚩 HOME + TRIP LINE
=========================================================================== */
function updateHome(map: Map, home: [number, number] | null) {
  if (!home) {
    if (map.getLayer("home-symbol")) map.removeLayer("home-symbol");
    if (map.getSource("home")) map.removeSource("home");
    return;
  }
  const feature: GeoJSON.Feature<GeoJSON.Point> = {
    type: "Feature",
    geometry: { type: "Point", coordinates: home },
    properties: {},
  };
  if (!map.getSource("home")) map.addSource("home", { type: "geojson", data: feature });
  else (map.getSource("home") as GeoJSONSource).setData(feature);

  if (!map.hasImage("home-icon")) {
    const img = new Image();
    img.onload = () => {
      if (!map.hasImage("home-icon")) map.addImage("home-icon", img, { pixelRatio: 2 });
      render();
    };
    img.src = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/Blue_Home.png`;
    const render = () => {};
  } else {
    if (!map.getLayer("home-symbol"))
      map.addLayer({
        id: "home-symbol",
        type: "symbol",
        source: "home",
        layout: {
          "icon-image": "home-icon",
          "icon-size": 0.45,
          "icon-anchor": "bottom",
        },
      });
  }
}

function updateTrip(map: Map, stops: Stop[]) {
  if (!stops.length) {
    if (map.getLayer("trip-line")) map.removeLayer("trip-line");
    if (map.getSource("trip-line")) map.removeSource("trip-line");
    return;
  }
  const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: stops.map((s) => s.coords) },
    properties: {},
  };
  if (!map.getSource("trip-line"))
    map.addSource("trip-line", { type: "geojson", data: geojson });
  else (map.getSource("trip-line") as GeoJSONSource).setData(geojson);

  if (!map.getLayer("trip-line"))
    map.addLayer({
      id: "trip-line",
      type: "line",
      source: "trip-line",
      paint: {
        "line-color": "#facc15",
        "line-width": 3,
      },
    });
}

/* =========================================================================
   🌍 MAIN COMPONENT
=========================================================================== */
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
  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
  void routeGeoJSON;

  /* INIT + DM-ALL callbacks */
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
        .filter(Boolean);

      onAllStopsLoaded(stops);

      const states = [...new Set(all.map((f) => (f.properties?.State || "").trim().toUpperCase()).filter(Boolean))].sort();
      onStatesLoaded(states);

      const retailers = [
        ...new Set(
          (retailersData.features ?? [])
            .map((f: any) => String(f.properties?.Retailer || "").trim())
            .filter((v: string) => v.length > 0)
        ),
      ].sort();
      onRetailersLoaded(retailers);

      const suppliers = [
        ...new Set(
          all.flatMap((f: any) =>
            String(f.properties?.Suppliers || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          )
        ),
      ].sort();
      onSuppliersLoaded(suppliers);

      initializeLayers(m, retailersData, kingpinData, onAddStop);
    });
  }, []);

  /* RS-FILTERED SUMMARY — B1 (retailers-circle only) */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getLayer("retailers-circle"))
      map.setFilter(
        "retailers-circle",
        buildRetailerFilterExpr(
          selectedStates,
          selectedRetailers,
          selectedCategories,
          selectedSuppliers
        )
      );

    if (map.getLayer("corp-hq-circle"))
      map.setFilter("corp-hq-circle", buildCorpHqFilterExpr(selectedStates));

    /* Summary computed from only **visible retailers** */
    try {
      const visible = map.queryRenderedFeatures({ layers: ["retailers-circle"] });
      const summary = new Map<
        string,
        { count: number; suppliers: Set<string>; categories: Set<string>; states: Set<string> }
      >();

      for (const f of visible) {
        const p = f.properties || {};
        const r = (p.Retailer || p.Name || "").trim();
        if (!r) continue;

        const e =
          summary.get(r) ??
          {
            count: 0,
            suppliers: new Set(),
            categories: new Set(),
            states: new Set(),
          };

        e.count++;
        if (p.Category) e.categories.add(p.Category);
        if (p.State) e.states.add(p.State);
        if (p.Suppliers)
          String(p.Suppliers)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((s) => e.suppliers.add(s));

        summary.set(r, e);
      }

      onRetailerSummary(
        Array.from(summary.entries()).map(([retailer, e]) => ({
          retailer,
          count: e.count,
          suppliers: Array.from(e.suppliers),
          categories: Array.from(e.categories),
          states: Array.from(e.states),
        }))
      );
    } catch (err) {
      console.error("Filtered summary error:", err);
    }
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  useEffect(() => {
    if (mapRef.current) updateHome(mapRef.current, homeCoords);
  }, [homeCoords]);

  useEffect(() => {
    if (mapRef.current) updateTrip(mapRef.current, tripStops);
  }, [tripStops]);

  return <div ref={containerRef} className="w-full h-full" />;
}
