"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map, GeoJSONSource } from "mapbox-gl";

/* =========================================================================
   ⛳ STOP TYPE — must match page.tsx
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
   📌 PROPS — EXACT match with <CertisMap /> in page.tsx
=========================================================================== */
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

  // T2 Retailer Summary — one block per retailer in tripStops (whole company footprint)
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
function buildRetailerFilter(
  states: string[],
  retailers: string[],
  cats: string[],
  sups: string[]
): any[] {
  const f: any[] = [
    "all",
    ["!=", ["downcase", ["get", "Category"]], "corporate hq"],
    ["!=", ["downcase", ["get", "Category"]], "kingpin"],
  ];

  if (states.length) f.push(["in", ["downcase", ["get", "State"]], ["literal", states]]);
  if (retailers.length)
    f.push(["in", ["downcase", ["get", "Retailer"]], ["literal", retailers]]);
  if (cats.length)
    f.push(["in", ["downcase", ["get", "Category"]], ["literal", cats]]);

  if (sups.length) {
    const ors = sups.map((s) => [
      ">=",
      ["index-of", s.toLowerCase(), ["downcase", ["get", "Suppliers"]]],
      0,
    ]);
    f.push(["any", ...ors]);
  }

  return f;
}

function buildCorpFilter(states: string[]): any[] {
  const f: any[] = [
    "all",
    ["==", ["downcase", ["get", "Category"]], "corporate hq"],
  ];
  if (states.length)
    f.push(["in", ["downcase", ["get", "State"]], ["literal", states]]);
  return f;
}

/* =========================================================================
   🗺 LOAD SOURCES + LAYERS (Bailey Rules)
=========================================================================== */
function initLayers(
  map: Map,
  retailers: any,
  kingpins: any,
  onAddStop: (s: Stop) => void
) {
  if (!map.getSource("retailers"))
    map.addSource("retailers", { type: "geojson", data: retailers });
  if (!map.getSource("kingpins"))
    map.addSource("kingpins", { type: "geojson", data: kingpins });

  const colors: Record<string, string> = {
    agronomy: "#22c55e",
    "grain/feed": "#f97316",
    "c-store/service/energy": "#0ea5e9",
    distribution: "#a855f7",
    "corporate hq": "#ff0000", // HQ must not use icon
    kingpin: "#38bdf8",
  };

  const colorExpr: any[] = [
    "case",
    ["==", ["downcase", ["get", "Category"]], "agronomy"], colors["agronomy"],
    ["==", ["downcase", ["get", "Category"]], "grain/feed"], colors["grain/feed"],
    ["==", ["downcase", ["get", "Category"]], "c-store/service/energy"], colors["c-store/service/energy"],
    ["==", ["downcase", ["get", "Category"]], "distribution"], colors["distribution"],
    "#f9fafb",
  ];

  if (!map.getLayer("retailers-circle"))
    map.addLayer({
      id: "retailers-circle",
      type: "circle",
      source: "retailers",
      filter: buildRetailerFilter([], [], [], []),
      paint: {
        "circle-radius": 4,
        "circle-color": colorExpr as any,
        "circle-stroke-color": "#111827",
        "circle-stroke-width": 1,
      },
    });

  if (!map.getLayer("corp-hq-circle"))
    map.addLayer({
      id: "corp-hq-circle",
      type: "circle",
      source: "retailers",
      filter: buildCorpFilter([]),
      paint: {
        "circle-radius": 7,
        "circle-color": "#ff0000",
        "circle-stroke-color": "#facc15", // yellow border
        "circle-stroke-width": 2,
      },
    });

  // KINGPIN = PNG symbol
  const loadKingpin = () => {
    if (map.hasImage("kingpin-img")) return;
    const img = new Image();
    img.onload = () => {
      if (!map.hasImage("kingpin-img"))
        map.addImage("kingpin-img", img, { pixelRatio: 2 });

      if (!map.getLayer("kingpin-symbol"))
        map.addLayer({
          id: "kingpin-symbol",
          type: "symbol",
          source: "kingpins",
          layout: {
            "icon-image": "kingpin-img",
            "icon-size": 0.6,
            "icon-anchor": "bottom",
          },
        });
    };
    img.src = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/kingpin.png`;
  };
  loadKingpin();

  // popup handler (Add-to-Trip)
  const click = (e: any) => {
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties || {};
    const c = f.geometry?.coordinates;
    if (!c) return;

    const stop: Stop = {
      label: p.Name || p.Retailer || "Unknown",
      address: p.Address || "",
      city: p.City || "",
      state: p.State || "",
      zip: p.Zip || "",
      coords: c as [number, number],
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
      <button id="agroute-add-stop"
        style="padding:4px 6px;background:#facc15;border:none;
               border-radius:4px;font-weight:600;color:#111827;cursor:pointer;">
        Add to Trip
      </button>
    `;

    new mapboxgl.Popup({ offset: 12 })
      .setLngLat(stop.coords)
      .setDOMContent(div)
      .addTo(map);

    div.querySelector("#agroute-add-stop")!.addEventListener("click", () =>
      onAddStop(stop)
    );
  };

  map.on("click", "retailers-circle", click);
  map.on("click", "corp-hq-circle", click);
}

