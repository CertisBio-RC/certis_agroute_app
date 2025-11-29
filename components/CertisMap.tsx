"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map, GeoJSONSource } from "mapbox-gl";

/* ========================================================================
   ⛳ STOP TYPE — must match page.tsx exactly
======================================================================== */
export interface Stop {
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  coords: [number, number];
}

/* ========================================================================
   📌 PROPS — exactly matching the <CertisMap /> call in page.tsx
======================================================================== */
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

/* ========================================================================
   🎨 FILTER HELPERS (Bailey Rules)
   - Retailers: State ∩ Retailer ∩ Supplier ∩ Category
   - Corporate HQ: State ONLY
   - Kingpin1: always visible (no filters)
======================================================================== */
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
    filter.push([
      "in",
      ["downcase", ["get", "State"]],
      ["literal", selectedStates],
    ]);
  }

  if (selectedRetailers.length > 0) {
    filter.push([
      "in",
      ["downcase", ["get", "Retailer"]],
      ["literal", selectedRetailers],
    ]);
  }

  if (selectedCategories.length > 0) {
    filter.push([
      "in",
      ["downcase", ["get", "Category"]],
      ["literal", selectedCategories],
    ]);
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
    filter.push([
      "in",
      ["downcase", ["get", "State"]],
      ["literal", selectedStates],
    ]);
  }

  return filter;
}

/* ========================================================================
   🗺️ SOURCES + LAYERS — RETAILERS, CORPORATE HQ, KINGPIN1
======================================================================== */
function initializeBaseSourcesAndLayers(
  map: Map,
  retailersData: any,
  kingpinData: any,
  onAddStop: (stop: Stop) => void
) {
  if (!map.getSource("retailers")) {
    map.addSource("retailers", {
      type: "geojson",
      data: retailersData,
    });
  }

  if (!map.getSource("kingpins")) {
    map.addSource("kingpins", {
      type: "geojson",
      data: kingpinData,
    });
  }

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
    ["==", ["downcase", ["get", "Category"]], "agronomy"],
    categoryColors["agronomy"],
    ["==", ["downcase", ["get", "Category"]], "grain/feed"],
    categoryColors["grain/feed"],
    ["==", ["downcase", ["get", "Category"]], "c-store/service/energy"],
    categoryColors["c-store/service/energy"],
    ["==", ["downcase", ["get", "Category"]], "distribution"],
    categoryColors["distribution"],
    "#f9fafb",
  ];

  // Retailer circles (4px)
  if (!map.getLayer("retailers-circle")) {
    map.addLayer({
      id: "retailers-circle",
      type: "circle",
      source: "retailers",
      filter: buildRetailerFilterExpr([], [], [], []),
      paint: {
        "circle-radius": 4,
        "circle-color": getCategoryColorExpr as mapboxgl.Expression,
        "circle-stroke-color": "#111827",
        "circle-stroke-width": 1,
      },
    });
  }

  // Corporate HQ — larger yellow circle, no icon
  if (!map.getLayer("corp-hq-circle")) {
    map.addLayer({
      id: "corp-hq-circle",
      type: "circle",
      source: "retailers",
      filter: buildCorporateHqFilterExpr([]),
      paint: {
        "circle-radius": 7,
        "circle-color": "#facc15",
        "circle-stroke-color": "#713f12",
        "circle-stroke-width": 1,
      },
    });
  }

  // Kingpin1 — blue star icon (kingpin.png), always visible
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

  // Click handler for retailers + corporate HQ → Add to Trip
  const clickHandler = (e: mapboxgl.MapMouseEvent & { features?: any[] }) => {
    const feature = e.features?.[0] as any;
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
      <button id="agroute-add-stop-btn"
              style="
                padding:3px 6px;
                border-radius:4px;
                border:none;
                background:#facc15;
                color:#111827;
                font-weight:600;
                cursor:pointer;
              ">
        Add to Trip
      </button>
    `;

    const popup = new mapboxgl.Popup({ offset: 12 })
      .setLngLat([lng, lat])
      .setDOMContent(popupDiv)
      .addTo(map);

    const btn = popupDiv.querySelector<HTMLButtonElement>("#agroute-add-stop-btn");
    if (btn) {
      btn.onclick = () => {
        onAddStop(stop);
        popup.remove();
      };
    }
  };

  if (map.getLayer("retailers-circle")) {
    map.on("click", "retailers-circle", clickHandler);
    map.on("mouseenter", "retailers-circle", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "retailers-circle", () => {
      map.getCanvas().style.cursor = "";
    });
  }

  if (map.getLayer("corp-hq-circle")) {
    map.on("click", "corp-hq-circle", clickHandler);
    map.on("mouseenter", "corp-hq-circle", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "corp-hq-circle", () => {
      map.getCanvas().style.cursor = "";
    });
  }
}

/* ========================================================================
   🚩 HOME MARKER — Blue_Home.png when homeCoords provided
======================================================================== */
function updateHomeMarker(map: Map, homeCoords: [number, number] | null) {
  if (!homeCoords) {
    if (map.getLayer("home-symbol")) {
      map.removeLayer("home-symbol");
    }
    return;
  }

  const [lng, lat] = homeCoords;

  const renderHomeLayer = () => {
    if (!map.getSource("home")) {
      map.addSource("home", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "Point", coordinates: [lng, lat] },
          properties: {},
        },
      });
    } else {
      (map.getSource("home") as GeoJSONSource).setData({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: {},
      });
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
      renderHomeLayer();
    };
    img.src = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/Blue_Home.png`;
  } else {
    renderHomeLayer();
  }
}

