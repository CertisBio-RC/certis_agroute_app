"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map as MapboxMap, LngLatLike } from "mapbox-gl";
import type { FeatureCollection, Feature, Point } from "geojson";

export interface RetailerProps {
  Retailer: string;
  Name: string;
  City?: string;
  State?: string;
  Category?: string;
  Address?: string;
  Phone?: string;
  Website?: string;
  Logo?: string;   // relative e.g. "logos/basf.png"
  Color?: string;  // hex color per-point if present
  id?: string;
}

export type MarkerStyle = "logo" | "color";

type Props = {
  /** Retailers as GeoJSON FeatureCollection<Point, RetailerProps> */
  data?: FeatureCollection<Point, RetailerProps>;
  /** "logo" (still renders circles) or "color" */
  markerStyle: MarkerStyle;
  /** Show text labels for unclustered points */
  showLabels: boolean;
  /** CSS color for label text */
  labelColor: string;
  /** Mapbox style URI (e.g., 'mapbox://styles/mapbox/streets-v12') */
  mapStyle: string;
  /** "mercator" or "globe" */
  projection?: "mercator" | "globe";
  /** Allow user rotate (dragRotate & touch rotation) */
  allowRotate?: boolean;
  /** Slightly boost raster contrast for satellite styles */
  rasterSharpen?: boolean;
  /** Public Mapbox Token */
  mapboxToken: string;
};

mapboxgl.workerClass =
  // @ts-ignore –– allow bundlers that need this workaround
  (require("mapbox-gl/dist/mapbox-gl-csp-worker").default as unknown) || undefined;

const MAP_SOURCE_ID = "retailers-src";
const L_CLUSTER = "retailers-clusters";
const L_CLUSTER_COUNT = "retailers-cluster-count";
const L_UNCLUSTERED = "retailers-unclustered";
const L_UNCLUSTERED_LABELS = "retailers-unclustered-labels";

function computeBbox(fc: FeatureCollection<Point, RetailerProps>) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const f of fc.features) {
    const c = f.geometry?.coordinates;
    if (!c || c.length < 2) continue;
    const [x, y] = c;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ] as [[number, number], [number, number]];
}

function addOrUpdateSource(map: MapboxMap, fc: FeatureCollection<Point, RetailerProps>) {
  const existing = map.getSource(MAP_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!existing) {
    map.addSource(MAP_SOURCE_ID, {
      type: "geojson",
      data: fc,
      cluster: true,
      clusterRadius: 60,
      clusterMaxZoom: 14,
    });
  } else {
    existing.setData(fc as any);
  }
}

function ensureLayers(map: MapboxMap, labelColor: string, markerStyle: MarkerStyle, showLabels: boolean) {
  // Cluster circles
  if (!map.getLayer(L_CLUSTER)) {
    map.addLayer({
      id: L_CLUSTER,
      type: "circle",
      source: MAP_SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#60a5fa", // < 10
          10,
          "#3b82f6", // 10-24
          25,
          "#2563eb", // 25-49
          50,
          "#1d4ed8", // 50-99
          100,
          "#1e40af", // 100+
        ],
        "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 25, 22, 50, 26, 100, 30],
        "circle-opacity": 0.9,
      },
    });
  }

  // Cluster count symbols
  if (!map.getLayer(L_CLUSTER_COUNT)) {
    map.addLayer({
      id: L_CLUSTER_COUNT,
      type: "symbol",
      source: MAP_SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["to-string", ["get", "point_count"]],
        "text-size": 12,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1.2,
      },
    });
  }

  // Unclustered circles
  if (!map.getLayer(L_UNCLUSTERED)) {
    map.addLayer({
      id: L_UNCLUSTERED,
      type: "circle",
      source: MAP_SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": 6,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#111827",
        "circle-color":
          markerStyle === "color"
            ? [
                "coalesce",
                ["get", "Color"],
                "#22c55e", // default green if not provided
              ]
            : "#f59e0b", // amber-ish if "logo" chosen (we still draw circles)
      },
    });
  } else {
    // Update marker color mode dynamically
    map.setPaintProperty(
      L_UNCLUSTERED,
      "circle-color",
      markerStyle === "color"
        ? (["coalesce", ["get", "Color"], "#22c55e"] as any)
        : "#f59e0b"
    );
  }

  // Labels (optional)
  const labelsExist = Boolean(map.getLayer(L_UNCLUSTERED_LABELS));
  if (showLabels && !labelsExist) {
    map.addLayer({
      id: L_UNCLUSTERED_LABELS,
      type: "symbol",
      source: MAP_SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      layout: {
        "text-field": ["coalesce", ["get", "Name"], ["get", "Retailer"], ""],
        "text-size": 11,
        "text-offset": [0, 1],
        "text-anchor": "top",
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      },
      paint: {
        "text-color": labelColor || "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1.2,
      },
    });
  } else if (!showLabels && labelsExist) {
    map.removeLayer(L_UNCLUSTERED_LABELS);
  } else if (showLabels && labelsExist) {
    map.setPaintProperty(L_UNCLUSTERED_LABELS, "text-color", labelColor || "#ffffff");
  }
}

