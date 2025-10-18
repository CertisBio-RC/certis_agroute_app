// components/CertisMap.tsx  — Part 1 of 2
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app";

// ✅ Category colors
export const categoryColors: Record<string, { color: string; outline?: string }> = {
  Agronomy: { color: "#FFD700", outline: "#000" },
  "Grain/Feed": { color: "#228B22", outline: "#000" },
  Feed: { color: "#8B4513", outline: "#000" },
  "Office/Service": { color: "#1E90FF", outline: "#000" },
  Distribution: { color: "#FF8C00", outline: "#000" },
  Kingpin: { color: "#FF0000", outline: "#FFFF00" }, // heavy yellow outline below
};

// ✅ Normalize helpers
const normalizeCategory = (cat: string) => {
  switch ((cat || "").trim().toLowerCase()) {
    case "agronomy":
      return "agronomy";
    case "grain/feed":
    case "grainfeed":
      return "grainfeed";
    case "feed":
      return "feed";
    case "agronomy/grain":
    case "agronomy hybrid":
      return "agronomy/grain"; // treat Agronomy Hybrid as Agronomy/Grain
    case "office/service":
    case "officeservice":
      return "officeservice";
    case "distribution":
      return "distribution";
    case "kingpin":
      return "kingpin";
    default:
      return (cat || "").trim().toLowerCase();
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

const norm = (v: string) => (v || "").toString().trim().toLowerCase();

// ✅ Supplier normalization
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
function splitAndStandardizeSuppliers(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(standardizeSupplier);
}

// ✅ Stop & Props
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
  onStatesLoaded?: (s: string[]) => void;
  onRetailersLoaded?: (r: string[]) => void;
  onSuppliersLoaded?: (s: string[]) => void;
  onRetailerSummary?: (
    summaries: {
      retailer: string;
      count: number;
      suppliers: string[];
      categories: string[];
      states: string[];
    }[]
  ) => void;
  onAddStop?: (s: Stop) => void;
  onRemoveStop?: (i: number) => void;
  tripStops?: Stop[];
  tripMode?: "entered" | "optimize";
  onOptimizedRoute?: (stops: Stop[]) => void;
}

// ✅ Component
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
  onOptimizedRoute,
}: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const geoDataRef = useRef<any>(null);

  const geojsonPath = `${basePath}/data/retailers.geojson`;

  // ✅ Initialize Map & Load Data
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
        const res = await fetch(geojsonPath);
        if (!res.ok) throw new Error(`GeoJSON fetch failed: ${res.status}`);
        const data = await res.json();
        geoDataRef.current = data;

        // Normalize categories
        for (const f of data.features)
          f.properties.DisplayCategory = assignDisplayCategory(f.properties?.Category || "");

        // Load unique lists
        const stateSet = new Set<string>();
        const retailerSet = new Set<string>();
        const supplierSet = new Set<string>();
        for (const f of data.features) {
          const p = f.properties;
          if (p.State) stateSet.add(p.State);
          if (p.Retailer) retailerSet.add(p.Retailer);
          splitAndStandardizeSuppliers(p.Suppliers).forEach((s) => supplierSet.add(s));
        }
        onStatesLoaded?.([...stateSet].sort());
        onRetailersLoaded?.([...retailerSet].sort());
        onSuppliersLoaded?.([...supplierSet].sort());

        map.addSource("retailers", { type: "geojson", data });

        // ✅ Non-Kingpin points
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
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
          filter: ["!=", ["get", "DisplayCategory"], "Kingpin"],
        });

        // ✅ Kingpins (heavier outline)
        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 8,
            "circle-color": categoryColors.Kingpin.color,
            "circle-stroke-width": 4, // thicker yellow outline
            "circle-stroke-color": categoryColors.Kingpin.outline!,
          },
          filter: ["==", ["get", "DisplayCategory"], "Kingpin"],
        });

        // (continued in Part 2 → popup, filtering, trip rendering, etc.)
      } catch (err) {
        console.error("❌ Failed to load GeoJSON", err);
      }
    });
  }, [geojsonPath, onStatesLoaded, onRetailersLoaded, onSuppliersLoaded, onAddStop]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
