"use client";

// ================================================================
// 💠 CERTIS AGROUTE "GOLD BASELINE A.28"
//   • TRUE INTERSECTION FILTERING (State ∩ Retailer ∩ Supplier ∩ Category)
//   • NON-DESTRUCTIVE KINGPIN OVERLAY (always visible + clickable)
//   • ZIP→Home + Add-To-Trip preserved
//   • ✅ ROUTE LINE ALWAYS DRAWS (fixes race-condition with map load)
// ================================================================

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ================================================================
// 🎨 CATEGORY COLORS
// ================================================================
export const categoryColors: Record<string, { color: string; outline?: string }> = {
  Agronomy: { color: "#4CB5FF" },
  "Grain/Feed": { color: "#FFD60A" },
  Feed: { color: "#F2B705" },
  "Office/Service": { color: "#FFFFFF" },
  Distribution: { color: "#9E9E9E" },
  Kingpin: { color: "#E10600", outline: "#FFD60A" },
};

// ================================================================
// HELPERS
// ================================================================
const norm = (v: any) => (v ?? "").toString().trim().toLowerCase();

function assignDisplayCategory(cat: string): string {
  const c = norm(cat);
  if (["agronomy", "retail", "ag retail", "agronomy/grain"].includes(c)) return "Agronomy";
  if (c.includes("grain") || c.includes("feed")) return "Grain/Feed";
  if (c.includes("office")) return "Office/Service";
  if (c.includes("distribution")) return "Distribution";
  if (c.includes("kingpin")) return "Kingpin";
  return "Agronomy";
}

