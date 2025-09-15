// components/CertisMap.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { LngLatLike, Map } from "mapbox-gl";
import { withBasePath } from "@/utils/paths";

type Stop = { id: string; name: string; lon: number; lat: number };

type SupplierSummary = {
  total: number;
  suppliers: Array<{ name: string; count: number }>;
};

type Props = {
  styleMode: "hybrid" | "street";
  selectedSuppliers: string[];                 // supplier filter from sidebar
  onAddStop?: (s: Stop) => void;
  onDataLoaded?: (summary: SupplierSummary) => void; // send supplier list up
};

const HYBRID = "mapbox://styles/mapbox/satellite-streets-v12";
const STREET = "mapbox://styles/mapbox/streets-v12";

// Color-vision–friendly palette (Okabe–Ito) + reserved Kingpin
const CATEGORY_COLORS: Record<string, string> = {
  "Agronomy": "#0072B2",        // deep blue
  "Agronomy/Grain": "#56B4E9",  // sky blue
  "Distribution": "#E69F00",    // orange
  "Grain": "#CC79A7",           // magenta
  "Grain/Feed": "#9467BD",      // violet
  "Office/Service": "#F0E442",  // yellow
  "Kingpin": "#D55E00",         // vermillion center
};

// --- Data loader: GeoJSON first, fall back to CSV/TSV, normalize fields ----
type FC = GeoJSON.FeatureCollection<GeoJSON.Point, any>;

function truthy(v: unknown): boolean {
  if (v === true) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y"].includes(s);
}

function pickProp(obj: any, keys: string[], def = ""): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return def;
}

function num(obj: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeProps(p: any) {
  const name = pickProp(p, ["Name", "Retailer", "Location", "Long Name"], "Location");
  const city = pickProp(p, ["City", "Town"], "");
  const supplier = pickProp(p, ["Supplier", "Suppliers", "Parent", "Mothership"], "");
  // Category normalization
  let category = pickProp(p, ["Category", "Type", "Location Type"], "");
  const isKingpin = truthy(p.Kingpin) || truthy(p.IsKingpin) || category.toLowerCase() === "kingpin";
  if (isKingpin) category = "Kingpin";
  return { ...p, Name: name, Retailer: name, City: city, Supplier: supplier, Category: category, KingpinFlag: isKingpin };
}

function csvToRows(text: string, delim: "," | "\t"): any[] {
  // simple CSV/TSV parser (handles quotes)
  const rows: any[] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return rows;
  const headers = splitLine(lines[0], delim);
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], delim);
    const obj: any = {};
    headers.forEach((h, idx) => (obj[h] = cols[idx] ?? ""));
    rows.push(obj);
  }
  return rows;

  function splitLine(line: string, d: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"'; i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === d && !inQ) {
        out.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }
}

async function loadRetailers(): Promise<FC> {
  // 1) GeoJSON
  try {
    const res = await fetch(withBasePath("data/retailers.geojson?ver=3"));
    if (res.ok) {
      const fc = (await res.json()) as FC;
      fc.features.forEach((f) => (f.properties = normalizeProps(f.properties || {})));
      return fc;
    }
  } catch {}

  // 2) CSV
  for (const filename of ["data/retailers.csv", "data/retailers.tsv"]) {
    try {
      const res = await fetch(withBasePath(`${filename}?ver=3`));
      if (!res.ok) continue;
      const text = await res.text();
      const delim = filename.endsWith(".tsv") ? "\t" : ",";
      const rows = csvToRows(text, delim as any);
      const feats: GeoJSON.Feature<GeoJSON.Point, any>[] = [];
      rows.forEach((r) => {
        const p = normalizeProps(r);
        const lat = num(r, ["Latitude", "Lat", "lat"]);
        const lon = num(r, ["Longitude", "Long", "Lon", "lng", "Lng"]);
        if (lat == null || lon == null) return;
        feats.push({
          type: "Feature",
          properties: p,
          geometry: { type: "Point", coordinates: [lon, lat] },
        });
      });
      return { type: "FeatureCollection", features: feats };
    } catch {}
  }

  // 3) Empty fallback
  return { type: "FeatureCollection", features: [] };
}

