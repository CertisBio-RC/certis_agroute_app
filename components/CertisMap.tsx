// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ========================================
// CATEGORY COLORS
// ========================================
export const categoryColors: Record<string, { color: string; outline?: string }> = {
  Agronomy: { color: "#FFD700", outline: "#fff" },        // yellow
  "Grain/Feed": { color: "#228B22", outline: "#fff" },    // green
  Feed: { color: "#8B4513", outline: "#fff" },            // brown
  "Office/Service": { color: "#1E90FF", outline: "#fff" },// blue
  Distribution: { color: "#FF8C00", outline: "#fff" },    // orange
  Kingpin: { color: "#FF0000", outline: "#FFFF00" },      // red w/ yellow border
};

// ========================================
// CATEGORY NORMALIZATION
// ========================================
const normalizeCategory = (cat: string) => {
  switch ((cat || "").trim().toLowerCase()) {
    case "agronomy": return "agronomy";
    case "grain/feed":
    case "grainfeed": return "grainfeed";
    case "grain": return "grain";
    case "feed": return "feed";
    case "agronomy/grain": return "agronomy/grain";
    case "office/service":
    case "officeservice": return "officeservice";
    case "distribution": return "distribution";
    case "kingpin": return "kingpin";
    default: return (cat || "").trim().toLowerCase();
  }
};

const expandCategories = (cat: string): string[] => {
  const norm = normalizeCategory(cat);
  if (norm === "agronomy/grain") return ["agronomy", "grain"];
  if (norm === "grainfeed") return ["grain", "feed"];
  return [norm];
};

const assignDisplayCategory = (cat: string): string => {
  const expanded = expandCategories(cat);
  if (expanded.includes("agronomy")) return "Agronomy";
  if (expanded.includes("grain")) return "Grain/Feed";
  if (expanded.includes("feed")) return "Feed";
  if (expanded.includes("officeservice")) return "Office/Service";
  if (expanded.includes("distribution")) return "Distribution";
  if (expanded.includes("kingpin")) return "Kingpin";
  return "Unknown";
};

const norm = (val: string) => (val || "").toString().trim().toLowerCase();

// ========================================
// SUPPLIER NORMALIZATION
// ========================================
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

// ========================================
// STOP + PROPS
// ========================================
export interface Stop {
  label: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
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
      retailer: string;
      count: number;
      suppliers: string[];
      categories: string[];
      states: string[];
    }[]
  ) => void;
  onAddStop?: (stop: Stop) => void;
  onRemoveStop?: (index: number) => void;
  tripStops?: Stop[];
  tripMode?: "entered" | "optimize";
}

