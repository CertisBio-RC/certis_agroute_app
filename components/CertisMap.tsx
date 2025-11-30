"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map, GeoJSONSource } from "mapbox-gl";

/* =========================================================================
   ⛳ STOP TYPE — must match page.tsx exactly
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
   📌 PROPS — EXACTLY matching the <CertisMap /> call in page.tsx
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
   🎨 FILTER HELPERS — Bailey Rules
   • Retailers = State ∩ Retailer ∩ Supplier ∩ Category
   • Corporate HQ = State ONLY
   • Kingpin1 = always visible (never filtered)
=========================================================================== */
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

  if (selectedStates.length > 0) {
    filter.push(["in", ["downcase", ["get", "State"]], ["literal", selectedStates]]);
  }
  if (selectedRetailers.length > 0) {
    filter.push(["in", ["downcase", ["get", "Retailer"]], ["literal", selectedRetailers]]);
  }
  if (selectedCategories.length > 0) {
    filter.push(["in", ["downcase", ["get", "Category"]], ["literal", selectedCategories]]);
  }
  if (selectedSuppliers.length > 0) {
    const supplierClauses = selectedSuppliers.map((s) => [
      ">=",
      ["index-of", s.toLowerCase(), ["downcase", ["get", "Suppliers"]]],
      0,
    ]);
    filter.push(["any", ...supplierClauses]);
  }

  return filter;
}

