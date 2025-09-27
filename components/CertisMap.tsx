// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ✅ Exported category colors for legend in page.tsx
export const categoryColors: Record<string, { color: string; outline?: string }> = {
  Agronomy: { color: "#FFD700", outline: "#000" }, // yellow
  "Grain/Feed": { color: "#228B22", outline: "#000" }, // green
  "Office/Service": { color: "#1E90FF", outline: "#000" }, // blue
  Kingpin: { color: "#FF0000", outline: "#FFFF00" }, // red w/ yellow border
};

// ✅ Normalize categories consistently
const normalizeCategory = (cat: string) => {
  switch ((cat || "").trim().toLowerCase()) {
    case "agronomy":
      return "agronomy";
    case "grain/feed":
    case "grainfeed":
      return "grainfeed";
    case "office/service":
    case "officeservice":
      return "officeservice";
    case "kingpin":
      return "kingpin";
    default:
      return (cat || "").trim().toLowerCase();
  }
};

// ✅ Helper normalizer
const norm = (val: string) => (val || "").toString().trim().toLowerCase();

// ✅ Supplier name map
const SUPPLIER_NAME_MAP: Record<string, string> = {
  chs: "CHS",
  winfield: "Winfield",
  helena: "Helena",
  rosens: "Rosens",
  growmark: "Growmark",
  iap: "IAP",
  "wilbur-ellis": "Wilbur-Ellis",
};