// Build supplier filter expression for Mapbox
function supplierFilterExpr(selected: string[]) {
  if (!selected || selected.length === 0) return true; // no filter
  return ["in", ["coalesce", ["get", "Supplier"], ""], ["literal", selected]];
}
// ---------------------------------------------------------------------------

export default function CertisMap({ styleMode, selectedSuppliers, onAddStop, onDataLoaded }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const currentSupplierFilter = useRef<string[]>([]);

  const styleURL = useMemo(() => (styleMode === "hybrid" ? HYBRID : STREET), [styleMode]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Token (env or /public/mapbox-token)
      const envToken = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN?.trim();
      let token = envToken;
      if (!token) {
        try {
          const res = await fetch(withBasePath("mapbox-token"));
          token = (await res.text()).trim();
        } catch { token = ""; }
      }
      if (!token) { console.error("Mapbox token missing."); return; }
      mapboxgl.accessToken = token;
      if (cancelled || !containerRef.current) return;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: styleURL,
        center: [-93.5, 41.7] as LngLatLike,
        zoom: 5,
        cooperativeGestures: true,
        attributionControl: true,
        pitchWithRotate: false,
        dragRotate: false,
      });
      mapRef.current = map;

      const keepMercator = () => { try { /* @ts-ignore */ map.setProjection("mercator"); } catch {} };
      map.on("load", keepMercator);
      map.on("style.load", keepMercator);

      const fc = await loadRetailers();
      if (onDataLoaded) {
        const counts = new Map<string, number>();
        for (const f of fc.features) {
          const sup = (f.properties?.Supplier || "").toString().trim();
          if (!sup) continue;
          counts.set(sup, (counts.get(sup) || 0) + 1);
        }
        const suppliers = [...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name, count}));
        onDataLoaded({ total: fc.features.length, suppliers });
      }

      map.on("load", async () => {
        // (Re)create source & layers
        const rm = (id: string) => { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); };
        ["retailers","clusters","cluster-count","retailer-points","retailer-kingpin-ring","retailer-kingpin-center"].forEach(rm);

        map.addSource("retailers", {
          type: "geojson",
          data: fc,
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 40,
          generateId: true,
        });

        // Clusters (neutral blues)
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "retailers",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": ["step", ["get", "point_count"], "#3b82f6", 10, "#2563eb", 25, "#1d4ed8"],
            "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 25, 24],
            "circle-opacity": 0.9
          }
        });

        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "retailers",
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Open Sans Semibold","Arial Unicode MS Bold"] },
          paint: { "text-color": "#ffffff" }
        });

        // Common supplier filter expression
        currentSupplierFilter.current = selectedSuppliers || [];
        const supExpr = supplierFilterExpr(currentSupplierFilter.current);

        // Non-kingpin points
        map.addLayer({
          id: "retailer-points",
          type: "circle",
          source: "retailers",
          filter: ["all",
            ["!", ["has", "point_count"]],
            ["!=", ["get", "Category"], "Kingpin"],
            ...(supExpr === true ? [] : [supExpr as any])
          ],
          paint: {
            "circle-radius": 6,
            "circle-color": [
              "case",
              ["==", ["get", "Category"], "Agronomy"], CATEGORY_COLORS["Agronomy"],
              ["==", ["get", "Category"], "Agronomy/Grain"], CATEGORY_COLORS["Agronomy/Grain"],
              ["==", ["get", "Category"], "Distribution"], CATEGORY_COLORS["Distribution"],
              ["==", ["get", "Category"], "Grain"], CATEGORY_COLORS["Grain"],
              ["==", ["get", "Category"], "Grain/Feed"], CATEGORY_COLORS["Grain/Feed"],
              ["==", ["get", "Category"], "Office/Service"], CATEGORY_COLORS["Office/Service"],
              "#9ca3af"
            ],
            "circle-stroke-width": 1.25,
            "circle-stroke-color": "#0b1220"
          }
        });

        // Kingpin RING (above clusters)
        map.addLayer({
          id: "retailer-kingpin-ring",
          type: "circle",
          source: "retailers",
          filter: ["all",
            ["!", ["has", "point_count"]],
            ["any",
              ["==", ["get", "Category"], "Kingpin"],
              ["==", ["get", "KingpinFlag"], true]
            ],
            ...(supExpr === true ? [] : [supExpr as any])
          ],
          paint: { "circle-radius": 9, "circle-color": "#0000", "circle-stroke-width": 3, "circle-stroke-color": "#F0E442" }
        });

        // Kingpin CENTER
        map.addLayer({
          id: "retailer-kingpin-center",
          type: "circle",
          source: "retailers",
          filter: ["all",
            ["!", ["has", "point_count"]],
            ["any",
              ["==", ["get", "Category"], "Kingpin"],
              ["==", ["get", "KingpinFlag"], true]
            ],
            ...(supExpr === true ? [] : [supExpr as any])
          ],
          paint: { "circle-radius": 6, "circle-color": CATEGORY_COLORS["Kingpin"], "circle-stroke-width": 1.25, "circle-stroke-color": "#0b1220" }
        });

        // Cluster expand
        map.on("click", "clusters", (e) => {
          const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
          const id = f?.properties?.cluster_id;
          if (id == null) return;
          (map.getSource("retailers") as mapboxgl.GeoJSONSource).getClusterExpansionZoom(id, (err, zoom) => {
            if (err) return;
            map.easeTo({ center: (f.geometry as any).coordinates as LngLatLike, zoom });
          });
        });
        map.on("mousemove", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));

        // Hover popup
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });

        const hoverLayers = ["retailer-points","retailer-kingpin-ring","retailer-kingpin-center"];
        hoverLayers.forEach((ly) => {
          map.on("mousemove", ly, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const f = e.features?.[0]; if (!f) return;
            const p = f.properties || {};
            const name = p["Name"] || p["Retailer"] || "Location";
            const city = p["City"] || "";
            const cat = p["Category"] || (p["KingpinFlag"] ? "Kingpin" : "");
            const logoKey = (p["Retailer"] || p["Name"] || "").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-");
            const iconUrl = withBasePath(`icons/${logoKey}.png?ver=3`);
            const html = `
              <div style="display:flex;gap:8px;align-items:center">
                <img src="${iconUrl}" alt="" width="28" height="28" onerror="this.style.display='none'"/>
                <div style="line-height:1.2">
                  <div style="font-weight:600">${name}</div>
                  <div style="font-size:12px;opacity:0.8">${city} · ${cat}</div>
                  <div style="font-size:11px;opacity:0.7">Click to add to Trip</div>
                </div>
              </div>
            `;
            popupRef.current!.setLngLat((f.geometry as any).coordinates as [number, number]).setHTML(html).addTo(map);
          });
          map.on("mouseleave", ly, () => { map.getCanvas().style.cursor = ""; popupRef.current?.remove(); });
          map.on("click", ly, (e) => {
            const f = e.features?.[0]; if (!f || !onAddStop) return;
            const p = f.properties || {};
            const name = (p["Name"] || p["Retailer"] || "Location").toString();
            const [lon, lat] = (f.geometry as any).coordinates as [number, number];
            onAddStop({ id: `${name}-${lon.toFixed(5)}-${lat.toFixed(5)}`, name, lon, lat });
          });
        });
      });
    }

    init();

    return () => {
      popupRef.current?.remove();
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [styleURL, onAddStop, onDataLoaded]);

  // React to supplier filter changes from the sidebar
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    currentSupplierFilter.current = selectedSuppliers || [];
    const supExpr: any = supplierFilterExpr(currentSupplierFilter.current);
    const baseNonCluster = ["all", ["!", ["has", "point_count"]]] as any;

    const nonKingpin = ["!=", ["get", "Category"], "Kingpin"] as any;
    const kingpinExpr = ["any", ["==", ["get", "Category"], "Kingpin"], ["==", ["get", "KingpinFlag"], true]] as any;

    // Update filters on layers
    map.setFilter("retailer-points", supExpr === true ? ["all", baseNonCluster, nonKingpin] : ["all", baseNonCluster, nonKingpin, supExpr]);
    map.setFilter("retailer-kingpin-ring", supExpr === true ? ["all", baseNonCluster, kingpinExpr] : ["all", baseNonCluster, kingpinExpr, supExpr]);
    map.setFilter("retailer-kingpin-center", supExpr === true ? ["all", baseNonCluster, kingpinExpr] : ["all", baseNonCluster, kingpinExpr, supExpr]);
  }, [selectedSuppliers]);

  return <div ref={containerRef} className="map-container" aria-label="Certis Retailer Map (Mercator)" />;
}