// components/CertisMap.tsx  — Part 2 of 2
  // ✅ Real-time filtering logic (Kingpin-only → Agronomy defaults → optional categories)
  useEffect(() => {
    if (!mapRef.current || !geoDataRef.current) return;
    const map = mapRef.current;
    const source = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!source) return;

    const data = geoDataRef.current;

    const filtered = {
      type: "FeatureCollection" as const,
      features: data.features.filter((f: any) => {
        const p = f.properties || {};
        const displayCat = assignDisplayCategory(p.Category || "");
        if (displayCat === "Kingpin") return true;

        // --- Core filter logic ---
        const stateMatch =
          !selectedStates.length ||
          selectedStates.map(norm).includes(norm(p.State));

        const retailerMatch =
          !selectedRetailers.length ||
          selectedRetailers.map(norm).includes(norm(p.Retailer));

        // ✅ Default: show Agronomy + Agronomy/Grain when retailer selected
        let categoryMatch = false;
        const isDefaultAg = ["Agronomy", "Agronomy/Grain"].includes(displayCat);

        if (selectedRetailers.length > 0) {
          if (isDefaultAg) categoryMatch = true;
          if (selectedCategories.length > 0) {
            const cats = selectedCategories.map((c) =>
              c.toLowerCase().replace(/\s+/g, "")
            );
            categoryMatch =
              categoryMatch || cats.includes(norm(displayCat).replace(/\//g, ""));
          }
        } else {
          // If no retailer selected, only Kingpins visible
          categoryMatch = false;
        }

        const supplierList = splitAndStandardizeSuppliers(p.Suppliers).map(norm);
        const supplierMatch =
          !selectedSuppliers.length ||
          selectedSuppliers.map(norm).some((s) => supplierList.includes(s));

        return stateMatch && retailerMatch && categoryMatch && supplierMatch;
      }),
    };

    source.setData(filtered);

    // ✅ Retailer Summary update
    if (onRetailerSummary) {
      const mapSum = new Map<
        string,
        { retailer: string; count: number; suppliers: string[]; categories: string[]; states: string[] }
      >();
      for (const f of filtered.features) {
        const p = f.properties || {};
        if (p.DisplayCategory === "Kingpin") continue;
        const st = p.State || "Unknown";
        const r = p.Retailer || "Unknown";
        const supps = splitAndStandardizeSuppliers(p.Suppliers);
        const cats = expandCategories(p.Category || "");
        if (!mapSum.has(r))
          mapSum.set(r, { retailer: r, count: 0, suppliers: [], categories: [], states: [] });
        const e = mapSum.get(r)!;
        e.count++;
        if (!e.states.includes(st)) e.states.push(st);
        supps.forEach((s) => !e.suppliers.includes(s) && e.suppliers.push(s));
        cats.forEach((c) => !e.categories.includes(c) && e.categories.push(c));
      }
      onRetailerSummary([...mapSum.values()]);
    }
  }, [selectedStates, selectedRetailers, selectedCategories, selectedSuppliers, onRetailerSummary]);

  // ✅ Popup builder
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: "none",
    });

    function buildPopupHTML(p: any, coords: [number, number]) {
      const retailer = p.Retailer || "Unknown";
      const site = p.Name || "";
      const cat = p.DisplayCategory || "N/A";
      const label = site ? `${retailer} – ${site}` : retailer;
      const supps = splitAndStandardizeSuppliers(p.Suppliers).join(", ") || "N/A";
      const btnId = `add-stop-${Math.random().toString(36).slice(2)}`;

      const html = `
        <div style="font-size:13px;width:360px;background:#1a1a1a;color:#f5f5f5;
                    padding:6px;border-radius:4px;position:relative;">
          <button id="${btnId}"
            style="position:absolute;top:4px;right:4px;padding:2px 6px;
                   background:#166534;color:#fff;border:none;border-radius:3px;
                   font-size:11px;cursor:pointer;font-weight:600;">
            + Add to Trip
          </button>
          <strong>${retailer}</strong><br/>
          <em>${site}</em><br/>
          ${p.Address || ""}<br/>
          ${p.City || ""} ${p.State || ""} ${p.Zip || ""}<br/>
          <strong>Category:</strong> ${cat}<br/>
          Suppliers: ${supps}
        </div>`;
      setTimeout(() => {
        const b = document.getElementById(btnId);
        if (b && onAddStop)
          b.onclick = () =>
            onAddStop({
              label,
              address: p.Address || "",
              city: p.City || "",
              state: p.State || "",
              zip: p.Zip || "",
              coords,
            });
      }, 0);
      return html;
    }

    const bind = (id: string) => {
      map.on("mouseenter", id, (e) => {
        map.getCanvas().style.cursor = "pointer";
        const c = (e.features?.[0].geometry as GeoJSON.Point)
          ?.coordinates.slice() as [number, number];
        const p = e.features?.[0].properties;
        if (c && p) popup.setLngLat(c).setHTML(buildPopupHTML(p, c)).addTo(map);
      });
      map.on("mouseleave", id, () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("click", id, (e) => {
        const c = (e.features?.[0].geometry as GeoJSON.Point)
          ?.coordinates.slice() as [number, number];
        const p = e.features?.[0].properties;
        if (c && p)
          new mapboxgl.Popup({ maxWidth: "none" })
            .setLngLat(c)
            .setHTML(buildPopupHTML(p, c))
            .addTo(map);
      });
    };
    bind("retailers-layer");
    bind("kingpins-layer");
  }, [onAddStop]);

  // ✅ Trip rendering
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (tripStops.length < 2) {
      ["trip-route", "trip-stops-circle", "trip-stops-label"].forEach((l) => {
        if (map.getLayer(l)) map.removeLayer(l);
        if (map.getSource(l)) map.removeSource(l);
      });
      return;
    }

    const coordsParam = tripStops.map((s) => s.coords.join(",")).join(";");
    const url =
      tripMode === "optimize"
        ? `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordsParam}?geometries=geojson&roundtrip=false&source=first&destination=last&access_token=${mapboxgl.accessToken}`
        : `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsParam}?geometries=geojson&access_token=${mapboxgl.accessToken}`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const geom =
          tripMode === "optimize" ? data.trips?.[0]?.geometry : data.routes?.[0]?.geometry;
        if (!geom) return;

        if (map.getLayer("trip-route")) {
          map.removeLayer("trip-route");
          map.removeSource("trip-route");
        }

        map.addSource("trip-route", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: geom, properties: {} }],
          },
        });
        map.addLayer({
          id: "trip-route",
          type: "line",
          source: "trip-route",
          paint: { "line-color": "#1E90FF", "line-width": 4 },
        });

        let ordered = [...tripStops];
        if (tripMode === "optimize" && data.waypoints) {
          const sorted = [...data.waypoints].sort(
            (a: any, b: any) => a.waypoint_index - b.waypoint_index
          );
          ordered = sorted.map((wp: any) => {
            const [lng, lat] = wp.location;
            return (
              tripStops.find((s) => s.coords[0] === lng && s.coords[1] === lat) || {
                label: wp.name || "Stop",
                address: "",
                coords: [lng, lat] as [number, number],
              }
            );
          });
        }
        onOptimizedRoute?.(ordered);

        const stopsGeo: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: ordered.map((s, i) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: s.coords },
            properties: { order: i + 1, label: s.label },
          })),
        };
        ["trip-stops-circle", "trip-stops-label"].forEach((l) => {
          if (map.getLayer(l)) map.removeLayer(l);
        });
        if (map.getSource("trip-stops")) map.removeSource("trip-stops");
        map.addSource("trip-stops", { type: "geojson", data: stopsGeo });
        map.addLayer({
          id: "trip-stops-circle",
          type: "circle",
          source: "trip-stops",
          paint: {
            "circle-radius": 14,
            "circle-color": "#1E90FF",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 3,
          },
        });
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
            "text-color": "#fff",
            "text-halo-color": "#000",
            "text-halo-width": 1,
          },
        });
      })
      .catch((err) => console.error("Directions/Optimization API error:", err));
  }, [tripStops, tripMode, onOptimizedRoute]);

  // ✅ Render Map Container
  return <div ref={mapContainer} className="w-full h-full" />;
}
// === END OF FILE ===