/* ========================================================================
   🧭 TRIP POLYLINE — Yellow line for tripStops
======================================================================== */
function updateTripLine(map: Map, tripStops: Stop[]) {
  const coords = tripStops.map((s) => s.coords);

const geojson = {
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: coords,
  },
  properties: {},
} as const;

  if (!map.getSource("trip-line")) {
    map.addSource("trip-line", {
      type: "geojson",
      data: geojson,
    });
  } else {
    (map.getSource("trip-line") as GeoJSONSource).setData(geojson);
  }

  function updateTripLine(map: Map, tripStops: Stop[]) {
  const coords = tripStops.map((s) => s.coords);

  const geojson: GeoJSON.Feature = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: coords,
    },
    properties: {},
  };

  if (!map.getSource("trip-line")) {
    map.addSource("trip-line", {
      type: "geojson",
      data: geojson,
    });
  } else {
    (map.getSource("trip-line") as GeoJSONSource).setData(geojson);
  }

  if (!map.getLayer("trip-line-layer")) {
    map.addLayer({
      id: "trip-line-layer",
      type: "line",
      source: "trip-line",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#facc15", // Bailey Rule – yellow line
        "line-width": 3,
      },
    });
  }
}


/* ========================================================================
   🌍 MAIN COMPONENT — CERTISMAP
======================================================================== */
}export default function CertisMap({
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
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
  mapboxgl.accessToken = mapboxToken;

  // mark routeGeoJSON as used so ESLint doesn't complain, even if we don't use it yet
  void routeGeoJSON;

  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  /* ========================================================================
     🗺️ INITIALIZE MAP + LOAD GEOJSON
  ======================================================================== */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12", // Bailey Rule
      center: [-93.5, 41.5],
      zoom: 5,
      projection: { name: "mercator" }, // Bailey Rule
      accessToken: mapboxToken,
    });

    const map = mapRef.current;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    Promise.all([
      fetch(`${basePath}/data/retailers.geojson`).then((r) => r.json()),
      fetch(`${basePath}/data/kingpin.geojson`).then((r) => r.json()),
    ])
      .then(([retailersData, kingpinData]) => {
        if (!map) return;

        const allFeatures = [
          ...(retailersData.features || []),
          ...(kingpinData.features || []),
        ];

        const stops = allFeatures
          .map((f: any) => {
            const p = f.properties || {};
            if (!f.geometry?.coordinates) return null;
            const [lng, lat] = f.geometry.coordinates;
            return {
              label: p.Name || p.Retailer || "Unknown",
              address: p.Address || "",
              city: p.City || "",
              state: p.State || "",
              zip: p.Zip || "",
              coords: [lng, lat] as [number, number],
            };
          })
          .filter(Boolean) as Stop[];

        onAllStopsLoaded(stops);

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
            (retailersData.features || [])
              .map((f: any) => (f.properties?.Retailer || "").trim())
              .filter(Boolean)
          ),
        ].sort();
       onRetailersLoaded(retailers as string[]);

        const suppliers = [
          ...new Set(
            allFeatures.flatMap((f: any) => {
              const raw = f.properties?.Suppliers;
              if (!raw) return [];
              return String(raw)
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean);
            })
          ),
        ].sort();
        onSuppliersLoaded(suppliers);

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
          const p = f.properties || {};
          const r = (p.Retailer || p.Name || "").trim();
          if (!r) continue;

          const entry =
            summaryMap.get(r) ||
            {
              retailer: r,
              count: 0,
              suppliers: new Set<string>(),
              categories: new Set<string>(),
              states: new Set<string>(),
            };

          entry.count++;
          const cat = (p.Category || "").trim();
          if (cat) entry.categories.add(cat);

          const state = (p.State || "").trim();
          if (state) entry.states.add(state);

          const rawSuppliers = p.Suppliers;
          if (rawSuppliers) {
            String(rawSuppliers)
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
              .forEach((s) => entry.suppliers.add(s));
          }

          summaryMap.set(r, entry);
        }

        const summaryArr = Array.from(summaryMap.values()).map((e) => ({
          retailer: e.retailer,
          count: e.count,
          suppliers: Array.from(e.suppliers),
          categories: Array.from(e.categories),
          states: Array.from(e.states),
        }));
        onRetailerSummary(summaryArr);

        // Make data available on map instance if ever needed
        (map as any).__agroute_retailers = retailersData;
        (map as any).__agroute_kingpin = kingpinData;

        // Ensure sources + layers are initialized once style is ready
        const initLayers = () => {
          if ((map as any).__agroute_layers_initialized) return;
          (map as any).__agroute_layers_initialized = true;
          initializeBaseSourcesAndLayers(map, retailersData, kingpinData, onAddStop);
        };

        if (map.isStyleLoaded()) {
          initLayers();
        } else {
          map.on("styledata", initLayers);
        }
      })
      .catch((err) => {
        console.error("GeoJSON load failure:", err);
      });
  }, [mapboxToken, onAddStop, onAllStopsLoaded, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onRetailerSummary]);

  /* ========================================================================
     🔁 APPLY FILTERS WHEN SELECTIONS CHANGE
  ======================================================================== */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const retailersSource = map.getSource("retailers");
    if (!retailersSource) return;

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
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  /* ========================================================================
     🔄 TRIP LINE & HOME MARKER EFFECTS
  ======================================================================== */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    updateHomeMarker(map, homeCoords);

    if (tripStops.length > 0) {
      updateTripLine(map, tripStops);
    } else {
      if (map.getLayer("trip-line-layer")) {
        map.removeLayer("trip-line-layer");
      }
      if (map.getSource("trip-line")) {
        map.removeSource("trip-line");
      }
    }
  }, [homeCoords, tripStops]);

  /* ========================================================================
     📏 RESIZE OBSERVER
  ======================================================================== */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof ResizeObserver === "undefined") return;

    if (!resizeObserverRef.current) {
      resizeObserverRef.current = new ResizeObserver(() => {
        map.resize();
      });
    }

    const observer = resizeObserverRef.current;
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      if (containerRef.current && observer) {
        observer.unobserve(containerRef.current);
      }
    };
  }, []);

  /* ========================================================================
     🧹 CLEANUP
  ======================================================================== */
  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (map) {
        map.remove();
      }
      mapRef.current = null;
    };
  }, []);

  /* ========================================================================
     📦 RENDER CONTAINER
  ======================================================================== */
  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ position: "relative", width: "100%", height: "100%" }}
    />
  );
}
