"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { Map as MapboxMap, LngLatLike, MapMouseEvent } from "mapbox-gl";
import type { FeatureCollection, Geometry, Point } from "geojson";
import { withBasePath } from "@/utils/paths";

type SupplierPointProps = {
  name?: string;
  supplier?: string;
  category?: string;
  [k: string]: any;
};

export type StopLike = { name?: string; coord: [number, number] };

export type CertisMapProps = {
  /** "hybrid" (satellite-streets) or "street" */
  styleMode: "hybrid" | "street";
  /** Called when user clicks an unclustered point */
  onAddStop?: (s: StopLike) => void;
  /** Notify parent with supplier list/count for the left panel */
  onDataLoaded?: (summary: { total: number; suppliers: string[] }) => void;
};

const STYLE_HYBRID = "mapbox://styles/mapbox/satellite-streets-v12";
const STYLE_STREET = "mapbox://styles/mapbox/streets-v12";

const SOURCE_ID = "suppliers";
const CLUSTER_LAYER = "suppliers-clusters";
const CLUSTER_COUNT = "suppliers-count";
const POINT_LAYER = "suppliers-points";

/** static color map per location category (kept simple, can be expanded later) */
const CATEGORY_COLOR_MAP: Record<string, string> = {
  Agronomy: "#22c55e",
  "Agronomy/Grain": "#a855f7",
  Distribution: "#06b6d4",
  Grain: "#f59e0b",
  "Grain/Feed": "#7c3a00",
  Kingpin: "#ef4444",
  "Office/Service": "#60a5fa",
};

function colorExpression() {
  // Mapbox v3 needs a valid expression, not a function call at runtime
  const pairs: (string | any[])[] = [];
  Object.entries(CATEGORY_COLOR_MAP).forEach(([k, v]) => {
    pairs.push(k, v);
  });
  // ["match", ["get", "category"], "Agronomy","#22c55e", ... , defaultColor]
  return ["match", ["get", "category"], ...pairs, "#38bdf8"] as any;
}