function standardizeSupplier(raw: string): string {
  const key = (raw || "").trim().toLowerCase();
  if (SUPPLIER_NAME_MAP[key]) return SUPPLIER_NAME_MAP[key];
  return raw
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function splitAndStandardizeSuppliers(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(standardizeSupplier);
}

// ✅ Trip Stop structure
export interface Stop {
  label: string;
  address: string;
  coords: [number, number];
}

export interface CertisMapProps {
  selectedCategories: string[];
  selectedStates: string[];
  selectedSuppliers: string[];
  selectedRetailers: string[];
  onStatesLoaded?: (states: string[]) => void;
  onRetailersLoaded?: (retailers: string[]) => void;
  onSuppliersLoaded?: (suppliers: string[]) => void;
  onRetailerSummary?: (
    summaries: {
      state: string;
      retailer: string;
      count: number;
      suppliers: string[];
      category?: string;
    }[]
  ) => void;
  onAddStop?: (stop: Stop) => void;
  tripStops?: Stop[];
  tripMode?: "entered" | "optimize";
}

export default function CertisMap({
  selectedCategories,
  selectedStates,
  selectedSuppliers,
  selectedRetailers,
  onStatesLoaded,
  onRetailersLoaded,
  onSuppliersLoaded,
  onRetailerSummary,
  onAddStop,
  tripStops = [],
  tripMode = "entered",
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const geojsonPath = `${
    process.env.NEXT_PUBLIC_BASE_PATH || ""
  }/data/retailers.geojson?cacheBust=${Date.now()}`;

  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-98.5795, 39.8283],
      zoom: 4,
      projection: "mercator",
    });

    mapRef.current = map;

    map.on("load", async () => {
      try {
        const response = await fetch(geojsonPath);
        const data = await response.json();

        const stateSet = new Set<string>();
        const retailerSetAll = new Set<string>();
        const supplierSet = new Set<string>();

        for (const feature of data.features) {
          const state = feature.properties?.State;
          const longName = feature.properties?.["Long Name"];
          const suppliersRaw = feature.properties?.Suppliers;

          if (state) stateSet.add(state);
          if (longName) retailerSetAll.add(longName);

          splitAndStandardizeSuppliers(suppliersRaw).forEach((s) =>
            supplierSet.add(s)
          );
        }

        onStatesLoaded?.(Array.from(stateSet).sort());
        onSuppliersLoaded?.(Array.from(supplierSet).sort());
        onRetailersLoaded?.(Array.from(retailerSetAll).sort());

        map.addSource("retailers", { type: "geojson", data });

        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 4,
            "circle-color": [
              "match",
              ["get", "Category"],
              "Agronomy",
              categoryColors.Agronomy.color,
              "Grain/Feed",
              categoryColors["Grain/Feed"].color,
              "Office/Service",
              categoryColors["Office/Service"].color,
              "#1d4ed8",
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
          filter: ["!=", ["get", "Category"], "Kingpin"],
        });

        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 7,
            "circle-color": categoryColors.Kingpin.color,
            "circle-stroke-width": 2,
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
          filter: ["==", ["get", "Category"], "Kingpin"],
        });

        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          maxWidth: "none",
        });

        function buildPopupHTML(props: any, coords: [number, number]) {
          const longName = props["Long Name"] || props.Retailer || "Unknown";
          const siteName = props.Name || "";
          const category = props.Category || "N/A";
          const stopLabel = siteName ? `${longName} – ${siteName}` : longName;

          const suppliers =
            splitAndStandardizeSuppliers(props.Suppliers).join(", ") || "N/A";
          const btnId = `add-stop-${Math.random().toString(36).slice(2)}`;

          const addressLine = `${props.Address || ""}, ${props.City || ""}, ${props.State || ""} ${props.Zip || ""}`;

          const html = `
            <div style="font-size: 13px; width:360px; background:#1a1a1a; color:#f5f5f5;
                        padding:6px; border-radius:4px; position:relative;">
              <button id="${btnId}"
                style="position:absolute; top:4px; right:4px; padding:2px 6px;
                       background:#166534; color:#fff; border:none; border-radius:3px;
                       font-size:11px; cursor:pointer; display:flex; align-items:center; gap:4px; font-weight:600;">
                <span style="background:#fff; color:#166534; border-radius:50%; width:14px; height:14px;
                             display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:bold;">
                  +
                </span>
                Add to Trip
              </button>
              <strong>${longName}</strong><br/>
              <em>${siteName}</em><br/>
              ${props.Address || ""}<br/>
              ${props.City || ""} ${props.State || ""} ${props.Zip || ""}<br/>
              <strong>Category:</strong> ${category}<br/>
              Suppliers: ${suppliers}
            </div>
          `;

          setTimeout(() => {
            const btn = document.getElementById(btnId);
            if (btn && onAddStop) {
              btn.onclick = () =>
                onAddStop({
                  label: stopLabel,
                  address: addressLine,
                  coords,
                });
            }
          }, 0);

          return html;
        }

        function bindPopup(layerId: string) {
          map.on("mouseenter", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const coords = (e.features?.[0].geometry as GeoJSON.Point)
              ?.coordinates.slice() as [number, number];
            const props = e.features?.[0].properties;
            if (coords && props)
              popup.setLngLat(coords).setHTML(buildPopupHTML(props, coords)).addTo(map);
          });
          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
          });
          map.on("click", layerId, (e) => {
            const coords = (e.features?.[0].geometry as GeoJSON.Point)
              ?.coordinates.slice() as [number, number];
            const props = e.features?.[0].properties;
            if (coords && props) {
              new mapboxgl.Popup({ maxWidth: "none" })
                .setLngLat(coords)
                .setHTML(buildPopupHTML(props, coords))
                .addTo(map);
            }
          });
        }

        bindPopup("retailers-layer");
        bindPopup("kingpins-layer");
      } catch (err) {
        console.error("Failed to load GeoJSON", err);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onAddStop]);

  // ✅ Dynamic filtering (unchanged)
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const source = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!source) return;

    fetch(geojsonPath)
      .then((res) => res.json())
      .then((data) => {
        const filtered = {
          type: "FeatureCollection" as const,
          features: data.features.filter((f: any) => {
            const props = f.properties || {};
            if (props.Category === "Kingpin") return true;

            const stateMatch =
              selectedStates.length === 0 ||
              selectedStates.map(norm).includes(norm(props.State));
            const retailerMatch =
              selectedRetailers.length === 0 ||
              selectedRetailers.map(norm).includes(norm(props["Long Name"]));
            const categoryMatch =
              selectedCategories.length === 0 ||
              selectedCategories
                .map(normalizeCategory)
                .includes(normalizeCategory(props.Category));
            const supplierList = splitAndStandardizeSuppliers(props.Suppliers).map(norm);
            const supplierMatch =
              selectedSuppliers.length === 0 ||
              selectedSuppliers.map(norm).some((s) => supplierList.includes(s));

            return stateMatch && retailerMatch && categoryMatch && supplierMatch;
          }),
        };

        source.setData(filtered);

        if (onRetailerSummary) {
          const summaryMap = new Map<
            string,
            { state: string; retailer: string; count: number; suppliers: string[] }
          >();
          for (const f of filtered.features) {
            const props = f.properties || {};
            if (props.Category === "Kingpin") continue;

            const state = props.State || "Unknown";
            const retailer = props["Long Name"] || props.Retailer || "Unknown";
            const suppliers = splitAndStandardizeSuppliers(props.Suppliers);
            const key = `${state}-${retailer}`;

            if (!summaryMap.has(key)) {
              summaryMap.set(key, { state, retailer, count: 0, suppliers: [] });
            }
            const entry = summaryMap.get(key)!;
            entry.count += 1;
            suppliers.forEach((s) => {
              if (s && !entry.suppliers.includes(s)) entry.suppliers.push(s);
            });
          }
          onRetailerSummary(Array.from(summaryMap.values()));
        }

        if (onRetailersLoaded) {
          const visibleRetailers = new Set<string>();
          for (const f of data.features) {
            const props = f.properties || {};
            if (props.Category === "Kingpin") continue;
            if (
              selectedStates.length === 0 ||
              selectedStates.map(norm).includes(norm(props.State))
            ) {
              if (props["Long Name"]) visibleRetailers.add(props["Long Name"]);
            }
          }
          onRetailersLoaded(Array.from(visibleRetailers).sort());
        }
      });
  }, [
    geojsonPath,
    selectedStates,
    selectedRetailers,
    selectedCategories,
    selectedSuppliers,
    onRetailerSummary,
    onRetailersLoaded,
  ]);

  // ✅ Trip route with Directions API
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (tripStops.length < 2) {
      if (map.getLayer("trip-route")) {
        map.removeLayer("trip-route");
        map.removeSource("trip-route");
      }
      if (map.getLayer("trip-stops-circle")) {
        map.removeLayer("trip-stops-circle");
        map.removeSource("trip-stops");
      }
      if (map.getLayer("trip-stops-label")) {
        map.removeLayer("trip-stops-label");
      }
      return;
    }

    // ✅ Round trip: append home stop to end
    const stopsForRouting =
      tripStops.length > 2
        ? [...tripStops, tripStops[0]]
        : tripStops;

    const coordsParam = stopsForRouting.map((s) => s.coords.join(",")).join(";");
    const optimizeFlag = tripMode === "optimize" ? "&optimize=true" : "";
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsParam}?geometries=geojson${optimizeFlag}&access_token=${mapboxgl.accessToken}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (!data.routes || data.routes.length === 0) return;
        const route = data.routes[0].geometry;

        if (map.getLayer("trip-route")) {
          map.removeLayer("trip-route");
          map.removeSource("trip-route");
        }
        map.addSource("trip-route", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: route,
                properties: {},
              },
            ],
          },
        });
        map.addLayer({
          id: "trip-route",
          type: "line",
          source: "trip-route",
          paint: {
            "line-color": "#1E90FF",
            "line-width": 4,
          },
        });

        const stopsGeoJSON: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: stopsForRouting.map((s, i) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: s.coords },
            properties: { order: i + 1, label: s.label },
          })),
        };

        if (map.getLayer("trip-stops-circle")) {
          map.removeLayer("trip-stops-circle");
          map.removeLayer("trip-stops-label");
          map.removeSource("trip-stops");
        }
        map.addSource("trip-stops", { type: "geojson", data: stopsGeoJSON });

        // ✅ Blue circle with white border
        map.addLayer({
          id: "trip-stops-circle",
          type: "circle",
          source: "trip-stops",
          paint: {
            "circle-radius": 14,
            "circle-color": "#1E90FF",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 3,
          },
        });

        // ✅ White number inside
        map.addLayer({
          id: "trip-stops-label",
          type: "symbol",
          source: "trip-stops",
          layout: {
            "text-field": ["get", "order"],
            "text-size": 12,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-anchor": "center",
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#000000",
            "text-halo-width": 1,
          },
        });
      })
      .catch((err) => console.error("Directions API error:", err));
  }, [tripStops, tripMode]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
