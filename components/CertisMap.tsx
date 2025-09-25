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

// ✅ Standardized supplier names dictionary
const SUPPLIER_NAME_MAP: Record<string, string> = {
  "growmark fs": "Growmark FS",
  "chs": "CHS",
  "agtegra": "Agtegra",
  "helena agri-enterprises": "Helena Agri-Enterprises",
  "nutrien ag solutions": "Nutrien Ag Solutions",
  "bayer": "Bayer",
  "basf": "BASF",
  "corteva": "Corteva",
  "syngenta": "Syngenta",
  "certis biologicals": "Certis Biologicals",
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

export interface CertisMapProps {
  selectedCategories: string[];
  selectedStates: string[];
  selectedSuppliers: string[];
  selectedRetailers: string[];
  onStatesLoaded?: (states: string[]) => void;
  onRetailersLoaded?: (retailers: string[]) => void;
  onSuppliersLoaded?: (suppliers: string[]) => void;
  onRetailerSummary?: (
    summaries: { state: string; retailer: string; count: number; suppliers: string[]; category?: string }[]
  ) => void;
  onAddStop?: (stop: string) => void;
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
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const geojsonPath =
    process.env.NEXT_PUBLIC_GEOJSON_URL ||
    `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/retailers.geojson`;

  // ========================================
  // 🌍 Initialize Map
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

        // Extract states, retailers, suppliers
        const stateSet = new Set<string>();
        const retailerSetAll = new Set<string>();
        const retailerMap = new Map<string, Set<string>>();
        const supplierSet = new Set<string>();

        for (const feature of data.features) {
          const state = feature.properties?.State;
          const longName = feature.properties?.["Long Name"];
          const suppliersRaw = feature.properties?.Suppliers;

          if (state) stateSet.add(state as string);
          if (longName) {
            retailerSetAll.add(longName as string);
            if (state) {
              if (!retailerMap.has(state)) retailerMap.set(state, new Set());
              retailerMap.get(state)!.add(longName as string);
            }
          }

          splitAndStandardizeSuppliers(suppliersRaw).forEach((s) => supplierSet.add(s));
        }

        onStatesLoaded?.(Array.from(stateSet).sort());
        onSuppliersLoaded?.(Array.from(supplierSet).sort());

        // ✅ Retailers (Long Name)
        if (onRetailersLoaded) {
          let visibleRetailers: string[];
          if (selectedStates.length === 0) {
            visibleRetailers = Array.from(retailerSetAll).sort();
          } else {
            const norm = (val: string) => (val || "").toString().trim().toLowerCase();
            const selStatesNorm = selectedStates.map(norm);

            const subset = new Set<string>();
            for (const [state, rset] of retailerMap.entries()) {
              if (selStatesNorm.includes(norm(state))) {
                for (const r of rset) subset.add(r);
              }
            }
            visibleRetailers = Array.from(subset).sort();
          }
          onRetailersLoaded(visibleRetailers);
        }

        // Add map source + layers
        map.addSource("retailers", { type: "geojson", data });

        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 6,
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
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
          },
          filter: ["!=", ["get", "Category"], "Kingpin"],
        });

        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 8,
            "circle-color": categoryColors.Kingpin.color,
            "circle-stroke-width": 2,
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
          filter: ["==", ["get", "Category"], "Kingpin"],
        });

        // ========================================
        // 🖱️ Popups with Add-to-Trip Button
        // ========================================
        const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });

        function buildPopupHTML(props: any) {
          const longName = props["Long Name"] || props.Retailer || "Unknown";
          const siteName = props.Name || "";
          const stopLabel = siteName ? `${longName} – ${siteName}` : longName;

          const suppliers = splitAndStandardizeSuppliers(props.Suppliers).join(", ") || "N/A";
          const btnId = `add-stop-${Math.random().toString(36).slice(2)}`;

          const html = `
            <div style="font-size: 13px; background:#1a1a1a; color:#f5f5f5; padding:6px; border-radius:4px;">
              <strong>${longName}</strong><br/>
              <em>${siteName}</em><br/>
              ${props.Address || ""} ${props.City || ""} ${props.State || ""} ${props.Zip || ""}<br/>
              Suppliers: ${suppliers}<br/>
              <button id="${btnId}" style="margin-top:4px; padding:2px 6px; background:#2563eb; color:#fff; border:none; border-radius:3px; font-size:11px; cursor:pointer;">
                ➕ Add to Trip
              </button>
            </div>
          `;

          setTimeout(() => {
            const btn = document.getElementById(btnId);
            if (btn && onAddStop) {
              btn.addEventListener("click", () => onAddStop(stopLabel));
            }
          }, 0);

          return html;
        }

        function bindPopup(layerId: string) {
          map.on("mouseenter", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const geom = e.features?.[0].geometry as GeoJSON.Point;
            const coords = geom?.coordinates.slice() as [number, number];
            const props = e.features?.[0].properties;
            if (coords && props) {
              popup.setLngLat(coords).setHTML(buildPopupHTML(props)).addTo(map);
            }
          });
          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
          });
          map.on("click", layerId, (e) => {
            const geom = e.features?.[0].geometry as GeoJSON.Point;
            const coords = geom?.coordinates.slice() as [number, number];
            const props = e.features?.[0].properties;
            if (coords && props) {
              new mapboxgl.Popup()
                .setLngLat(coords)
                .setHTML(buildPopupHTML(props))
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
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, selectedStates, onAddStop]);

  // ========================================
  // 🔄 Apply filters dynamically
  // ========================================
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const source = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!source) return;

    fetch(geojsonPath)
      .then((res) => res.json())
      .then((data) => {
        const norm = (val: string) => (val || "").toString().trim().toLowerCase();

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

        // ✅ Summarize by state + retailer, include suppliers
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
            for (const s of suppliers) {
              if (s && !entry.suppliers.includes(s)) entry.suppliers.push(s);
            }
          }

          onRetailerSummary(Array.from(summaryMap.values()));
        }
      });
  }, [geojsonPath, selectedStates, selectedRetailers, selectedCategories, selectedSuppliers, onRetailerSummary]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
