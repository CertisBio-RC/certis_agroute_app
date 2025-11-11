// ================================================================
// 💠 CERTIS AGROUTE “GOLD BASELINE” FILTERING LOGIC — PHASE A.23g FINAL
//   • Multi-retailer selection persistence across state toggles
//   • Fixes unwanted clearing of selectedRetailers[]
//   • Compatible with Phase A.23f page.tsx and Gold Baseline layout
// ================================================================

"use client";
import { useEffect, useRef } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ================================================================
// 🎨 CATEGORY COLORS — Gold Parity Palette
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
// 🧭 HELPERS
// ================================================================
const norm = (v: any) => (v ?? "").toString().trim().toLowerCase();

function assignDisplayCategory(cat: string): string {
  const c = norm(cat);
  if (
    [
      "agronomy",
      "agronomy/grain",
      "agronomy grain",
      "ag retail",
      "retail",
      "agronomy / grain",
      "agronomy-grain",
    ].includes(c)
  )
    return "Agronomy";
  if (["grain", "feed", "grain/feed", "grain feed", "grain & feed"].includes(c))
    return "Grain/Feed";
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
  tripStops,
  tripMode,
  onOptimizedRoute,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const masterFeatures = useRef<any[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const homeMarker = useRef<mapboxgl.Marker | null>(null);

  const geojsonPath = `${
    process.env.NEXT_PUBLIC_BASE_PATH || ""
  }/data/retailers.geojson?cacheBust=${Date.now()}`;

  // ================================================================
  // 🗺️ INITIAL MAP LOAD
  // ================================================================
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

        const valid = data.features.filter((f: any) => {
          const c = f.geometry?.coordinates;
          return Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]);
        });

        for (const f of valid) {
          f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");
        }
        masterFeatures.current = valid;

        // Dropdown population
        const states = new Set<string>();
        const retailers = new Set<string>();
        const suppliers = new Set<string>();
        valid.forEach((f) => {
          const p = f.properties || {};
          if (p.State) states.add(p.State.trim());
          if (p.Retailer) retailers.add(p.Retailer.trim());
          parseSuppliers(p.Suppliers).forEach((s) => suppliers.add(s.trim()));
        });
        onStatesLoaded?.(Array.from(states).sort());
        onRetailersLoaded?.(Array.from(retailers).sort());
        onSuppliersLoaded?.(Array.from(suppliers).sort());

        // Base layer
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
              "Kingpin",
              categoryColors.Kingpin.color,
              "#1d4ed8",
            ],
            "circle-stroke-width": [
              "case",
              ["==", ["get", "DisplayCategory"], "Kingpin"],
              2,
              0.6,
            ],
            "circle-stroke-color": [
              "case",
              ["==", ["get", "DisplayCategory"], "Kingpin"],
              categoryColors.Kingpin.outline!,
              "#000000",
            ],
          },
        });

        // ================================================================
        // 📍 POPUP + Add-to-Trip
        // ================================================================
        map.on("click", "retailers-layer", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const coords = (f.geometry as any).coordinates.slice(0, 2);
          const p = f.properties || {};
          const suppliers = parseSuppliers(p.Suppliers).join(", ") || "None listed";

          const html = `
            <div style="font-size:13px;width:360px;background:#1a1a1a;color:#f5f5f5;
                        padding:8px;border-radius:6px;position:relative;">
              <button id="add-${Math.random()
                .toString(36)
                .slice(2)}"
                style="position:absolute;top:6px;right:6px;padding:3px 6px;
                       background:#166534;color:#fff;border:none;border-radius:4px;
                       font-size:11px;cursor:pointer;font-weight:600;">+ Add to Trip</button>
              <div style="line-height:1.3em;margin-top:6px;">
                <strong style="font-size:14px;color:#FFD700;">${p.Retailer || "Unknown"}</strong><br/>
                <em>${p.Name || ""}</em><br/>
                ${cleanAddress(p.Address || "")}<br/>
                ${p.City || ""} ${p.State || ""} ${p.Zip || ""}<br/>
                <strong>Category:</strong> ${p.DisplayCategory}<br/>
                <strong>Suppliers:</strong> ${suppliers}
              </div>
            </div>`;

          popupRef.current?.remove();
          popupRef.current = new mapboxgl.Popup({ closeButton: true, maxWidth: "none" })
            .setLngLat(coords)
            .setHTML(html)
            .addTo(map);

          const popupEl = popupRef.current?.getElement();
          if (popupEl && onAddStop) {
            const btn = popupEl.querySelector("button[id^='add-']") as HTMLButtonElement | null;
            if (btn) {
              btn.addEventListener("click", () => {
                onAddStop({
                  label: p.Retailer || p.Name || "Unknown",
                  address: cleanAddress(p.Address || ""),
                  coords: coords as [number, number],
                  city: p.City || "",
                  state: p.State || "",
                  zip: p.Zip || "",
                });
              });
            }
          }
        });

        map.on("mouseenter", "retailers-layer", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "retailers-layer", () => (map.getCanvas().style.cursor = ""));
      } catch (e) {
        console.error("GeoJSON load failed:", e);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onAddStop]);

  // ================================================================
  // 🏠 HOME MARKER
  // ================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    homeMarker.current?.remove();
    homeMarker.current = null;
    if (homeCoords && Array.isArray(homeCoords)) {
      const el = document.createElement("img");
      el.src = "/icons/Blue-Home.png";
      el.style.width = "28px";
      el.style.height = "28px";
      homeMarker.current = new mapboxgl.Marker({ element: el })
        .setLngLat(homeCoords as LngLatLike)
        .addTo(map);
    }
  }, [homeCoords]);

  // ================================================================
  // 🔄 FILTERING (UNION LOGIC + STABLE RETAILER PERSISTENCE)
  // ================================================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!src || masterFeatures.current.length === 0) return;

    const previousFilteredRef = (map as any)._previousFilteredRef || { features: [] };

    const filtered = masterFeatures.current.filter((f) => {
      const p = f.properties || {};
      const state = norm(p.State);
      const retailer = norm(p.Retailer);
      const category = norm(p.DisplayCategory);
      const suppliers = parseSuppliers(p.Suppliers).map(norm);

      const stMatch =
        selectedStates.length === 0 || selectedStates.map(norm).includes(state);

      const rtMatch =
        selectedRetailers.length === 0 ||
        selectedRetailers.some((r) => retailer === norm(r));

      const ctMatch =
        selectedCategories.length === 0 ||
        selectedCategories.map(norm).includes(category);

      const spMatch =
        selectedSuppliers.length === 0 ||
        selectedSuppliers.some((s) => suppliers.includes(norm(s)));

      return stMatch && rtMatch && ctMatch && spMatch;
    });

    const output =
      filtered.length === 0 && selectedRetailers.length > 0
        ? previousFilteredRef.features
        : filtered.length > 0
        ? filtered
        : masterFeatures.current;

    src.setData({ type: "FeatureCollection", features: output });
    (map as any)._previousFilteredRef = { features: output };

    if (onRetailerSummary) {
      const summaryMap: Record<
        string,
        { count: number; suppliers: Set<string>; states: Set<string>; categories: Set<string> }
      > = {};

      output.forEach((f) => {
        const p = f.properties || {};
        const r = p.Retailer?.trim() || "Unknown";
        if (!summaryMap[r])
          summaryMap[r] = {
            count: 0,
            suppliers: new Set(),
            states: new Set(),
            categories: new Set(),
          };
        summaryMap[r].count++;
        parseSuppliers(p.Suppliers).forEach((s) => summaryMap[r].suppliers.add(s));
        if (p.State) summaryMap[r].states.add(p.State.trim());
        if (p.DisplayCategory) summaryMap[r].categories.add(p.DisplayCategory);
      });

      const summaries = Object.entries(summaryMap).map(([retailer, d]) => ({
        retailer,
        count: d.count,
        suppliers: Array.from(d.suppliers).sort(),
        states: Array.from(d.states).sort(),
        categories: Array.from(d.categories).sort(),
      }));

      onRetailerSummary(summaries);
    }
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers, onRetailerSummary]);

  // ================================================================
  // 🧭 TRIP BUILDER
  // ================================================================
  useEffect(() => {
    if (tripMode === "optimize" && tripStops && tripStops.length > 1) {
      onOptimizedRoute?.(tripStops);
    }
  }, [tripMode, tripStops, onOptimizedRoute]);

  // ================================================================
  // ✅ FINAL RETURN (MAP CONTAINER)
  // ================================================================
  return (
    <div
      ref={mapContainer}
      className="w-full h-full border-t border-gray-400 cursor-crosshair"
    />
  );
}