function buildCorporateHqFilterExpr(selectedStates: string[]): any[] {
  const filter: any[] = [
    "all",
    ["==", ["downcase", ["get", "Category"]], "corporate hq"],
  ];

  if (selectedStates.length > 0) {
    filter.push(["in", ["downcase", ["get", "State"]], ["literal", selectedStates]]);
  }

  return filter;
}
/* =========================================================================
   🗺️ SOURCES + LAYERS — RETAILERS, CORPORATE HQ, KINGPIN1
=========================================================================== */
function initializeBaseSourcesAndLayers(
  map: Map,
  retailersData: any,
  kingpinData: any,
  onAddStop: (stop: Stop) => void
) {
  /* ---------------------------- SOURCES ---------------------------- */
  if (!map.getSource("retailers")) {
    map.addSource("retailers", { type: "geojson", data: retailersData });
  }
  if (!map.getSource("kingpins")) {
    map.addSource("kingpins", { type: "geojson", data: kingpinData });
  }

  /* ----------------------- CATEGORY COLORS ------------------------- */
  const categoryColors: Record<string, string> = {
    agronomy: "#22c55e",
    "grain/feed": "#f97316",
    "c-store/service/energy": "#0ea5e9",
    distribution: "#a855f7",
    "corporate hq": "#facc15",
    kingpin: "#38bdf8",
  };

  const getCategoryColorExpr: any[] = [
    "case",
    ["==", ["downcase", ["get", "Category"]], "agronomy"], categoryColors["agronomy"],
    ["==", ["downcase", ["get", "Category"]], "grain/feed"], categoryColors["grain/feed"],
    ["==", ["downcase", ["get", "Category"]], "c-store/service/energy"], categoryColors["c-store/service/energy"],
    ["==", ["downcase", ["get", "Category"]], "distribution"], categoryColors["distribution"],
    "#f9fafb"
  ];

  /* ---------------------- RETAILER LAYER --------------------------- */
  if (!map.getLayer("retailers-circle")) {
    map.addLayer({
      id: "retailers-circle",
      type: "circle",
      source: "retailers",
      filter: buildRetailerFilterExpr([], [], [], []), // initial DM-ALL view
      paint: {
        "circle-radius": 4,
        "circle-color": getCategoryColorExpr as any,
        "circle-stroke-color": "#111827",
        "circle-stroke-width": 1,
      },
    });
  }

  /* ---------------------- CORPORATE HQ LAYER ----------------------- */
  if (!map.getLayer("corp-hq-circle")) {
    map.addLayer({
      id: "corp-hq-circle",
      type: "circle",
      source: "retailers",
      filter: buildCorporateHqFilterExpr([]), // state-only filter
      paint: {
        "circle-radius": 7,
        "circle-color": "#facc15",
        "circle-stroke-color": "#713f12",
        "circle-stroke-width": 1,
      },
    });
  }

  /* ----------------------- KINGPIN1 LAYER -------------------------- */
  const loadKingpinIcon = () => {
    if (map.hasImage("kingpin-icon")) return;

    const img = new Image();
    img.onload = () => {
      if (!map.hasImage("kingpin-icon")) {
        map.addImage("kingpin-icon", img, { pixelRatio: 2 });
      }
      if (!map.getLayer("kingpin-symbol")) {
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
      }
    };
    img.src = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/kingpin.png`;
  };
  loadKingpinIcon();

  /* ------------------------ ADD-TO-TRIP POPUP ----------------------- */
  const clickHandler = (e: mapboxgl.MapMouseEvent & { features?: any[] }) => {
    const feature = e.features?.[0];
    if (!feature) return;

    const p = feature.properties || {};
    const coords = feature.geometry?.coordinates;
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

    const popupDiv = document.createElement("div");
    popupDiv.style.fontSize = "12px";
    popupDiv.style.color = "#111827";
    popupDiv.innerHTML = `
      <div style="margin-bottom:4px;font-weight:600;">${stop.label}</div>
      <div style="margin-bottom:4px;">
        ${stop.address}<br/>
        ${stop.city}, ${stop.state} ${stop.zip}
      </div>
      <button id="agroute-add-stop"
        style="padding:3px 6px;border-radius:4px;border:none;background:#facc15;
               color:#111827;font-weight:600;cursor:pointer;">
        Add to Trip
      </button>
    `;

    const popup = new mapboxgl.Popup({ offset: 12 })
      .setLngLat([lng, lat])
      .setDOMContent(popupDiv)
      .addTo(map);

    popupDiv.querySelector<HTMLButtonElement>("#agroute-add-stop")!.onclick = () => {
      onAddStop(stop);
      popup.remove();
    };
  };

  /* ----------------------- EVENT LISTENERS -------------------------- */
  if (map.getLayer("retailers-circle")) {
    map.on("click", "retailers-circle", clickHandler);
    map.on("mouseenter", "retailers-circle", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "retailers-circle", () => (map.getCanvas().style.cursor = ""));
  }

  if (map.getLayer("corp-hq-circle")) {
    map.on("click", "corp-hq-circle", clickHandler);
    map.on("mouseenter", "corp-hq-circle", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "corp-hq-circle", () => (map.getCanvas().style.cursor = ""));
  }
} // END initializeBaseSourcesAndLayers

/* =========================================================================
   🚩 HOME MARKER — Blue_Home.png when homeCoords provided
=========================================================================== */
function updateHomeMarker(map: Map, homeCoords: [number, number] | null) {
  if (!homeCoords) {
    if (map.getLayer("home-symbol")) map.removeLayer("home-symbol");
    if (map.getSource("home")) map.removeSource("home");
    return;
  }

  const [lng, lat] = homeCoords;

  // IMPORTANT — coordinates must be mutable `number[]` (not readonly tuple)
  const feature = {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] as number[] },
    properties: {},
  };

  const render = () => {
    if (!map.getSource("home")) {
      map.addSource("home", { type: "geojson", data: feature });
    } else {
      (map.getSource("home") as GeoJSONSource).setData(feature);
    }

    if (!map.getLayer("home-symbol")) {
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
  };

  if (!map.hasImage("home-icon")) {
    const img = new Image();
    img.onload = () => {
      if (!map.hasImage("home-icon")) {
        map.addImage("home-icon", img, { pixelRatio: 2 });
      }
      render();
    };
    img.src = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/Blue_Home.png`;
  } else {
    render();
  }
}
/* =========================================================================
   🧭 TRIP POLYLINE — Yellow line (Bailey Rule)
=========================================================================== */

