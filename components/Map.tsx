"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import type { FeatureCollection, Feature, Point } from "geojson";

// ---------- Types ----------
export type RetailerProps = {
  id?: string;
  Retailer?: string;
  Name?: string;
  State?: string;
  Category?: string;
  City?: string;
  Logo?: string;   // e.g. logos/some.png (no leading slash)
  Color?: string;  // hex string like "#F00" (fallback if no logo)
};

type HomeLoc = { lng: number; lat: number };

export type Props = {
  data?: FeatureCollection<Point, RetailerProps>;
  markerStyle: "logo" | "color";
  showLabels: boolean;
  labelColor?: string;
  mapStyle: string; // style URL
  projection?: "mercator" | "globe";
  allowRotate?: boolean;
  rasterSharpen?: boolean;
  mapboxToken: string;
  enableHomePick?: boolean;
  onPickHome?: (lng: number, lat: number) => void;
  home?: HomeLoc | null;
};

// ---------- Helpers ----------
function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function logoImageId(pngPath: string) {
  return `logo:${pngPath}`;
}

function collectLogos(fc?: FeatureCollection<Point, RetailerProps>) {
  const ids = new Set<string>();
  if (!fc) return ids;
  for (const f of fc.features) {
    const logo = f.properties?.Logo;
    if (logo) ids.add(logo);
  }
  return ids;
}

function toClusterSource(fc: FeatureCollection<Point, RetailerProps>) {
  return {
    type: "geojson" as const,
    data: fc,
    cluster: true,
    clusterRadius: 55,
    clusterMaxZoom: 14,
  };
}

const MAP_CONTAINER_ID = "mapbox-container";

// Keep one map instance per component life
let mapInstanceCounter = 0;

// Refs (module-scoped are unsafe; use within component)
function useStableId(prefix: string) {
  const r = useRef<string | null>(null);
  if (!r.current) r.current = `${prefix}-${++mapInstanceCounter}`;
  return r.current;
}

// ---------- Component ----------
export default function MapView({
  data,
  markerStyle,
  showLabels,
  labelColor = "#ffffff",
  mapStyle,
  projection = "mercator",
  allowRotate = false,
  rasterSharpen = false,
  mapboxToken,
  enableHomePick = false,
  onPickHome,
  home,
}: Props) {
  const containerId = useStableId(MAP_CONTAINER_ID);
  const mapRef = useRef<MapboxMap | null>(null);
  const isLoadedRef = useRef(false);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Set token
  useEffect(() => {
    if (mapboxToken && mapboxgl.accessToken !== mapboxToken) {
      mapboxgl.accessToken = mapboxToken;
    }
  }, [mapboxToken]);

  // Init / destroy map
  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerId,
      style: mapStyle,
      center: [-96.5, 39.8],
      zoom: 4,
      pitch: 0,
      bearing: 0,
      projection,
      attributionControl: true,
      hash: false,
      cooperativeGestures: true,
    });

    if (!allowRotate) {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    }

    map.addControl(new mapboxgl.NavigationControl({ showCompass: allowRotate }), "top-right");

    map.on("load", () => {
      isLoadedRef.current = true;
      mapRef.current = map;

      try {
        // sharpen raster a bit (if using satellite)
        if (rasterSharpen) {
          const layers = map.getStyle().layers || [];
          for (const l of layers) {
            if (l.type === "raster") {
              map.setPaintProperty(l.id, "raster-sharpness", clamp(0.4, 0, 1));
              map.setPaintProperty(l.id, "raster-contrast", clamp(0.08, -1, 1));
            }
          }
        }
      } catch {
        // ignore
      }

      // add data if present
      if (data) {
        upsertData(map, data, markerStyle, showLabels, labelColor);
        fitToData(map, data);
        ensureHomeMarker(map, home);
      }
    });

    // Click to pick "home"
    const handle = (e: mapboxgl.MapMouseEvent) => {
      if (!enableHomePick || !onPickHome) return;
      const { lng, lat } = e.lngLat;
      onPickHome(lng, lat);
    };
    map.on("click", handle);

    return () => {
      try {
        map.off("click", handle);
      } catch {}
      try {
        map.remove();
      } catch {}
      mapRef.current = null;
      isLoadedRef.current = false;
    };
  }, []); // eslint-disable-line

  // Style or projection changed
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    try {
      // apply bearing/rotate toggle
      if (allowRotate) {
        map.dragRotate.enable();
        map.touchZoomRotate.enableRotation();
      } else {
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();
      }
    } catch {}
  }, [allowRotate]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    try {
      // projection is a union of string literals; Mapbox types accept string
      map.setProjection(projection as any);
    } catch {}
  }, [projection]);

  // Data / symbology updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current || !data) return;
    upsertData(map, data, markerStyle, showLabels, labelColor);
  }, [data, markerStyle, showLabels, labelColor]);

  // Home marker updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    ensureHomeMarker(map, home);
  }, [home]);

  return (
    <div className="relative w-full h-[80vh] bg-black">
      <div id={containerId} className="absolute inset-0" />
    </div>
  );
}