// ========================================
// MAIN MAP COMPONENT
// ========================================
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
  onRemoveStop,
  tripStops = [],
  tripMode = "entered",
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const geojsonPath = `${
    process.env.NEXT_PUBLIC_BASE_PATH || ""
  }/data/retailers.geojson?cacheBust=${Date.now()}`;

  // ========================================
  // INITIAL MAP + DATA LOAD
  // ========================================
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

        for (const feature of data.features) {
          feature.properties.DisplayCategory = assignDisplayCategory(
            feature.properties?.Category || ""
          );
        }

        const stateSet = new Set<string>();
        const retailerSetAll = new Set<string>();
        const supplierSet = new Set<string>();

        for (const feature of data.features) {
          const props = feature.properties;
          if (props?.State) stateSet.add(props.State);
          if (props?.Retailer) retailerSetAll.add(props.Retailer);
          splitAndStandardizeSuppliers(props?.Suppliers).forEach((s) =>
            supplierSet.add(s)
          );
        }

        onStatesLoaded?.(Array.from(stateSet).sort());
        onSuppliersLoaded?.(Array.from(supplierSet).sort());
        onRetailersLoaded?.(Array.from(retailerSetAll).sort());

        map.addSource("retailers", { type: "geojson", data });

        // non-Kingpins
        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 4,
            "circle-color": [
              "match",
              ["get", "DisplayCategory"],
              "Agronomy", categoryColors.Agronomy.color,
              "Grain/Feed", categoryColors["Grain/Feed"].color,
              "Feed", categoryColors.Feed.color,
              "Office/Service", categoryColors["Office/Service"].color,
              "Distribution", categoryColors.Distribution.color,
              "#1d4ed8",
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
          filter: ["!=", ["get", "DisplayCategory"], "Kingpin"],
        });

        // Kingpins with white halo
        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 7,
            "circle-color": categoryColors.Kingpin.color,
            "circle-stroke-width": 3,
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
          filter: ["==", ["get", "DisplayCategory"], "Kingpin"],
        });

        // popups
        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          maxWidth: "none",
        });

        const buildPopupHTML = (props: any, coords: [number, number]) => {
          const retailer = props.Retailer || "Unknown";
          const siteName = props.Name || "";
          const category = props.DisplayCategory || "N/A";
          const stopLabel = siteName ? `${retailer} – ${siteName}` : retailer;
          const suppliers =
            splitAndStandardizeSuppliers(props.Suppliers).join(", ") || "N/A";
          const btnId = `add-stop-${Math.random().toString(36).slice(2)}`;
          const addressLine = `${props.Address || ""}, ${props.City || ""}, ${
            props.State || ""
          } ${props.Zip || ""}`;

          const html = `
            <div style="font-size:13px;width:360px;background:#1a1a1a;color:#f5f5f5;
                        padding:6px;border-radius:4px;position:relative;">
              <button id="${btnId}"
                style="position:absolute;top:4px;right:4px;padding:2px 6px;
                       background:#166534;color:#fff;border:none;border-radius:3px;
                       font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;font-weight:600;">
                <span style="background:#fff;color:#166534;border-radius:50%;width:14px;height:14px;
                             display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;">
                  +
                </span>
                Add to Trip
              </button>
              <strong>${retailer}</strong><br/>
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
                  city: props.City || "",
                  state: props.State || "",
                  zip: props.Zip || "",
                  coords,
                });
            }
          }, 0);

          return html;
        };

        const bindPopup = (layerId: string) => {
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
        };

        bindPopup("retailers-layer");
        bindPopup("kingpins-layer");

        // diagnostic totals
        console.log("✅ Total locations:", data.features.length);
        console.log(
          "✅ Filtered Kingpins:",
          data.features.filter(
            (f: any) => norm(f.properties?.DisplayCategory) === "kingpin"
          ).length
        );
      } catch (err) {
        console.error("Failed to load GeoJSON", err);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onAddStop]);

  // ========================================
  // DYNAMIC FILTERING + SUMMARY
  // ========================================
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const source = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!source) return;

    fetch(geojsonPath)
      .then((res) => res.json())
      .then((data) => {
        for (const f of data.features) {
          f.properties.DisplayCategory = assignDisplayCategory(
            f.properties?.Category || ""
          );
        }

        const filtered = {
          type: "FeatureCollection" as const,
          features: data.features.filter((f: any) => {
            const props = f.properties || {};
            if (norm(props.DisplayCategory) === "kingpin") return true;

            const stateMatch =
              selectedStates.length === 0 ||
              selectedStates.map(norm).includes(norm(props.State));
            const retailerMatch =
              selectedRetailers.length === 0 ||
              selectedRetailers.map(norm).includes(norm(props.Retailer));
            const categoryMatch =
              selectedCategories.length === 0 ||
              selectedCategories.map(norm).includes(norm(props.DisplayCategory));
            const supplierList = splitAndStandardizeSuppliers(props.Suppliers).map(norm);
            const supplierMatch =
              selectedSuppliers.length === 0 ||
              selectedSuppliers.map(norm).some((s) => supplierList.includes(s));

            return stateMatch && retailerMatch && categoryMatch && supplierMatch;
          }),
        };

        console.log(
          "✅ Filtered Kingpins count:",
          filtered.features.filter(
            (f: any) => norm(f.properties?.DisplayCategory) === "kingpin"
          ).length
        );

        source.setData(filtered);

        if (onRetailerSummary) {
          const summaryMap = new Map<
            string,
            { retailer: string; count: number; suppliers: string[]; categories: string[]; states: string[] }
          >();
          for (const f of filtered.features) {
            const props = f.properties || {};
            if (norm(props.DisplayCategory) === "kingpin") continue;

            const state = props.State || "Unknown";
            const retailer = props.Retailer || "Unknown";
            const suppliers = splitAndStandardizeSuppliers(props.Suppliers);
            const categories = expandCategories(props.Category || "");

            if (!summaryMap.has(retailer)) {
              summaryMap.set(retailer, { retailer, count: 0, suppliers: [], categories: [], states: [] });
            }
            const entry = summaryMap.get(retailer)!;
            entry.count += 1;
            if (state && !entry.states.includes(state)) entry.states.push(state);
            suppliers.forEach((s) => { if (s && !entry.suppliers.includes(s)) entry.suppliers.push(s); });
            categories.forEach((c) => { if (c && !entry.categories.includes(c)) entry.categories.push(c); });
          }
          onRetailerSummary(Array.from(summaryMap.values()));
        }
      })
      .catch((err) => console.error("Filter update error:", err));
  }, [geojsonPath, selectedStates, selectedRetailers, selectedCategories, selectedSuppliers, onRetailerSummary]);

  // ========================================
  // TRIP ROUTE LOGIC
  // ========================================
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (tripStops.length < 2) {
      ["trip-route", "trip-stops-circle", "trip-stops-label"].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id === "trip-route" ? "trip-route" : "trip-stops")) {
          map.removeSource(id === "trip-route" ? "trip-route" : "trip-stops");
        }
      });
      return;
    }

    const home = tripStops[0];
    const middle = tripStops.slice(1);
    const coordsParam = [home, ...middle, home].map((s) => s.coords.join(",")).join(";");

    const url =
      tripMode === "optimize"
        ? `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordsParam}?geometries=geojson&roundtrip=true&source=first&destination=last&access_token=${mapboxgl.accessToken}`
        : `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsParam}?geometries=geojson&access_token=${mapboxgl.accessToken}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        const route = tripMode === "optimize" ? data.trips?.[0]?.geometry : data.routes?.[0]?.geometry;
        if (!route) return;

        if (map.getLayer("trip-route")) {
          map.removeLayer("trip-route");
          map.removeSource("trip-route");
        }
        map.addSource("trip-route", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: route, properties: {} }],
          },
        });
        map.addLayer({
          id: "trip-route",
          type: "line",
          source: "trip-route",
          paint: { "line-color": "#1E90FF", "line-width": 4 },
        });

        let orderedStops = [home, ...middle, home];
        if (tripMode === "optimize" && data.waypoints) {
          const sorted = [...data.waypoints].sort((a: any, b: any) => a.wayGot it — the file you just posted matches your previous B.7 baseline, and the next phase (C.1) requires exactly the additions we discussed: extending the `Stop` interface, adding `city/state/zip` handling, pointer cursor, and diagnostic logs.  

✅ I’ve now reviewed everything line by line and will regenerate **`components/CertisMap.tsx`** as a **complete, self-contained file** with:  
- Fixed type definition (`Stop` extended)  
- Correct `onAddStop()` parameter population  
- Diagnostic total/Kingpin logs  
- Retained map + popup logic  
- Explicit pointer cursor  
- White halo retained for Kingpins  
- No path/name changes  

If you confirm, I’ll output the **final full file (Phase C.1)** ready to paste and build — and include your PowerShell deploy block underneath.  

Proceed with regeneration?
