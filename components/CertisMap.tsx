"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { withBasePath } from "@/utils/paths";

// -----------------------
// Public API (props)
// -----------------------
export type CertisMapProps = {
  /** "hybrid" (default) or "street" */
  styleMode?: "hybrid" | "street";
  /** Keep features that contain ANY of these supplier strings (case-insensitive) */
  selectedSuppliers?: string[];
  /** Called when user clicks a point to add it as a stop */
  onAddStop?: (s: { name?: string; coord: [number, number]; [k: string]: any }) => void;
  /** (Legacy) also call the old signature if the page wired it */
  onPointClick?: (props: any, ll: mapboxgl.LngLat) => void;
  /** Let the page know basic supplier counts after data loads */
  onDataLoaded?: (summary: { total: number; bySupplier: Record<string, number> }) => void;
};

// -----------------------
// Constants
// -----------------------
const HYBRID = "mapbox://styles/mapbox/satellite-streets-v12";
const STREET = "mapbox://styles/mapbox/streets-v12";

const MAIN_SRC = "retailers-src";
const KING_SRC = "kingpins-src";
const CLUSTER_LAYER = "retailers-cluster";
const CLUSTER_COUNT = "retailers-count";
const MAIN_POINTS = "retailers-points";
const KING_LAYER = "kingpins-points";

// Exported so the sidebar legend can use the same colors
export const CATEGORY_COLOR: Record<string, string> = {
  "Agronomy": "#0fd470",
  "Agronomy/Grain": "#8a3ffc",
  "Distribution": "#00bcd4",
  "Grain": "#f1c40f",
  "Grain/Feed": "#6b4f1d",
  "Office/Service": "#3b82f6",
  "Kingpin": "#ff3b30",
};

// -----------------------
// Small helpers
// -----------------------
type FC = import("geojson").FeatureCollection<
  import("geojson").Geometry,
  { [k: string]: any }
>;
type FCPoint = import("geojson").Feature<import("geojson").Point, { [k: string]: any }>;

function categoryExpression(): any {
  // Match (case-insensitive) on Type or Category; default green
  return [
    "match",
    ["downcase", ["coalesce", ["get", "Type"], ["get", "Category"], ""]],
    "agronomy", CATEGORY_COLOR["Agronomy"],
    "agronomy/grain", CATEGORY_COLOR["Agronomy/Grain"],
    "distribution", CATEGORY_COLOR["Distribution"],
    "grain", CATEGORY_COLOR["Grain"],
    "grain/feed", CATEGORY_COLOR["Grain/Feed"],
    "office/service", CATEGORY_COLOR["Office/Service"],
    CATEGORY_COLOR["Agronomy"],
  ];
}

function kingpinFilter(): any {
  return [
    "any",
    ["==", ["downcase", ["coalesce", ["get", "Type"], ""]], "kingpin"],
    ["==", ["get", "isKingpin"], true],
  ];
}

async function readToken(): Promise<string> {
  const envVal = (process as any)?.env?.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (envVal && String(envVal).trim()) return String(envVal).trim();
  try {
    const res = await fetch(withBasePath("/mapbox-token"), { cache: "no-store" });
    const txt = (await res.text()).trim();
    if (txt) return txt;
  } catch {}
  throw new Error("Mapbox token not found. Provide NEXT_PUBLIC_MAPBOX_TOKEN or /public/mapbox-token.");
}