// ---------- Data & Layers ----------
const SOURCE_ID = "retailers-src";
const LAYER_CLUSTER = "retailers-cluster";
const LAYER_CLUSTER_COUNT = "retailers-cluster-count";
const LAYER_POINTS = "retailers-points";
const LAYER_LABELS = "retailers-labels";

function upsertData(
  map: MapboxMap,
  fc: FeatureCollection<Point, RetailerProps>,
  markerStyle: "logo" | "color",
  showLabels: boolean,
  labelColor: string
) {
  // Source
  const existing = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  const clusterOpts = toClusterSource(fc);
  if (!existing) {
    map.addSource(SOURCE_ID, clusterOpts as any);
  } else {
    existing.setData(fc as any);
  }

  // Ensure logo images are present
  if (markerStyle === "logo") {
    const needed = collectLogos(fc);
    needed.forEach((png) => tryAddImage(map, png));
  }

  // Layers (recreate idempotently)
  ensureClusterLayers(map);
  ensurePointLayer(map, markerStyle);
  ensureLabelLayer(map, showLabels, labelColor);
}

function ensureClusterLayers(map: MapboxMap) {
  // bubble
  if (!map.getLayer(LAYER_CLUSTER)) {
    map.addLayer({
      id: LAYER_CLUSTER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#3b82f6",
          20,
          "#22c55e",
          100,
          "#eab308",
          250,
          "#ef4444",
        ],
        "circle-radius": [
          "step",
          ["get", "point_count"],
          16,
          20,
          22,
          100,
          28,
          250,
          36,
        ],
        "circle-stroke-color": "#000",
        "circle-stroke-width": 1.2,
      },
    });
  }

  // count
  if (!map.getLayer(LAYER_CLUSTER_COUNT)) {
    map.addLayer({
      id: LAYER_CLUSTER_COUNT,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["format", ["get", "point_count_abbreviated"]],
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
        "text-size": 12,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1.4,
      },
    });
  }
}

function ensurePointLayer(map: MapboxMap, style: "logo" | "color") {
  // remove old point layer if toggling style
  const existing = map.getLayer(LAYER_POINTS);
  if (existing) map.removeLayer(LAYER_POINTS);

  if (style === "logo") {
    map.addLayer({
      id: LAYER_POINTS,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": [
          "coalesce",
          [
            "image",
            ["concat", "logo:", ["coalesce", ["get", "Logo"], ""]]
          ],
          // Fallback: a built-in marker if logo missing/not loaded
          "marker-15"
        ],
        "icon-size": 0.7,
        "icon-allow-overlap": true,
      },
    });
  } else {
    map.addLayer({
      id: LAYER_POINTS,
      type: "circle",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": 6,
        "circle-color": [
          "case",
          ["has", "Color"],
          ["get", "Color"],
          "#22c55e",
        ],
        "circle-stroke-color": "#000",
        "circle-stroke-width": 1,
      },
    });
  }
}

function ensureLabelLayer(map: MapboxMap, show: boolean, labelColor: string) {
  // remove prior first
  if (map.getLayer(LAYER_LABELS)) map.removeLayer(LAYER_LABELS);

  if (!show) return;

  map.addLayer({
    id: LAYER_LABELS,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "text-field": [
        "coalesce",
        ["get", "Name"],
        ["get", "Retailer"],
        "Retailer"
      ],
      "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
      "text-size": 11,
      "text-offset": [0, 1.1],
      "text-anchor": "top",
    },
    paint: {
      "text-color": labelColor || "#ffffff",
      "text-halo-color": "#000000",
      "text-halo-width": 1.2,
    },
  });
}

async function tryAddImage(map: MapboxMap, pngPath: string) {
  const id = logoImageId(pngPath);
  if (map.hasImage(id)) return;

  try {
    const url = pngPath.startsWith("http") ? pngPath : pngPath;
    const resp = await fetch(url);
    const blob = await resp.blob();
    const bmp = await createImageBitmap(blob);
    // @ts-expect-error Mapbox accepts ImageBitmap
    map.addImage(id, bmp, { sdf: false });
  } catch {
    // swallow; layer will fall back to marker-15
  }
}

function fitToData(map: MapboxMap, fc: FeatureCollection<Point, RetailerProps>) {
  try {
    if (!fc.features.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    for (const f of fc.features) {
      const [lng, lat] = f.geometry.coordinates;
      bounds.extend([lng, lat]);
    }
    if (bounds.isEmpty()) return;
    map.fitBounds(bounds, { padding: 40, maxZoom: 10, duration: 600 });
  } catch {
    // ignore
  }
}

function ensureHomeMarker(map: MapboxMap, home?: HomeLoc | null) {
  // remove existing
  if (homeMarkerRef.current) {
    try {
      homeMarkerRef.current.remove();
    } catch {}
    homeMarkerRef.current = null;
  }
  if (!home) return;

  // add new
  const el = document.createElement("div");
  el.style.width = "16px";
  el.style.height = "16px";
  el.style.borderRadius = "9999px";
  el.style.background = "#10b981"; // emerald
  el.style.boxShadow = "0 0 0 2px #000";
  el.title = "Home";
  const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
    .setLngLat([home.lng, home.lat])
    .addTo(map);

  homeMarkerRef.current = marker;
}