async function fetchToken(): Promise<string | null> {
  try {
    const res = await fetch(withBasePath("/mapbox-token"), { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

async function fetchSuppliers(): Promise<FeatureCollection<Point, SupplierPointProps> | null> {
  // Try retailers first, then main. Both are optional; we degrade gracefully.
  const tries = ["/data/retailers.geojson", "/data/main.geojson"];
  for (const p of tries) {
    try {
      const res = await fetch(withBasePath(p), { cache: "no-store" });
      if (!res.ok) continue;
      const json = (await res.json()) as FeatureCollection<Geometry, any>;
      // Coerce any geometry to Point-only collection (skip non-points)
      const pts = (json.features || []).filter((f) => f.geometry?.type === "Point") as any[];
      return { type: "FeatureCollection", features: pts as any };
    } catch {
      /* continue */
    }
  }
  return null;
}

export default function CertisMap({ styleMode, onAddStop, onDataLoaded }: CertisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const styleUrl = useMemo(() => (styleMode === "street" ? STYLE_STREET : STYLE_HYBRID), [styleMode]);

  // Init once
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadErr(null);

      const token = await fetchToken();
      if (!token) {
        setLoadErr("Map token not found. Make sure /mapbox-token is published.");
        return;
      }
      mapboxgl.accessToken = token;

      // Create map
      const map = new mapboxgl.Map({
        container: containerRef.current as HTMLElement,
        style: styleUrl,
        projection: { name: "mercator" as any }, // lock mercator forever
        center: [-94, 41], // midwest
        zoom: 3.7,
        pitchWithRotate: false,
        dragRotate: false,
        attributionControl: true,
      });
      mapRef.current = map;

      map.once("style.load", async () => {
        try {
          map.setProjection({ name: "mercator" as any });

          // Load data
          const fc = await fetchSuppliers();
          if (!fc || !fc.features?.length) {
            setLoadErr("No supplier data found under /data. (retailers.geojson or main.geojson)");
            onDataLoaded?.({ total: 0, suppliers: [] });
            return;
          }

          // Source with clustering
          if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
          map.addSource(SOURCE_ID, {
            type: "geojson",
            data: fc,
            cluster: true,
            clusterMaxZoom: 12,
            clusterRadius: 50,
          });

          // Cluster bubbles
          map.addLayer({
            id: CLUSTER_LAYER,
            type: "circle",
            source: SOURCE_ID,
            filter: ["has", "point_count"],
            paint: {
              "circle-color": ["interpolate", ["linear"], ["get", "point_count"], 1, "#0ea5e9", 50, "#2563eb", 100, "#1d4ed8"],
              "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 1, 12, 50, 20, 100, 28],
              "circle-stroke-width": 1.25,
              "circle-stroke-color": "#0b1825",
            },
          });

          map.addLayer({
            id: CLUSTER_COUNT,
            type: "symbol",
            source: SOURCE_ID,
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["to-string", ["get", "point_count"]],
              "text-size": 12,
              "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
            },
            paint: { "text-color": "#e2e8f0" },
          });

          // Unclustered points
          map.addLayer({
            id: POINT_LAYER,
            type: "circle",
            source: SOURCE_ID,
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": colorExpression(),
              "circle-radius": 6,
              "circle-stroke-width": 1.25,
              "circle-stroke-color": "#0b1825",
            },
          });

          // Hover popup
          const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
          const handleMove = (e: MapMouseEvent) => {
            const feats = map.queryRenderedFeatures(e.point, { layers: [POINT_LAYER] });
            const f = feats?.[0];
            if (!f) {
              popup.remove();
              return;
            }
            const p = f.properties as SupplierPointProps;
            const name = (p?.name || p?.supplier || "Supplier").toString();
            popup
              .setLngLat(e.lngLat)
              .setHTML(
                `<div style="padding:6px 8px;font-weight:600">${name}</div>` +
                  (p?.category ? `<div style="padding:0 8px 6px;opacity:.75">${p.category}</div>` : "")
              )
              .addTo(map);
          };
          map.on("mousemove", handleMove);
          map.on("mouseleave", POINT_LAYER, () => popup.remove());

          // Click to add a stop
          map.on("click", (e) => {
            const feats = map.queryRenderedFeatures(e.point, { layers: [POINT_LAYER] });
            const f = feats?.[0];
            if (!f) return;
            const p = f.properties as SupplierPointProps;
            const coords = (f.geometry as Point).coordinates as [number, number];
            onAddStop?.({ name: p?.name || p?.supplier || "Stop", coord: coords });
          });

          // Fit to data
          try {
            const all = (fc.features || []).map((ft: any) => ft.geometry?.coordinates).filter(Boolean) as [number, number][];
            if (all.length) {
              const b = new mapboxgl.LngLatBounds();
              all.forEach((c) => b.extend(c as LngLatLike));
              map.fitBounds(b, { padding: 40, duration: 0 });
            }
          } catch {
            /* ignore */
          }

          // Update left panel summary
          const names = Array.from(
            new Set(
              (fc.features || [])
                .map((f: any) => (f.properties?.supplier || f.properties?.name || "").toString().trim())
                .filter(Boolean)
            )
          ).sort((a, b) => a.localeCompare(b));
          onDataLoaded?.({ total: names.length, suppliers: names });
        } catch (err: any) {
          setLoadErr(err?.message || "Map failed to initialize.");
        }
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // styleUrl only controls set at init; we recreate map on change for safety
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  return (
    <div className="h-[72vh] w-full">
      {loadErr ? (
        <div className="text-sm text-red-300 bg-[#1b2736] border border-[#2a3b53] rounded-lg p-3">{loadErr}</div>
      ) : (
        <div ref={containerRef} className="map-container rounded-2xl overflow-hidden border border-[#1b2a41] h-full w-full" />
      )}
    </div>
  );
}
