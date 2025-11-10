"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ========================================
// 🎨 CATEGORY COLORS (high-contrast palette)
// ========================================
export const categoryColors: Record<string, { color: string; outline?: string }> = {
  Agronomy: { color: "#66B2FF" }, // light blue (adjustable later)
  "Grain/Feed": { color: "#228B22" },
  Feed: { color: "#8B4513" },
  "Office/Service": { color: "#1E90FF" },
  Distribution: { color: "#FF8C00" },
  Kingpin: { color: "#FF0000", outline: "#FFFF00" },
};

// ========================================
// ⚙️ NORMALIZATION UTILITIES
// ========================================
const norm = (v: string) => (v || "").toString().trim().toLowerCase();
const normUpper = (v: string) => (v || "").toString().trim().toUpperCase();

const normalizeCategory = (cat: string): string => {
  const c = norm(cat);
  if (["agronomy/grain", "agronomygrain"].includes(c)) return "agronomy/grain";
  if (["grain/feed", "grainfeed"].includes(c)) return "grain/feed";
  if (["office/service", "officeservice"].includes(c)) return "office/service";
  if (["distribution"].includes(c)) return "distribution";
  if (["kingpin"].includes(c)) return "kingpin";
  if (["agronomy"].includes(c)) return "agronomy";
  if (["feed"].includes(c)) return "feed";
  if (["grain"].includes(c)) return "grain";
  return c;
};

const expandCategories = (cat: string): string[] => {
  const c = normalizeCategory(cat);
  if (c === "agronomy/grain") return ["agronomy", "grain"];
  if (c === "grain/feed") return ["grain", "feed"];
  return [c];
};

const assignDisplayCategory = (cat: string): string => {
  const exp = expandCategories(cat);
  if (exp.includes("agronomy")) return "Agronomy";
  if (exp.includes("grain")) return "Grain/Feed";
  if (exp.includes("feed")) return "Feed";
  if (exp.includes("office/service")) return "Office/Service";
  if (exp.includes("distribution")) return "Distribution";
  if (exp.includes("kingpin")) return "Kingpin";
  return "Unknown";
};

