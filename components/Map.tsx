"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";

// ---- Types that MUST match page.tsx normalization ----
export interface RetailerProps {
  Retailer: string;
  Name: string;
  City?: string;
  State?: string;
  Category?: string;
  Address?: string;
  Phone?: string;
  Website?: string;
  Logo?: string;
  Color?: string;
}

type ProjectionName = "mercator" | "globe";
type MarkerStyle = "logo" | "color";

export type Props = {
  data?: FeatureCollection<Point, RetailerProps>;
  markerStyle: MarkerStyle;
  showLabels?: boolean;
  labelColor?: string;
  mapStyle: string;
  projection?: ProjectionName;
  allowRotate?: boolean;
  rasterSharpen?: boolean;
  mapboxToken: string;

  home?: { lng: number; lat: number };
  onPickHome?: (lng: number, lat: number) => void;
  enableHomePick?: boolean;
};

const SOURCE_ID = "retailers-src";
const L_CLUSTER = "retailers-clusters";
const L_CLUSTER_COUNT = "retailers-cluster-count";
const L_UNCLUSTERED = "retailers-points";
const L_LABELS = "retailers-labels";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function MapView({
  data,
  markerStyle,
  showLabels = true,
  labelColor = "#ffffff",
  mapStyle,
  projection = "mercator",
  allowRotate = false,
  rasterSharpen = false,
  mapboxToken,
  home,
  onPickHome,
  enableHomePick = false,
}: Props) {
  // If no token, render a friendly panel instead of throwing
  if (!mapboxToken) {
    return (
      <div className="relative w-full h-[80vh] grid place-items-center bg-black/80 text-white rounded">
        <div className="max-w-xl text-center space-y-3 px-6">
          <h2 className="text-lg font-semibold">Mapbox token not found</h2>
          <p className="text-sm opacity-90">
            The app couldn’t find a Mapbox access token. Provide{" "}
            <code className="px-1 bg-white/10 rounded">NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN</code> at build
            time, or add <code className="px-1 bg-white/10 rounded">public/mapbox-token.txt</code> with
            your public <code>pk…</code> token.
          </p>
        </div>
      </div>
    );
  }

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const isLoadedRef = useRef(false);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Provide token
  mapboxgl.accessToken = mapboxToken;

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [-96.9, 37.5],
      zoom: 3.5,
      cooperativeGestures: true,
      attributionControl: true,
      projection,
    });

    if (!allowRotate) {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    } else {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
    }

    mapRef.current = map;

    const onLoad = () => {
      isLoadedRef.current = true;

      if (rasterSharpen) {
        try {
          const style = map.getStyle();
          const layers = style?.layers ?? [];
          for (const l of layers) {
            if (l.type === "raster") {
              map.setPaintProperty(l.id, "raster-contrast", clamp(0.08, -1, 1));
            }
          }
        } catch {}
      }

      if (data) upsertRetailerSourceAndLayers(map, data, showLabels, labelColor);
      ensureHomeMarker(map, homeMarkerRef, home ?? null);
    };

    map.on("load", onLoad);

    return () => {
      try {
        homeMarkerRef.current?.remove();
      } catch {}
      map.remove();
      mapRef.current = null;
      isLoadedRef.current = false;
    };
  }, [mapStyle]);

  // Update projection when it changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    try {
      (map as any).setProjection(projection);
    } catch {}
  }, [projection]);

  // Rotate enable/disable
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (allowRotate) {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
    } else {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      try {
        map.setBearing(0);
        map.setPitch(0);
      } catch {}
    }
  }, [allowRotate]);

  // Raster contrast toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    try {
      const style = map.getStyle();
      const layers = style?.layers ?? [];
      for (const l of layers) {
        if (l.type === "raster") {
          const val = rasterSharpen ? clamp(0.08, -1, 1) : 0;
          map.setPaintProperty(l.id, "raster-contrast", val);
        }
      }
    } catch {}
  }, [rasterSharpen]);

  // Source + layers on data change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current || !data) return;
    upsertRetailerSourceAndLayers(map, data, showLabels, labelColor);
  }, [data]);

  // Toggle labels live
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    const hasLabels = map.getLayer(L_LABELS);
    if (showLabels) {
      if (!hasLabels && map.getSource(SOURCE_ID)) {
        addLabelLayer(map, labelColor);
      } else if (hasLabels) {
        map.setPaintProperty(L_LABELS, "text-color", labelColor);
        map.setLayoutProperty(L_LABELS, "visibility", "visible");
      }
    } else if (hasLabels) {
      map.setLayoutProperty(L_LABELS, "visibility", "none");
    }
  }, [showLabels, labelColor]);

  // Home marker updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    ensureHomeMarker(map, homeMarkerRef, home ?? null);
  }, [home?.lng, home?.lat]);

  // Pick home by clicking
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    const handle = (e: mapboxgl.MapMouseEvent) => {
      if (!enableHomePick || !onPickHome) return;
      const { lng, lat } = e.lngLat;
      onPickHome(lng, lat);
    };
    map.on("click", handle);
    return () => map.off("click", handle);
  }, [enableHomePick, onPickHome]);

  const info = useMemo(
    () => ({
      count: data?.features?.length ?? 0,
      style: mapStyle,
      projection,
    }),
    [data, mapStyle, projection]
  );

  return (
    <div className="relative w-full h-[80vh]">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute left-2 bottom-2 z-10 rounded bg-black/50 text-white px-2 py-1 text-xs">
        <div>Retailers: {info.count}</div>
        <div>{info.projection}</div>
      </div>
    </div>
  );
}