export default function MapView({
  data,
  markerStyle,
  showLabels,
  labelColor,
  mapStyle,
  projection = "mercator",
  allowRotate = false,
  rasterSharpen = false,
  mapboxToken,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const isLoadedRef = useRef(false);

  // Token
  useMemo(() => {
    if (mapboxToken) {
      mapboxgl.accessToken = mapboxToken;
    }
    return null;
  }, [mapboxToken]);

  // Create map
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      projection: projection as any, // TS: underlying API accepts string names
      center: [-96.9, 37.5] as LngLatLike,
      zoom: 3.2,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    // Interaction toggles
    const applyRotate = () => {
      if (allowRotate) {
        map.dragRotate.enable();
        map.touchZoomRotate.enableRotation();
      } else {
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();
        map.setPitch(0);
        map.setBearing(0);
      }
    };

    const applyRasterBoost = () => {
      if (!rasterSharpen) return;
      try {
        const style = map.getStyle();
        const layers = style?.layers || [];
        for (const l of layers) {
          if (l.type === "raster") {
            // Contrast is a supported property; keep it mild
            map.setPaintProperty(l.id, "raster-contrast", 0.08);
          }
        }
      } catch {
        /* ignore */
      }
    };

    const addData = () => {
      if (!data) return;
      addOrUpdateSource(map, data);
      ensureLayers(map, labelColor, markerStyle, showLabels);

      const bbox = computeBbox(data);
      if (bbox) {
        try {
          map.fitBounds(bbox as any, { padding: 40, maxZoom: 7.5, duration: 600 });
        } catch {
          /* ignore */
        }
      }
    };

    map.on("load", () => {
      isLoadedRef.current = true;
      applyRotate();
      applyRasterBoost();
      addData();
    });

    // When the style changes (switch basemaps), we must re-add source/layers
    map.on("styledata", () => {
      if (!isLoadedRef.current) return;
      applyRasterBoost();
      if (data) {
        addOrUpdateSource(map, data);
        ensureLayers(map, labelColor, markerStyle, showLabels);
      }
    });

    mapRef.current = map;
    return () => {
      isLoadedRef.current = false;
      try {
        map.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle, projection, mapboxToken]);

  // Update rotate toggle when prop changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    if (allowRotate) {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
    } else {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      try {
        map.setPitch(0);
        map.setBearing(0);
      } catch {
        /* ignore */
      }
    }
  }, [allowRotate]);

  // Update raster contrast boost
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    if (!rasterSharpen) return;
    try {
      const style = map.getStyle();
      const layers = style?.layers || [];
      for (const l of layers) {
        if (l.type === "raster") {
          map.setPaintProperty(l.id, "raster-contrast", 0.08);
        }
      }
    } catch {
      /* ignore */
    }
  }, [rasterSharpen, mapStyle]);

  // Update data / layers when data or rendering prefs change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current || !data) return;

    addOrUpdateSource(map, data);
    ensureLayers(map, labelColor, markerStyle, showLabels);
  }, [data, labelColor, markerStyle, showLabels]);

  return <div ref={containerRef} className="h-[70vh] w-full" />;
}
