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
    ["!=", ["downcase", ["get", "Category"]], "kingpin"]
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
      0
    ]);
    filter.push(["any", ...ors]);
  }

  return filter;
}

function buildCorpHqFilterExpr(selectedStates: string[]): any[] {
  const f: any[] = [
    "all",
    ["==", ["downcase", ["get", "Category"]], "corporate hq"]
  ];
  if (selectedStates.length)
    f.push(["in", ["downcase", ["get", "State"]], ["literal", selectedStates]]);
  return f;
}

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
    "corporate hq": "#ff0000",
    kingpin: "#38bdf8"
  };

  const categoryColorExpr: any[] = [
    "case",
    ["==", ["downcase", ["get", "Category"]], "agronomy"], categoryColors["agronomy"],
    ["==", ["downcase", ["get", "Category"]], "grain/feed"], categoryColors["grain/feed"],
    ["==", ["downcase", ["get", "Category"]], "c-store/service/energy"], categoryColors["c-store/service/energy"],
    ["==", ["downcase", ["get", "Category"]], "distribution"], categoryColors["distribution"],
    "#f9fafb"
  ];

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
        "circle-stroke-width": 1
      }
    });

  if (!map.getLayer("corp-hq-circle"))
    map.addLayer({
      id: "corp-hq-circle",
      type: "circle",
      source: "retailers",
      filter: buildCorpHqFilterExpr([]),
      paint: {
        "circle-radius": 7,
        "circle-color": "#ff0000",
        "circle-stroke-color": "#facc15",
        "circle-stroke-width": 2
      }
    });

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
            "icon-anchor": "bottom"
          }
        });
    };
    img.src = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/kingpin.png`;
  };

  loadKingpin();
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
      coords: [lng, lat]
    };

    const d = document.createElement("div");
    d.style.fontSize = "12px";
    d.style.color = "#111827";
    d.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px;">${stop.label}</div>
      <div style="margin-bottom:4px;">
        ${stop.address}<br/>
        ${stop.city}, ${stop.state} ${stop.zip}
      </div>
      <button id="agroute-add-stop"
        style="padding:4px 6px;border:none;background:#facc15;border-radius:4px;
               font-weight:600;color:#111827;cursor:pointer;">
        Add to Trip
      </button>
    `;

    new mapboxgl.Popup({ offset: 12 })
      .setLngLat([lng, lat])
      .setDOMContent(d)
      .addTo(map);

    d.querySelector("#agroute-add-stop")!.addEventListener("click", () => onAddStop(stop));
  };

  map.on("click", "retailers-circle", click);
  map.on("mouseenter", "retailers-circle", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "retailers-circle", () => (map.getCanvas().style.cursor = ""));

  map.on("click", "corp-hq-circle", click);
  map.on("mouseenter", "corp-hq-circle", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "corp-hq-circle", () => (map.getCanvas().style.cursor = ""));
}

/* =========================================================================
   🚩 HOME MARKER — Blue_Home.png
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
    properties: {}
  };
  if (!map.getSource("home"))
    map.addSource("home", { type: "geojson", data: feature });
  else
    (map.getSource("home") as GeoJSONSource).setData(feature);

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
          "icon-anchor": "bottom"
        }
      });
  }
}

/* =========================================================================
   🧭 TRIP LINE — Yellow Polyline
=========================================================================== */
function updateTrip(map: Map, stops: Stop[]) {
  if (!stops.length) {
    if (map.getLayer("trip-line")) map.removeLayer("trip-line");
    if (map.getSource("trip-line")) map.removeSource("trip-line");
    return;
  }
  const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: stops.map((s) => s.coords) },
    properties: {}
  };
  if (!map.getSource("trip-line"))
    map.addSource("trip-line", { type: "geojson", data: geojson });
  else
    (map.getSource("trip-line") as GeoJSONSource).setData(geojson);

  if (!map.getLayer("trip-line"))
    map.addLayer({
      id: "trip-line",
      type: "line",
      source: "trip-line",
      paint: {
        "line-color": "#facc15",
        "line-width": 3
      }
    });
}

/* =========================================================================
   🌍 MAIN COMPONENT — CERTISMAP
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
  onAddStop
}: CertisMapProps) {
  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
  void routeGeoJSON;
  /* ------------------------------------------------------------------------
     INIT MAP + DM-ALL (UNFILTERED CALLBACKS) + TS-SAFE RETAILER LOAD
  ------------------------------------------------------------------------ */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12", // Bailey Rule
      center: [-93.5, 41.5],
      zoom: 5,
      projection: { name: "mercator" } // Bailey Rule
    });
    mapRef.current = map;

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    Promise.all([
      fetch(`${basePath}/data/retailers.geojson`).then((r) => r.json()),
      fetch(`${basePath}/data/kingpin.geojson`).then((r) => r.json())
    ]).then(([retailersData, kingpinData]) => {
      if (!mapRef.current) return;
      const m = mapRef.current;

      const all = [
        ...(retailersData.features ?? []),
        ...(kingpinData.features ?? [])
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
            coords: c as [number, number]
          };
        })
        .filter(Boolean);

      onAllStopsLoaded(stops);

      const states = [
        ...new Set(
          all
            .map((f) => (f.properties?.State || "").trim().toUpperCase())
            .filter(Boolean)
        )
      ].sort();
      onStatesLoaded(states);

      // ✅ **TS-SAFE Retailer Loading (Fix for build error)**
const retailersList: string[] = Array.from(
  new Set(
    (retailersData.features ?? [])
      .map((f: any): string => String(f.properties?.Retailer ?? "").trim())
      .filter((v: string) => v.length > 0)
  )
).sort();
      onRetailersLoaded(retailersList);

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

      initializeLayers(m, retailersData, kingpinData, onAddStop);
    });
  }, []);

  /* ------------------------------------------------------------------------
     RETAILER SUMMARY — **T2 LOGIC**
     Summary is based ONLY on visible retailers that match *all* filters
  ------------------------------------------------------------------------ */
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

    try {
      const visible = map.queryRenderedFeatures({ layers: ["retailers-circle"] });

      const summary = new Map<
        string,
        { count: number; suppliers: Set<string>; categories: Set<string>; states: Set<string> }
      >();

      for (const f of visible) {
        const p = f.properties || {};
        const name = (p.Retailer || p.Name || "").trim();
        if (!name) continue;

        const entry =
          summary.get(name) ??
          {
            count: 0,
            suppliers: new Set(),
            categories: new Set(),
            states: new Set()
          };

        entry.count++;
        if (p.Category) entry.categories.add(p.Category);
        if (p.State) entry.states.add(p.State);
        if (p.Suppliers)
          String(p.Suppliers)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((s) => entry.suppliers.add(s));

        summary.set(name, entry);
      }

      onRetailerSummary(
        Array.from(summary.entries()).map(([retailer, e]) => ({
          retailer,
          count: e.count,
          suppliers: Array.from(e.suppliers),
          categories: Array.from(e.categories),
          states: Array.from(e.states)
        }))
      );
    } catch (err) {
      console.error("Retailer summary error:", err);
    }
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  /* ------------------------------------------------------------------------
     HOME + TRIP LINE
  ------------------------------------------------------------------------ */
  useEffect(() => {
    if (!mapRef.current) return;
    updateHome(mapRef.current, homeCoords);
  }, [homeCoords]);

  useEffect(() => {
    if (!mapRef.current) return;
    updateTrip(mapRef.current, tripStops);
  }, [tripStops]);

  /* ------------------------------------------------------------------------
     RENDER
  ------------------------------------------------------------------------ */
  return <div ref={containerRef} className="w-full h-full" />;
}
