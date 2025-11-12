// ================================================================
// 💠 CERTIS AGROUTE "GOLD FINAL+" — PHASE A.26
//   • TRUE intersection filtering (State ∩ Retailer ∩ Category ∩ Supplier)
//   • NON-DESTRUCTIVE KINGPIN OVERLAY (ignores Category filter)
//   • Retailer LIST always based on same filtered features
//   • Route line restored (tripStops → visible blue route)
//   • Pointer cursor restored (no crosshair on hover)
// ================================================================

"use client";
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
  Kingpin: { color: "#E10600", outline: "#FFD60A" }, // <- overlay pin
};

// ================================================================
// 🧭 HELPERS
// ================================================================
const norm = (v: any) => (v ?? "").toString().trim().toLowerCase();

function assignDisplayCategory(cat: string): string {
  const c = norm(cat);
  if (["agronomy", "ag retail", "retail", "agronomy/grain", "agronomy grain"].includes(c))
    return "Agronomy";
  if (c.includes("grain") || c.includes("feed")) return "Grain/Feed";
  if (c.includes("office")) return "Office/Service";
  if (c.includes("distribution")) return "Distribution";
  if (c.includes("kingpin")) return "Kingpin";
  return "Agronomy";
}

function parseSuppliers(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") {
    if (v.startsWith("[")) {
      try {
        const arr = JSON.parse(v.replace(/'/g, '"'));
        if (Array.isArray(arr)) return arr.map((x) => String(x).trim());
      } catch {}
    }
    return v.split(/[,;/|]+/).map((x) => x.trim()).filter(Boolean);
  }
  if (typeof v === "object")
    return Object.values(v).map((x: any) => String(x).trim()).filter(Boolean);
  return [];
}

const cleanAddress = (addr: string): string =>
  addr.replace(/\(.*?\)/g, "").replace(/\bP\.?O\.?\s*Box\b.*$/i, "").trim();

// ================================================================
// 📍 TYPES
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
    summaries: {
      retailer: string;
      count: number;
      suppliers: string[];
      states: string[];
      categories: string[];
    }[]
  ) => void;
  onAddStop?: (stop: Stop) => void;
  tripStops?: Stop[];
  tripMode?: "entered" | "optimize";
  onOptimizedRoute?: (stops: Stop[]) => void;
}

// ================================================================
// 🗺️ MAIN COMPONENT
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
    tripMode,
    onOptimizedRoute,
  } = props;

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const masterFeatures = useRef<any[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const homeMarker = useRef<mapboxgl.Marker | null>(null);

  const geojsonPath = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/data/retailers.geojson`;

  // ================================================================
  // 🗺️ LOAD MAP + GEOJSON
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

    map.on("load", async () => {
      const data = await fetch(geojsonPath).then((r) => r.json());

      const valid = data.features.filter((f: any) => {
        const c = f.geometry?.coordinates;
        return Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]);
      });

      for (const f of valid) {
        f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
      }

      masterFeatures.current = valid;

      const states = new Set<string>();
      const retailers = new Set<string>();
      const suppliers = new Set<string>();

      valid.forEach((f) => {
        const p = f.properties;
        if (p.State) states.add(p.State.trim());
        if (p.Retailer) retailers.add(p.Retailer.trim());
        parseSuppliers(p.Suppliers).forEach((s) => suppliers.add(s));
      });

      onStatesLoaded?.([...states].sort());
      onRetailersLoaded?.([...retailers].sort());
      onSuppliersLoaded?.([...suppliers].sort());

      map.addSource("retailers", {
        type: "geojson",
        data: { type: "FeatureCollection", features: valid },
      });

      map.addLayer({
        id: "retailers-layer",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 4.8,
          "circle-color": [
            "match",
            ["get", "DisplayCategory"],
            "Kingpin", categoryColors.Kingpin.color,
            "Agronomy", categoryColors.Agronomy.color,
            "Grain/Feed", categoryColors["Grain/Feed"].color,
            "Office/Service", categoryColors["Office/Service"].color,
            "Distribution", categoryColors.Distribution.color,
            "#4CB5FF",
          ],
          "circle-stroke-width": ["case", ["==", ["get", "DisplayCategory"], "Kingpin"], 2, 0.6],
          "circle-stroke-color": ["case", ["==", ["get", "DisplayCategory"], "Kingpin"], categoryColors.Kingpin.outline!, "#000000"],
        },
      });

      // ✅ pointer cursor
      map.getCanvas().style.cursor = "grab";
      map.on("mouseenter", "retailers-layer", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "retailers-layer", () => {
        map.getCanvas().style.cursor = "grab";
      });

      // ✅ popup with Add-to-Trip preserved
      map.on("click", "retailers-layer", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        const coords = f.geometry.coordinates.slice(0, 2);
        const suppliers = parseSuppliers(p.Suppliers).join(", ") || "None listed";

        const html = `
          <div style="font-size:13px;width:360px;background:#1a1a1a;color:#f5f5f5;
                      padding:8px;border-radius:6px;position:relative;">
            <button id="add-${Math.random().toString(36).slice(2)}"
              style="position:absolute;top:6px;right:6px;padding:3px 6px;
              background:#166534;color:#fff;border:none;border-radius:4px;
              font-size:11px;cursor:pointer;font-weight:600;">+ Add to Trip</button>
            <div style="line-height:1.3em;margin-top:6px;">
              <strong style="font-size:14px;color:#FFD700;">${p.Retailer}</strong><br/>
              <em>${p.Name}</em><br/>
              ${cleanAddress(p.Address)}<br/>
              ${p.City} ${p.State} ${p.Zip}<br/>
              <strong>Category:</strong> ${p.DisplayCategory}<br/>
              <strong>Suppliers:</strong> ${suppliers}
            </div>
          </div>
        `;

        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: true }).setLngLat(coords).setHTML(html).addTo(map);

        const btn = popupRef.current.getElement().querySelector("button[id^='add-']");
        btn?.addEventListener("click", () =>
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
  }, [geojsonPath]);

  // ================================================================
  // 🏠 HOME MARKER
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
  // 🔄 TRUE INTERSECTION FILTER
  // ================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || masterFeatures.current.length === 0) return;
    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!src) return;

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

      // ✅ KINGPIN PROTECTED: ignore Category filter
      const ctMatch =
        category === "kingpin" ||
        selectedCategories.length === 0 ||
        selectedCategories.includes(category);

      return stMatch && rtMatch && ctMatch && spMatch;
    });

    src.setData({ type: "FeatureCollection", features: filtered });

    // ✅ update Retailer Summary (left-side tiles)
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
  // 🛣️ ROUTE OPTIMIZATION — draws line
  // ================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tripStops?.length) return;

    const coords = tripStops.map((s) => s.coords);
    const geojson = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
    };

    if (!map.getSource("route")) {
      map.addSource("route", { type: "geojson", data: geojson });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        paint: {
          "line-color": "#00B7FF",
          "line-width": 4,
        },
      });
    } else {
      (map.getSource("route") as mapboxgl.GeoJSONSource).setData(geojson);
    }
  }, [tripStops]);

  return <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />;
}