/* =========================================================================
   🚩 HOME MARKER
=========================================================================== */
function updateHome(map: Map, coords: [number, number] | null) {
  if (!coords) {
    if (map.getLayer("home-symbol")) map.removeLayer("home-symbol");
    if (map.getSource("home")) map.removeSource("home");
    return;
  }
  const ft: GeoJSON.Feature<GeoJSON.Point> = {
    type: "Feature",
    geometry: { type: "Point", coordinates: coords },
    properties: {},
  };

  if (!map.getSource("home"))
    map.addSource("home", { type: "geojson", data: ft });
  else (map.getSource("home") as GeoJSONSource).setData(ft);

  const load = () => {
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
  };

  if (!map.hasImage("home-icon")) {
    const img = new Image();
    img.onload = () => {
      if (!map.hasImage("home-icon"))
        map.addImage("home-icon", img, { pixelRatio: 2 });
      load();
    };
    img.src = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/Blue_Home.png`;
  } else load();
}

/* =========================================================================
   🧭 TRIP POLYLINE
=========================================================================== */
function updateTripLine(map: Map, stops: Stop[]) {
  if (!stops.length) {
    if (map.getLayer("trip-line")) map.removeLayer("trip-line");
    if (map.getSource("trip-line")) map.removeSource("trip-line");
    return;
  }

  const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: stops.map((s) => s.coords),
    },
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
   🌍 MAIN COMPONENT — CERTISMAP
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

  const mapRef = useRef<Map | null>(null);
  const divRef = useRef<HTMLDivElement | null>(null);

  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

  /* ------------------------------------------------------------------------
     INIT MAP + DM-ALL dataset loads (NO SUMMARY HERE)
  ------------------------------------------------------------------------ */
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: divRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.5, 41.5],
      zoom: 5,
      projection: { name: "mercator" },
    });
    mapRef.current = map;

    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

    Promise.all([
      fetch(`${base}/data/retailers.geojson`).then((r) => r.json()),
      fetch(`${base}/data/kingpin.geojson`).then((r) => r.json()),
    ]).then(([retailers, kingpins]) => {
      if (!mapRef.current) return;
      const m = mapRef.current;

      const all = [...(retailers.features ?? []), ...(kingpins.features ?? [])];

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

      const retailersList: string[] = [
        ...new Set(
          (retailers.features ?? [])
            .map((f: any) => String(f.properties?.Retailer || "").trim())
            .filter((v: string) => v.length > 0)
        ),
      ].sort();
      onRetailersLoaded(retailersList);

      const suppliers: string[] = [
        ...new Set(
          all.flatMap((f: any) =>
            String(f.properties?.Suppliers || "")
              .split(",")
              .map((s) => s.trim())
              .filter((v) => v.length > 0)
          )
        ),
      ].sort();
      onSuppliersLoaded(suppliers);

      initLayers(m, retailers, kingpins, onAddStop);
    });
  }, []);

  /* ------------------------------------------------------------------------
     FILTERING — RS (for map only, not for summary)
  ------------------------------------------------------------------------ */
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    if (m.getLayer("retailers-circle"))
      m.setFilter(
        "retailers-circle",
        buildRetailerFilter(
          selectedStates,
          selectedRetailers,
          selectedCategories,
          selectedSuppliers
        )
      );

    if (m.getLayer("corp-hq-circle"))
      m.setFilter("corp-hq-circle", buildCorpFilter(selectedStates));
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  /* ------------------------------------------------------------------------
     RETAILER SUMMARY — T2 (TRIP-BASED company-wide profile)
  ------------------------------------------------------------------------ */
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
    if (!tripStops.length) {
      onRetailerSummary([]);
      return;
    }

    fetch(`${base}/data/retailers.geojson`)
      .then((r) => r.json())
      .then((ret) => {
        const out: {
          retailer: string;
          count: number;
          suppliers: string[];
          categories: string[];
          states: string[];
        }[] = [];

        for (const stop of tripStops) {
          const name = stop.label.trim();
          const match = ret.features.filter(
            (f: any) =>
              String(f.properties?.Retailer || "").trim().toLowerCase() ===
              name.toLowerCase()
          );

          const states = new Set<string>();
          const cats = new Set<string>();
          const sups = new Set<string>();

          for (const f of match) {
            const p = f.properties || {};
            if (p.State) states.add(p.State);
            if (p.Category) cats.add(p.Category);
            if (p.Suppliers)
              String(p.Suppliers)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .forEach((s) => sups.add(s));
          }

          out.push({
            retailer: name,
            count: match.length,
            states: Array.from(states),
            categories: Array.from(cats),
            suppliers: Array.from(sups),
          });
        }

        onRetailerSummary(out);
      });
  }, [tripStops]);

  /* ------------------------------------------------------------------------
     HOME + TRIP LINE
  ------------------------------------------------------------------------ */
  useEffect(() => {
    if (!mapRef.current) return;
    updateHome(mapRef.current, homeCoords);
  }, [homeCoords]);

  useEffect(() => {
    if (!mapRef.current) return;
    updateTripLine(mapRef.current, tripStops);
  }, [tripStops]);

  /* ------------------------------------------------------------------------
     RENDER
  ------------------------------------------------------------------------ */
  return (
    <div
      ref={divRef}
      className="w-full h-full"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