// --- helpers ---

function upsertRetailerSourceAndLayers(
  map: MapboxMap,
  fc: FeatureCollection<Point, RetailerProps>,
  showLabels: boolean,
  labelColor: string
) {
  const existing = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;

  const clusterOpts: any = {
    type: "geojson",
    data: fc,
    cluster: true,
    clusterMaxZoom: 12,
    clusterRadius: 40,
  };

  if (!existing) {
    map.addSource(SOURCE_ID, clusterOpts);
    addClusterLayers(map);
    addPointLayer(map);
    if (showLabels) addLabelLayer(map, labelColor);
  } else {
    existing.setData(fc as any);
  }
}

function addClusterLayers(map: MapboxMap) {
  if (!map.getLayer(L_CLUSTER)) {
    map.addLayer({
      id: L_CLUSTER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#8ecae6",
          25,
          "#219ebc",
          100,
          "#023047",
        ],
        "circle-radius": ["step", ["get", "point_count"], 16, 25, 22, 100, 30],
        "circle-opacity": 0.85,
      },
    });
  }

  if (!map.getLayer(L_CLUSTER_COUNT)) {
    map.addLayer({
      id: L_CLUSTER_COUNT,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["to-string", ["get", "point_count_abbreviated"]],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 12,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1.2,
      },
    });
  }
}

function addPointLayer(map: MapboxMap) {
  if (!map.getLayer(L_UNCLUSTERED)) {
    map.addLayer({
      id: L_UNCLUSTERED,
      type: "circle",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["coalesce", ["get", "Color"], "#0ea5e9"],
        "circle-radius": 6,
        "circle-stroke-color": "#000000",
        "circle-stroke-width": 0.75,
      },
    });
  }
}

function addLabelLayer(map: MapboxMap, labelColor: string) {
  if (map.getLayer(L_LABELS)) return;
  map.addLayer({
    id: L_LABELS,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "text-field": ["get", "Name"],
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "text-size": 11,
      "text-offset": [0, 1.1],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: {
      "text-color": labelColor || "#ffffff",
      "text-halo-color": "#000000",
      "text-halo-width": 1.2,
    },
  });
}

function ensureHomeMarker(
  map: MapboxMap,
  mkRef: React.MutableRefObject<mapboxgl.Marker | null>,
  home: { lng: number; lat: number } | null
) {
  if (mkRef.current) {
    try {
      mkRef.current.remove();
    } catch {}
    mkRef.current = null;
  }
  if (!home) return;

  const el = document.createElement("div");
  el.style.width = "18px";
  el.style.height = "18px";
  el.style.borderRadius = "9999px";
  el.style.background = "#f59e0b";
  el.style.border = "2px solid #000";
  el.title = "Home";

  const mk = new mapboxgl.Marker({ element: el, anchor: "center" })
    .setLngLat([home.lng, home.lat])
    .addTo(map);
  mkRef.current = mk;
}