function parseSuppliers(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return v
    .toString()
    .split(/[,;/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const cleanAddress = (addr: string) =>
  addr.replace(/\(.*?\)/g, "").replace(/\bP\.?O\.?\s*Box\b.*$/i, "").trim();

// ================================================================
// TYPES
// ================================================================
export interface Stop {
  label: string;
  address: string;
  coords: [number, number];
  city?: string;
  state?: string;
  zip?: string | number;
}

export interface CertisMapProps {
  selectedCategories: string[];
  selectedStates: string[];
  selectedSuppliers: string[];
  selectedRetailers: string[];
  homeCoords?: [number, number];
  onStatesLoaded?: (s: string[]) => void;
  onRetailersLoaded?: (r: string[]) => void;
  onSuppliersLoaded?: (s: string[]) => void;
  onRetailerSummary?: (
    summaries: { retailer: string; count: number; suppliers: string[]; states: string[]; categories: string[] }[]
  ) => void;
  onAddStop?: (stop: Stop) => void;
  tripStops?: Stop[];
  tripMode?: "entered" | "optimize";
}

// ================================================================
// COMPONENT
// ================================================================
export default function CertisMap(props: CertisMapProps) {
  const {
    selectedCategories,
    selectedStates,
    selectedSuppliers,
    selectedRetailers,
    homeCoords,
    onStatesLoaded,
    onRetailersLoaded,
    onSuppliersLoaded,
    onRetailerSummary,
    onAddStop,
    tripStops,
  } = props;

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const homeMarker = useRef<mapboxgl.Marker | null>(null);
  const masterFeatures = useRef<any[]>([]);

  const geojsonPath = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/data/retailers.geojson`;

  // ================================================================
  // INIT MAP + LOAD GEOJSON
  // ================================================================
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-96.25, 41.25],
      zoom: 4,
      projection: "mercator",
    });

    mapRef.current = map;
    map.getCanvas().style.cursor = "grab";

    map.on("load", async () => {
      const data = await fetch(`${geojsonPath}?cache=${Date.now()}`).then((r) => r.json());
      const valid = data.features.filter(
        (f: any) =>
          Array.isArray(f.geometry?.coordinates) &&
          !isNaN(f.geometry.coordinates[0]) &&
          !isNaN(f.geometry.coordinates[1])
      );

      valid.forEach((f: any) => {
        f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
      });

      masterFeatures.current = valid;

      // Populate left-side tiles
      onStatesLoaded?.([...new Set(valid.map((f: any) => f.properties.State))].sort());
      onRetailersLoaded?.([...new Set(valid.map((f: any) => f.properties.Retailer))].sort());
      onSuppliersLoaded?.([
        ...new Set(valid.flatMap((f: any) => parseSuppliers(f.properties.Suppliers))),
      ].sort());

      // Base layer (non-Kingpins)
      map.addSource("retailers", {
        type: "geojson",
        data: { type: "FeatureCollection", features: valid },
      });

      map.addLayer({
        id: "retailers-layer",
        type: "circle",
        source: "retailers",
        filter: ["!=", ["get", "DisplayCategory"], "Kingpin"],
        paint: {
          "circle-radius": 4.8,
          "circle-color": [
            "match",
            ["coalesce", ["get", "DisplayCategory"], ""],
            "Agronomy", categoryColors.Agronomy.color,
            "Grain/Feed", categoryColors["Grain/Feed"].color,
            "Office/Service", categoryColors["Office/Service"].color,
            "Distribution", categoryColors.Distribution.color,
            "#4CB5FF",
          ],
          "circle-stroke-width": 0.8,
          "circle-stroke-color": "#1a1a1a",
        },
      });

      // 🔥 Kingpin overlay — ALWAYS visible
      map.addLayer({
        id: "kingpins-layer",
        type: "circle",
        source: "retailers",
        filter: ["==", ["get", "DisplayCategory"], "Kingpin"],
        paint: {
          "circle-radius": 7,
          "circle-color": categoryColors.Kingpin.color,
          "circle-stroke-color": categoryColors.Kingpin.outline!,
          "circle-stroke-width": 2.2,
        },
      });

      // POPUPS (both layers)
      ["kingpins-layer", "retailers-layer"].forEach((layer) => {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = "grab"));

        map.on("click", layer, (e) => {
          const f: any = e.features?.[0];
          if (!f) return;

          const p = f.properties;
          const coords = (f.geometry as any).coordinates.slice(0, 2);
          const suppliers = parseSuppliers(p.Suppliers).join(", ") || "None listed";

          const html = `
            <div style="font-size:13px;width:360px;background:#1a1a1a;color:#f5f5f5;
                        padding:8px;border-radius:6px;position:relative;">
              <button id="btn-${Math.random().toString(36).slice(2)}"
                style="position:absolute;top:6px;right:6px;padding:3px 6px;
                background:#166534;color:#fff;border:none;border-radius:4px;
                font-size:11px;cursor:pointer;">+ Add to Trip</button>
              <strong style="font-size:14px;color:#FFD700;">${p.Retailer}</strong><br/>
              <em>${p.Name || ""}</em><br/>
              ${cleanAddress(p.Address)}<br/>
              ${p.City} ${p.State} ${p.Zip}<br/>
              <strong>Category:</strong> ${p.DisplayCategory}<br/>
              <strong>Suppliers:</strong> ${suppliers}
            </div>`;

          popupRef.current?.remove();
          popupRef.current = new mapboxgl.Popup({ closeButton: true })
            .setLngLat(coords)
            .setHTML(html)
            .addTo(map);

          popupRef.current
            .getElement()
            ?.querySelector("button")
            ?.addEventListener("click", () =>
              onAddStop?.({
                label: p.Retailer,
                address: cleanAddress(p.Address),
                coords,
                city: p.City,
                state: p.State,
                zip: p.Zip,
              })
            );
        });
      });
    });
  }, []);

  // ================================================================
  // APPLY FILTERING (KINGPINS ALWAYS INCLUDED)
  // ================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("retailers")) return;

    const filtered = masterFeatures.current.filter((f) => {
      const p = f.properties;
      const state = norm(p.State);
      const retailer = norm(p.Retailer);
      const category = norm(p.DisplayCategory);
      const suppliers = parseSuppliers(p.Suppliers).map(norm);

      const stMatch = selectedStates.length === 0 || selectedStates.includes(state);
      const rtMatch = selectedRetailers.length === 0 || selectedRetailers.includes(retailer);
      const spMatch =
        selectedSuppliers.length === 0 ||
        selectedSuppliers.some((s) => suppliers.includes(norm(s)));

      const ctMatch =
        category === "kingpin" ||
        selectedCategories.length === 0 ||
        selectedCategories.includes(category);

      return stMatch && rtMatch && spMatch && ctMatch;
    });

    (map.getSource("retailers") as mapboxgl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: filtered,
    });

    onRetailerSummary?.(
      Object.values(
        filtered.reduce((acc: any, f: any) => {
          const p = f.properties;
          const r = p.Retailer;
          if (!acc[r]) acc[r] = { retailer: r, count: 0, suppliers: new Set(), states: new Set(), categories: new Set() };
          acc[r].count++;
          parseSuppliers(p.Suppliers).forEach((s) => acc[r].suppliers.add(s));
          acc[r].states.add(p.State);
          acc[r].categories.add(p.DisplayCategory);
          return acc;
        }, {})
      ).map((x: any) => ({
        retailer: x.retailer,
        count: x.count,
        suppliers: [...x.suppliers].sort(),
        states: [...x.states].sort(),
        categories: [...x.categories].sort(),
      }))
    );
  }, [selectedStates, selectedRetailers, selectedSuppliers, selectedCategories]);

  // ================================================================
  // HOME MARKER (unchanged)
  // ================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !homeCoords) return;

    homeMarker.current?.remove();

    const el = document.createElement("div");
    el.style.backgroundImage = `url(${process.env.NEXT_PUBLIC_BASE_PATH}/icons/Blue_Home.png)`;
    el.style.backgroundSize = "contain";
    el.style.width = "30px";
    el.style.height = "30px";

    homeMarker.current = new mapboxgl.Marker({ element: el }).setLngLat(homeCoords).addTo(map);
  }, [homeCoords]);

  // ================================================================
  // ✅ FIXED: ROUTE LINE ALWAYS ADDS AFTER MAP LOAD
  // ================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tripStops || tripStops.length < 2) return;

    const coords = tripStops.map((s) => s.coords);

    const drawLine = () => {
      const geojson = { type: "Feature", geometry: { type: "LineString", coordinates: coords } };

      if (!map.getSource("route")) {
        map.addSource("route", { type: "geojson", data: geojson });

        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          paint: { "line-color": "#00B7FF", "line-width": 4 },
        });
      } else {
        (map.getSource("route") as mapboxgl.GeoJSONSource).setData(geojson);
      }
    };

    if (!map.isStyleLoaded()) {
      map.once("idle", drawLine);
    } else {
      drawLine();
    }
  }, [tripStops]);

  return <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />;
}
