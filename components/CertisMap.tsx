// components/CertisMap.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { LngLatLike, Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { withBasePath } from "@/utils/paths";

export type CertisMapProps = {
  /** "hybrid" (satellite-streets) or "street" */
  styleMode?: "hybrid" | "street";
  /** Optional supplier filter (keeps features that contain any of these) */
  selectedSuppliers?: string[];
  /** Called when user clicks a point to add to the trip */
  onAddStop?: (s: { name?: string; coord: [number, number]; [k: string]: any }) => void;
  /** Legacy click callback – kept for back-compat with older page.tsx versions */
  onPointClick?: (props: any, ll: mapboxgl.LngLat) => void;
  /** Called after data load with a tiny supplier summary */
  onDataLoaded?: (summary: any) => void;
};

type FCPoint = import("geojson").Feature<
  import("geojson").Point,
  { [k: string]: any }
>;
type FC = import("geojson").FeatureCollection<
  import("geojson").Geometry,
  { [k: string]: any }
>;

const HYBRID =
  "mapbox://styles/mapbox/satellite-streets-v12";
const STREET =
  "mapbox://styles/mapbox/streets-v12";

const MAIN_SRC = "retailers-src";
const CLUSTER_LAYER = "retailers-cluster";
const CLUSTER_COUNT = "retailers-count";
const MAIN_POINTS = "retailers-points";
const KING_SRC = "kingpins-src";
const KING_LAYER = "kingpins-points";

/** Exported constant for the legend dots in the sidebar */
export const CATEGORY_COLOR: Record<string, string> = {
  "Agronomy": "#0fd470",
  "Agronomy/Grain": "#8a3ffc",
  "Distribution": "#00bcd4",
  "Grain": "#f1c40f",
  "Grain/Feed": "#6b4f1d",
  "Office/Service": "#3b82f6",
  "Kingpin": "#ff3b30",
};

function categoryPaintExpression(): any {
  // Match (case-insensitive) on 'Type' or 'Category'
  return [
    "match",
    ["downcase", ["coalesce", ["get", "Type"], ["get", "Category"], ""]],
    "agronomy", CATEGORY_COLOR["Agronomy"],
    "agronomy/grain", CATEGORY_COLOR["Agronomy/Grain"],
    "distribution", CATEGORY_COLOR["Distribution"],
    "grain", CATEGORY_COLOR["Grain"],
    "grain/feed", CATEGORY_COLOR["Grain/Feed"],
    "office/service", CATEGORY_COLOR["Office/Service"],
    CATEGORY_COLOR["Agronomy"], // default
  ];
}

function kingpinFilter(): any {
  return [
    "any",
    ["==", ["downcase", ["coalesce", ["get", "Type"], ""]], "kingpin"],
    ["==", ["get", "isKingpin"], true],
  ];
}

function safeGet<T>(o: any, k: string, d: T): T {
  const v = o?.[k];
  return (v === undefined || v === null) ? d : v;
}

async function fetchToken(): Promise<string> {
  const env = (process as any)?.env?.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (env && String(env).trim()) return String(env).trim();
  try {
    const res = await fetch(withBasePath("/mapbox-token"), { cache: "no-store" });
    const txt = (await res.text()).trim();
    if (txt) return txt;
  } catch {}
  throw new Error("Mapbox token not found. Provide NEXT_PUBLIC_MAPBOX_TOKEN or /public/mapbox-token");
}