// ========================================
// 🧩 SUPPLIER PARSING
// ========================================
function parseSuppliers(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") {
    if (value.trim().startsWith("[")) {
      try {
        const arr = JSON.parse(value.replace(/'/g, '"'));
        if (Array.isArray(arr)) return arr.map(String).map((s) => s.trim()).filter(Boolean);
      } catch {
        // ignore JSON fail
      }
    }
    return value.split(/[,;/|]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

// ========================================
// 📍 TYPES
// ========================================
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
  onStatesLoaded?: (states: string[]) => void;
  onRetailersLoaded?: (retailers: string[]) => void;
  onSuppliersLoaded?: (suppliers: string[]) => void;
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
}

// ========================================
// 🗺️ MAIN COMPONENT
// ========================================
export default function CertisMap({
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
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const masterFeaturesRef = useRef<any[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const geojsonPath = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/data/retailers.geojson?cacheBust=${Date.now()}`;

  // ========================================
  // 🗺️ INITIALIZE MAP + LOAD DATA
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
        const res = await fetch(geojsonPath, { cache: "no-store" });
        const data = await res.json();
        const valid = data.features.filter(
          (f: any) =>
            Array.isArray(f.geometry?.coordinates) &&
            f.geometry.coordinates.length === 2 &&
            !isNaN(f.geometry.coordinates[0]) &&
            !isNaN(f.geometry.coordinates[1])
        );

        for (const f of valid) {
          f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
        }

        masterFeaturesRef.current = valid;

        const stateSet = new Set<string>();
        const retailerSet = new Set<string>();
        const supplierSet = new Set<string>();
        for (const f of valid) {
          const p = f.properties || {};
          if (p.State) stateSet.add(p.State);
          if (p.Retailer) retailerSet.add(p.Retailer);
          parseSuppliers(p.Suppliers).forEach((s) => supplierSet.add(s));
        }

        onStatesLoaded?.(Array.from(stateSet).sort());
        onRetailersLoaded?.(Array.from(retailerSet).sort());
        onSuppliersLoaded?.(Array.from(supplierSet).sort());

        map.addSource("retailers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: valid },
        });

        // regular
        map.addLayer({
          id: "retailers-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 4,
            "circle-color": [
              "match",
              ["get", "DisplayCategory"],
              "Agronomy",
              categoryColors.Agronomy.color,
              "Grain/Feed",
              categoryColors["Grain/Feed"].color,
              "Feed",
              categoryColors.Feed.color,
              "Office/Service",
              categoryColors["Office/Service"].color,
              "Distribution",
              categoryColors.Distribution.color,
              "#1d4ed8",
            ],
          },
        });

        // kingpins
        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 5,
            "circle-color": categoryColors.Kingpin.color,
            "circle-stroke-width": 2,
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
          filter: ["==", ["get", "DisplayCategory"], "Kingpin"],
        });

        map.on("click", ["retailers-layer", "kingpins-layer"], (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties || {};
          const coords = f.geometry?.coordinates || [0, 0];
          const suppliers = parseSuppliers(p.Suppliers).join(", ") || "None listed";
          const popupHTML = `
            <div style="font-size:13px;width:360px;background:#1a1a1a;color:#f5f5f5;
                        padding:8px;border-radius:6px;">
              <strong style="font-size:14px;color:#FFD700;">${p.Retailer || "Unknown"}</strong><br/>
              <em>${p.Name || ""}</em><br/>
              ${p.Address || ""}<br/>
              ${p.City || ""}, ${p.State || ""} ${p.Zip || ""}<br/>
              <strong>Category:</strong> ${p.DisplayCategory}<br/>
              <strong>Suppliers:</strong> ${suppliers}
            </div>`;
          if (popupRef.current) popupRef.current.remove();
          const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
            .setLngLat(coords as LngLatLike)
            .setHTML(popupHTML)
            .addTo(map);
          popupRef.current = popup;
        });
      } catch (err) {
        console.error("❌ Failed to load GeoJSON", err);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded]);

  // ========================================
  // 🏠 HOME MARKER (Blue-Home icon)
  // ========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (homeMarkerRef.current) {
      homeMarkerRef.current.remove();
      homeMarkerRef.current = null;
    }
    if (
      homeCoords &&
      Array.isArray(homeCoords) &&
      !isNaN(homeCoords[0]) &&
      !isNaN(homeCoords[1])
    ) {
      const el = document.createElement("img");
      el.src = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/Blue-Home.png`;
      el.style.width = "26px";
      el.style.height = "26px";
      el.style.cursor = "default";
      homeMarkerRef.current = new mapboxgl.Marker({ element: el, draggable: false })
        .setLngLat(homeCoords as LngLatLike)
        .addTo(map);
    }
  }, [homeCoords]);

  // ========================================
  // 🔄 FILTERING (non-destructive intersection)
  // ========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !masterFeaturesRef.current.length) return;
    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!src) return;

    const selStates = selectedStates.map(normUpper);
    const selRetailers = selectedRetailers.map(normUpper);
    const selCats = selectedCategories.map(norm);
    const selSupps = selectedSuppliers.map(normUpper);

    const filtered = masterFeaturesRef.current.filter((f: any) => {
      const p = f.properties || {};
      const cat = norm(p.DisplayCategory);
      const state = normUpper(p.State);
      const retailer = normUpper(p.Retailer);
      const suppliers = parseSuppliers(p.Suppliers).map(normUpper);

      const matchState = selStates.length === 0 || selStates.includes(state);
      const matchRetailer = selRetailers.length === 0 || selRetailers.includes(retailer);
      const matchCat = selCats.length === 0 || selCats.includes(cat);
      const matchSupp =
        selSupps.length === 0 ||
        selSupps.some((s) => suppliers.includes(s));

      return matchState && matchRetailer && matchCat && matchSupp;
    });

    // fallback: prevent total wipe
    const finalData =
      filtered.length > 0
        ? filtered
        : masterFeaturesRef.current;

    src.setData({ type: "FeatureCollection", features: finalData });

    // build summary
    const summaryMap = new Map<
      string,
      { retailer: string; count: number; suppliers: Set<string>; states: Set<string>; categories: Set<string> }
    >();

    for (const f of finalData) {
      const p = f.properties || {};
      const r = p.Retailer || "Unknown";
      const s = parseSuppliers(p.Suppliers);
      const st = p.State || "";
      const c = p.DisplayCategory || "N/A";
      if (!summaryMap.has(r))
        summaryMap.set(r, {
          retailer: r,
          count: 0,
          suppliers: new Set(),
          states: new Set(),
          categories: new Set(),
        });
      const entry = summaryMap.get(r)!;
      entry.count++;
      s.forEach((x) => entry.suppliers.add(x));
      if (st) entry.states.add(st);
      entry.categories.add(c);
    }

    onRetailerSummary?.(
      Array.from(summaryMap.values()).map((v) => ({
        retailer: v.retailer,
        count: v.count,
        suppliers: Array.from(v.suppliers),
        states: Array.from(v.states),
        categories: Array.from(v.categories),
      }))
    );
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers]);

  return <div ref={mapContainer} className="w-full h-full border-t border-gray-400" />;
}