function updateTripLine(map: Map, tripStops: Stop[]) {
  if (!tripStops.length) {
    if (map.getLayer("trip-line-layer")) map.removeLayer("trip-line-layer");
    if (map.getSource("trip-line")) map.removeSource("trip-line");
    return;
  }

  const coords = tripStops.map((s) => s.coords);
  const geojson: GeoJSON.Feature = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: {},
  };

  if (!map.getSource("trip-line")) {
    map.addSource("trip-line", { type: "geojson", data: geojson });
  } else {
    (map.getSource("trip-line") as GeoJSONSource).setData(geojson);
  }

  if (!map.getLayer("trip-line-layer")) {
    map.addLayer({
      id: "trip-line-layer",
      type: "line",
      source: "trip-line",
      paint: {
        "line-color": "#facc15",
        "line-width": 3,
        "line-join": "round",
        "line-cap": "round",
      },
    });
  }
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
  onAddStop,
}: CertisMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
  mapboxgl.accessToken = token;

  // prevent ESLint unused warning — used in future
  void routeGeoJSON;

  /* ------------------------------------------------------------------------
     🗺 INIT MAP + LOAD GEOJSON + DM-ALL CALLBACKS
  ------------------------------------------------------------------------ */
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12", // Bailey Rule
      center: [-93.5, 41.5],
      zoom: 5,
      projection: { name: "mercator" }, // Bailey Rule
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    Promise.all([
      fetch(`${basePath}/data/retailers.geojson`).then((r) => r.json()),
      fetch(`${basePath}/data/kingpin.geojson`).then((r) => r.json()),
    ])
      .then(([retailersData, kingpinData]) => {
        if (!mapRef.current) return;
        const map = mapRef.current;

        /* --- convert ALL to unified Stop[] --- */
        const allFeatures = [
          ...(retailersData.features ?? []),
          ...(kingpinData.features ?? []),
        ];

        const stops: Stop[] = allFeatures
          .map((f: any) => {
            const p = f.properties ?? {};
            const coords = f.geometry?.coordinates;
            if (!coords) return null;
            return {
              label: p.Name || p.Retailer || "Unknown",
              address: p.Address || "",
              city: p.City || "",
              state: p.State || "",
              zip: p.Zip || "",
              coords: coords as [number, number],
            };
          })
          .filter(Boolean) as Stop[];

        onAllStopsLoaded(stops);
        /* --- DM-ALL STATE / RETAILER / SUPPLIER LISTS --- */
        const states = [
          ...new Set(
            allFeatures
              .map((f: any) => (f.properties?.State || "").trim().toUpperCase())
              .filter(Boolean)
          ),
        ].sort();
        onStatesLoaded(states);

        const retailers = [
          ...new Set(
            retailersData.features
              ?.map((f: any) => (f.properties?.Retailer || "").trim())
              .filter(Boolean)
          ),
        ].sort();
        onRetailersLoaded(retailers);

        const suppliers = [
          ...new Set(
            allFeatures.flatMap((f: any) => {
              const raw = f.properties?.Suppliers;
              if (!raw) return [];
              return String(raw)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            })
          ),
        ].sort();
        onSuppliersLoaded(suppliers);

        /* --- DM-ALL RETAILER SUMMARY (fires once on initial load) --- */
        const summaryMap = new Map<
          string,
          {
            retailer: string;
            count: number;
            suppliers: Set<string>;
            categories: Set<string>;
            states: Set<string>;
          }
        >();

        for (const f of allFeatures) {
          const p = f.properties ?? {};
          const retailer = (p.Retailer || p.Name || "").trim();
          if (!retailer) continue;

          const entry =
            summaryMap.get(retailer) ??
            {
              retailer,
              count: 0,
              suppliers: new Set(),
              categories: new Set(),
              states: new Set(),
            };

          entry.count++;
          if (p.Category) entry.categories.add(p.Category);
          if (p.State) entry.states.add(p.State);

          if (p.Suppliers) {
            String(p.Suppliers)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .forEach((s) => entry.suppliers.add(s));
          }

          summaryMap.set(retailer, entry);
        }

        /* --- initialize map layers when style loads --- */
        const initLayers = () => {
          if ((map as any).__layers_initialized) return;
          (map as any).__layers_initialized = true;
          initializeBaseSourcesAndLayers(map, retailersData, kingpinData, onAddStop);
        };

        if (map.isStyleLoaded()) initLayers();
        else map.on("styledata", initLayers);
      })
      .catch((err) => console.error("GeoJSON load failure:", err));
  }, [
    onAllStopsLoaded,
    onStatesLoaded,
    onRetailersLoaded,
    onSuppliersLoaded,
    onRetailerSummary,
    onAddStop,
  ]);

  /* ------------------------------------------------------------------------
   FILTERING — RS-FILTERED (Retailers filtered strictly by selections)
------------------------------------------------------------------------ */
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  // Apply retailer + corporate HQ filters
  if (map.getLayer("retailers-circle")) {
    map.setFilter(
      "retailers-circle",
      buildRetailerFilterExpr(
        selectedStates,
        selectedRetailers,
        selectedCategories,
        selectedSuppliers
      )
    );
  }

  if (map.getLayer("corp-hq-circle")) {
    map.setFilter("corp-hq-circle", buildCorporateHqFilterExpr(selectedStates));
  }

  // RS-FILTERED Retailer Summary — fire AFTER filtering updates
  try {
    const visible = map.queryRenderedFeatures({ layers: ["retailers-circle"] });

    const summaryMap = new Map<
      string,
      {
        retailer: string;
        count: number;
        suppliers: Set<string>;
        categories: Set<string>;
        states: Set<string>;
      }
    >();

    for (const f of visible) {
      const p = f.properties || {};
      const retailer = (p.Retailer || p.Name || "").trim();
      if (!retailer) continue;

      const entry =
        summaryMap.get(retailer) ??
        {
          retailer,
          count: 0,
          suppliers: new Set(),
          categories: new Set(),
          states: new Set(),
        };

      entry.count++;
      if (p.Category) entry.categories.add(p.Category);
      if (p.State) entry.states.add(p.State);
      if (p.Suppliers) {
        String(p.Suppliers)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((s) => entry.suppliers.add(s));
      }

      summaryMap.set(retailer, entry);
    }

    onRetailerSummary(
      Array.from(summaryMap.values()).map((e) => ({
        retailer: e.retailer,
        count: e.count,
        suppliers: Array.from(e.suppliers),
        categories: Array.from(e.categories),
        states: Array.from(e.states),
      }))
    );
  } catch (err) {
    console.error("Filtered retailer summary error:", err);
  }
}, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  /* ------------------------------------------------------------------------
     HOME + TRIP LINE (persistent with filter changes)
  ------------------------------------------------------------------------ */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    updateHomeMarker(map, homeCoords);
    updateTripLine(map, tripStops);
  }, [homeCoords, tripStops]);

  /* ------------------------------------------------------------------------
     RESIZE OBSERVER — prevents map distortion after layout changes
  ------------------------------------------------------------------------ */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof ResizeObserver === "undefined") return;

    if (!resizeObserverRef.current) {
      resizeObserverRef.current = new ResizeObserver(() => map.resize());
    }

    const observer = resizeObserverRef.current;
    if (mapContainerRef.current) observer.observe(mapContainerRef.current);

    return () => {
      if (mapContainerRef.current && observer) {
        observer.unobserve(mapContainerRef.current);
      }
    };
  }, []);

  /* ------------------------------------------------------------------------
     CLEANUP — destroy map on component unmount
  ------------------------------------------------------------------------ */
  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (map) map.remove();
      mapRef.current = null;
    };
  }, []);

  /* ------------------------------------------------------------------------
     RENDER
  ------------------------------------------------------------------------ */
  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full relative"
      style={{ width: "100%", height: "100%", position: "relative" }}
    />
  );
}