async function fetchDataset(): Promise<FC> {
  const candidates = [
    "/data/retailers.geojson",
    "/data/retailers.json",
    "/data/main.geojson",
    "/data/main.json",
  ];
  for (const p of candidates) {
    try {
      const r = await fetch(withBasePath(p), { cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      if (j?.type === "FeatureCollection") return j as FC;
    } catch {}
  }
  return { type: "FeatureCollection", features: [] };
}

function splitKingpins(fc: FC) {
  const main: FCPoint[] = [];
  const kings: FCPoint[] = [];
  for (const f of fc.features as any[]) {
    if (f.geometry?.type !== "Point") continue;
    const p = f.properties ?? {};
    const isKP =
      String(p.Type ?? "").toLowerCase() === "kingpin" ||
      p.isKingpin === true;
    (isKP ? kings : main).push(f as FCPoint);
  }
  return {
    main: { type: "FeatureCollection", features: main } as any as FC,
    king: { type: "FeatureCollection", features: kings } as any as FC,
  };
}

function popupHtml(p: any): string {
  const name = p?.name ?? p?.Retailer ?? p?.RetailerName ?? "Location";
  const addr = [p?.Address, p?.City, p?.State, p?.Zip].filter(Boolean).join(" · ");
  const cat = p?.Type ?? p?.Category ?? "";
  const retailerKey = String(p?.Retailer ?? p?.RetailerName ?? "").trim();
  const logoPath = retailerKey ? withBasePath(`/icons/${retailerKey}.png`) : "";

  return `
  <div style="min-width:260px;max-width:340px;font:600 13px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e6edf3">
    <div style="display:flex;gap:10px;align-items:center">
      ${retailerKey ? `<img src="${logoPath}" alt="${name}" style="width:42px;height:42px;object-fit:contain;border-radius:8px;border:1px solid #22364f;background:#0b1622;padding:4px" />` : ""}
      <div style="display:flex;flex-direction:column;gap:2px">
        <div style="font-weight:700;font-size:14px;line-height:1.2">${name}</div>
        <div style="opacity:.75;font-weight:500;text-transform:capitalize">${cat || ""}</div>
        <div style="opacity:.8;font-weight:500">${addr}</div>
      </div>
    </div>
  </div>`;
}

// -----------------------
// Component
// -----------------------
export default function CertisMap({
  styleMode = "hybrid",
  selectedSuppliers = [],
  onAddStop,
  onPointClick,
  onDataLoaded,
}: CertisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const styleUrl = useMemo(() => (styleMode === "street" ? STREET : HYBRID), [styleMode]);

  // Create map + sources + layers
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await readToken();
        if (cancelled) return;
        mapboxgl.accessToken = token;

        // fresh map each time style changes (keeps it simple & stable)
        mapRef.current?.remove();
        mapRef.current = null;

        const container = containerRef.current;
        if (!container) return;
        const map = new mapboxgl.Map({
          container,
          style: styleUrl,
          center: [-96.8, 40.3],
          zoom: 3.8,
          projection: { name: "mercator" as any },
          attributionControl: false,
          pitchWithRotate: false,
          dragRotate: false,
        });
        mapRef.current = map;

        map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

        const fc = await fetchDataset();
        const { main, king } = splitKingpins(fc);

        // supplier summary
        if (onDataLoaded) {
          const tally: Record<string, number> = {};
          for (const f of main.features as any[]) {
            const k = String(f.properties?.Supplier ?? f.properties?.Suppliers ?? "").trim();
            if (!k) continue;
            tally[k] = (tally[k] ?? 0) + 1;
          }
          onDataLoaded({ total: (main.features as any[]).length, bySupplier: tally });
        }

        map.once("style.load", () => {
          try {
            map.setProjection({ name: "mercator" as any });

            // SOURCES
            if (!map.getSource(MAIN_SRC)) {
              map.addSource(MAIN_SRC, {
                type: "geojson",
                data: main as any,
                cluster: true,
                clusterRadius: 45,
                clusterMaxZoom: 12,
              });
            }
            if (!map.getSource(KING_SRC)) {
              map.addSource(KING_SRC, {
                type: "geojson",
                data: king as any,
              });
            }

            // LAYERS: clusters
            map.addLayer({
              id: CLUSTER_LAYER,
              type: "circle",
              source: MAIN_SRC,
              filter: ["has", "point_count"],
              paint: {
                "circle-color": "#37c9a1",
                "circle-stroke-color": "#0d2231",
                "circle-stroke-width": 1.5,
                "circle-radius": [
                  "step",
                  ["get", "point_count"],
                  16, 25, 20, 50, 26, 100, 32,
                ],
              },
            });
            map.addLayer({
              id: CLUSTER_COUNT,
              type: "symbol",
              source: MAIN_SRC,
              filter: ["has", "point_count"],
              layout: {
                "text-field": ["get", "point_count_abbreviated"],
                "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
                "text-size": 12,
              },
              paint: { "text-color": "#09131c" },
            });

            // LAYER: unclustered main points (category colored)
            map.addLayer({
              id: MAIN_POINTS,
              type: "circle",
              source: MAIN_SRC,
              filter: ["!", ["has", "point_count"]],
              paint: {
                "circle-color": categoryExpression(),
                "circle-radius": 6,
                "circle-stroke-width": 1.25,
                "circle-stroke-color": "#0d2231",
              },
            });

            // LAYER: KINGPINS (top)
            map.addLayer({
              id: KING_LAYER,
              type: "circle",
              source: KING_SRC,
              filter: kingpinFilter(),
              paint: {
                "circle-color": CATEGORY_COLOR["Kingpin"],
                "circle-radius": 7,
                "circle-stroke-width": 3,
                "circle-stroke-color": "#ffd84d",
              },
            });

            // cluster click => zoom
            map.on("click", CLUSTER_LAYER, (e: mapboxgl.MapLayerMouseEvent) => {
              const f = e.features?.[0];
              if (!f) return;
              const id = (f.properties as any)?.cluster_id;
              const src = map.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
              if (!src || id == null) return;
              // @ts-ignore exists at runtime
              src.getClusterExpansionZoom(id, (err: any, zoom: number) => {
                if (err) return;
                map.easeTo({
                  center: (f.geometry as any).coordinates as [number, number],
                  zoom,
                });
              });
            });

            // hover -> popup
            const ensurePopup = () => {
              if (!popupRef.current) {
                popupRef.current = new mapboxgl.Popup({
                  closeButton: false,
                  closeOnClick: false,
                  maxWidth: "360px",
                  className: "certis-popup",
                });
              }
              return popupRef.current!;
            };

            const showPopup = (e: mapboxgl.MapMouseEvent) => {
              const feats = map.queryRenderedFeatures(e.point, { layers: [KING_LAYER, MAIN_POINTS] });
              const f = feats[0] as any;
              if (!f) {
                popupRef.current?.remove();
                return;
              }
              const p = f.properties ?? {};
              const [lng, lat] = (f.geometry?.coordinates ?? []) as [number, number];
              ensurePopup().setLngLat([lng, lat]).setHTML(popupHtml(p)).addTo(map);
            };

            map.on("mousemove", MAIN_POINTS, showPopup);
            map.on("mousemove", KING_LAYER, showPopup);
            map.on("mouseleave", MAIN_POINTS, () => popupRef.current?.remove());
            map.on("mouseleave", KING_LAYER, () => popupRef.current?.remove());
            map.on("mouseenter", MAIN_POINTS, () => (map.getCanvas().style.cursor = "pointer"));
            map.on("mouseleave", MAIN_POINTS, () => (map.getCanvas().style.cursor = ""));
            map.on("mouseenter", KING_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
            map.on("mouseleave", KING_LAYER, () => (map.getCanvas().style.cursor = ""));

            // click -> add stop (and legacy callback)
            const clickPoint = (e: mapboxgl.MapLayerMouseEvent) => {
              const f = e.features?.[0] as any;
              if (!f) return;
              const p = f.properties ?? {};
              const name = p?.name ?? p?.Retailer ?? p?.RetailerName ?? "Stop";
              const coord = (f.geometry?.coordinates ?? []) as [number, number];
              onPointClick?.(p, new mapboxgl.LngLat(coord[0], coord[1]));
              onAddStop?.({ name, coord, ...p });
            };
            map.on("click", MAIN_POINTS, clickPoint);
            map.on("click", KING_LAYER, clickPoint);

            // initial supplier filter
            applySupplierFilter(map, MAIN_SRC, main, selectedSuppliers);
          } catch (err) {
            console.error(err);
          }
        });
      } catch (err) {
        console.error(err);
      }
    })();

    return () => {
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  // reapply supplier filter when props change
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    (async () => {
      try {
        const fc = await fetchDataset();
        const { main } = splitKingpins(fc);
        applySupplierFilter(m, MAIN_SRC, main, selectedSuppliers);
      } catch {}
    })();
  }, [selectedSuppliers?.join("|")]);

  return (
    <div
      ref={containerRef}
      id="certis-map"
      style={{ width: "100%", height: "calc(100vh - 140px)", minHeight: 540, borderRadius: 16 }}
    />
  );
}

// -----------------------
// Filtering util
// -----------------------
function applySupplierFilter(
  map: mapboxgl.Map,
  srcId: string,
  fullMain: FC,
  selected: string[]
) {
  const src = map.getSource(srcId) as mapboxgl.GeoJSONSource | undefined;
  if (!src) return;

  if (!selected?.length) {
    src.setData(fullMain as any);
    return;
  }
  const wanted = selected.map((s) => s.toLowerCase());
  const filtered = (fullMain.features as any[]).filter((f) => {
    const s = String(f.properties?.Supplier ?? f.properties?.Suppliers ?? "").toLowerCase();
    return wanted.some((w) => s.includes(w));
  });
  const out: FC = { type: "FeatureCollection", features: filtered };
  src.setData(out as any);
}