async function fetchFirstAvailable(): Promise<FC> {
  const paths = [
    "/data/retailers.geojson",
    "/data/retailers.json",
    "/data/main.geojson",
    "/data/main.json",
  ];
  for (const p of paths) {
    try {
      const r = await fetch(withBasePath(p), { cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      if (j && j.type === "FeatureCollection") return j as FC;
    } catch {}
  }
  return { type: "FeatureCollection", features: [] };
}

function splitByKingpin(fc: FC) {
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
    kings: { type: "FeatureCollection", features: kings } as any as FC,
  };
}

function popupHtml(p: any): string {
  const name = p?.name ?? p?.Retailer ?? p?.RetailerName ?? "Location";
  const addr = [p?.Address, p?.City, p?.State, p?.Zip].filter(Boolean).join(" · ");
  const cat = p?.Type ?? p?.Category ?? "";
  const retailerKey = String(p?.Retailer ?? p?.RetailerName ?? "").trim();
  const logoPath = retailerKey
    ? withBasePath(`/icons/${retailerKey}.png`)
    : "";
  const hasLogo = retailerKey.length > 0;

  return `
  <div style="min-width:260px;max-width:340px;font:600 13px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e6edf3">
    <div style="display:flex;gap:10px;align-items:center">
      ${hasLogo ? `<img src="${logoPath}" alt="${name}" style="width:42px;height:42px;object-fit:contain;border-radius:8px;border:1px solid #22364f;background:#0b1622;padding:4px" />` : ""}
      <div style="display:flex;flex-direction:column;gap:2px">
        <div style="font-weight:700;font-size:14px;line-height:1.2">${name}</div>
        <div style="opacity:.75;font-weight:500;text-transform:capitalize">${cat || ""}</div>
        <div style="opacity:.8;font-weight:500">${addr}</div>
      </div>
    </div>
  </div>`;
}

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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await fetchToken();
        if (cancelled) return;
        mapboxgl.accessToken = token;
        const container = containerRef.current!;
        if (!container) return;

        // Create/replace the map
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        const m = new mapboxgl.Map({
          container,
          style: styleUrl,
          center: [-96.8, 40.3],
          zoom: 3.8,
          projection: { name: "mercator" as any },
          attributionControl: false,
          pitchWithRotate: false,
          dragRotate: false,
        });
        mapRef.current = m;

        // Add a small attribution control
        m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
        m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

        const { main, kings } = splitByKingpin(await fetchFirstAvailable());

        // (Optional) Supplier summary -> page
        if (onDataLoaded) {
          const tally = Object.create(null) as Record<string, number>;
          for (const f of (main.features as any[])) {
            const key = String(f.properties?.Supplier ?? f.properties?.Suppliers ?? "").trim();
            if (!key) continue;
            tally[key] = (tally[key] ?? 0) + 1;
          }
          onDataLoaded({ total: main.features.length, bySupplier: tally });
        }

        m.once("style.load", () => {
          try {
            m.setProjection({ name: "mercator" as any });

            // SOURCES
            if (!m.getSource(MAIN_SRC)) {
              m.addSource(MAIN_SRC, {
                type: "geojson",
                data: main as any,
                cluster: true,
                clusterRadius: 45,
                clusterMaxZoom: 12,
              });
            }
            if (!m.getSource(KING_SRC)) {
              m.addSource(KING_SRC, {
                type: "geojson",
                data: kings as any,
              });
            }

            // LAYERS: clusters
            if (!m.getLayer(CLUSTER_LAYER)) {
              m.addLayer({
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
            }
            if (!m.getLayer(CLUSTER_COUNT)) {
              m.addLayer({
                id: CLUSTER_COUNT,
                type: "symbol",
                source: MAIN_SRC,
                filter: ["has", "point_count"],
                layout: {
                  "text-field": ["get", "point_count_abbreviated"],
                  "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
                  "text-size": 12,
                },
                paint: {
                  "text-color": "#09131c",
                },
              });
            }

            // LAYER: unclustered main points (category colored)
            if (!m.getLayer(MAIN_POINTS)) {
              m.addLayer({
                id: MAIN_POINTS,
                type: "circle",
                source: MAIN_SRC,
                filter: ["!", ["has", "point_count"]],
                paint: {
                  "circle-color": categoryPaintExpression(),
                  "circle-radius": 6,
                  "circle-stroke-width": 1.25,
                  "circle-stroke-color": "#0d2231",
                },
              });
            }

            // LAYER: kingpins (red dot + yellow ring), placed on top
            if (!m.getLayer(KING_LAYER)) {
              m.addLayer({
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
            }

            // CLUSTER click to zoom in
            m.on("click", CLUSTER_LAYER, (e: mapboxgl.MapLayerMouseEvent) => {
              const f = e.features?.[0];
              if (!f) return;
              const id = f.properties?.cluster_id;
              const src = m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
              if (!src || id == null) return;
              // @ts-ignore – getClusterExpansionZoom exists on GeoJSONSource at runtime
              src.getClusterExpansionZoom(id, (err: any, zoom: number) => {
                if (err) return;
                m.easeTo({ center: (f.geometry as any).coordinates as [number, number], zoom });
              });
            });

            // POINT hover popup
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
              const feats = m.queryRenderedFeatures(e.point, { layers: [KING_LAYER, MAIN_POINTS] });
              const f = feats[0] as any;
              if (!f) {
                popupRef.current?.remove();
                return;
              }
              const p = f.properties ?? {};
              const [lng, lat] = (f.geometry?.coordinates ?? []) as [number, number];
              const html = popupHtml(p);
              ensurePopup().setLngLat([lng, lat]).setHTML(html).addTo(m);
            };

            m.on("mousemove", MAIN_POINTS, showPopup);
            m.on("mousemove", KING_LAYER, showPopup);
            m.on("mouseleave", MAIN_POINTS, () => popupRef.current?.remove());
            m.on("mouseleave", KING_LAYER, () => popupRef.current?.remove());

            // POINT click to add stop
            const clickPoint = (e: mapboxgl.MapLayerMouseEvent) => {
              const f = e.features?.[0] as any;
              if (!f) return;
              const p = f.properties ?? {};
              const name = p?.name ?? p?.Retailer ?? p?.RetailerName ?? "Stop";
              const coord = (f.geometry?.coordinates ?? []) as [number, number];
              onPointClick?.(p, new mapboxgl.LngLat(coord[0], coord[1]));
              onAddStop?.({ name, coord, ...p });
            };
            m.on("click", MAIN_POINTS, clickPoint);
            m.on("click", KING_LAYER, clickPoint);

            // Apply supplier filter (runtime; re-run below when deps change)
            const applySupplierFilter = (suppliers: string[]) => {
              if (!suppliers.length) {
                // reset source data
                (m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource).setData(main as any);
                return;
              }
              const wanted = suppliers.map((s) => s.toLowerCase());
              const filtered = (main.features as any[]).filter((f) => {
                const s = String(
                  f.properties?.Supplier ?? f.properties?.Suppliers ?? ""
                ).toLowerCase();
                return wanted.some((w) => s.includes(w));
              });
              const fc: FC = { type: "FeatureCollection", features: filtered };
              (m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource).setData(fc as any);
            };
            applySupplierFilter(selectedSuppliers);

          } catch (err) {
            console.error(err);
          }
        });

      } catch (err) {
        console.error(err);
      }
    })();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  // Re-apply supplier filter when selection changes (after map exists)
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded() || !m.getSource(MAIN_SRC)) return;
    // Read current full data from the source if possible
    // We stored the original in the first effect; the simplest approach here is:
    // refetch & split, but to keep it quick we’ll query rendered + not rely on it.
    (async () => {
      try {
        const fc = await fetchFirstAvailable();
        const { main } = splitByKingpin(fc);
        const wanted = (selectedSuppliers ?? []).map((s) => s.toLowerCase());
        if (!wanted.length) {
          (m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource).setData(main as any);
          return;
        }
        const filtered = (main.features as any[]).filter((f) => {
          const s = String(
            f.properties?.Supplier ?? f.properties?.Suppliers ?? ""
          ).toLowerCase();
          return wanted.some((w) => s.includes(w));
        });
        const fcOut: FC = { type: "FeatureCollection", features: filtered };
        (m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource).setData(fcOut as any);
      } catch {}
    })();
  }, [selectedSuppliers?.join("|")]);

  return (
    <div
      ref={containerRef}
      id="certis-map"
      style={{ width: "100%", height: "70vh", minHeight: 520, borderRadius: 16 }}
    />
  );
}
