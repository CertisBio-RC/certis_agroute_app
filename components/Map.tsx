// components/Map.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";

export type RetailerProps = {
  Retailer: string;
  Name: string;
  City?: string;
  State?: string;
  Category?: string;
  Address?: string;
  Phone?: string;
  Website?: string;
  Color?: string;
  Logo?: string;
};

export type MarkerStyle = "dot" | "color-dot" | "logo";
export type Projection = "mercator" | "globe";

export type Props = {
  data?: FeatureCollection<Point, RetailerProps>;
  markerStyle: MarkerStyle;
  showLabels: boolean;
  labelColor: string;
  mapStyle: string; // Mapbox style URL
  allowRotate: boolean;
  projection: Projection;
  rasterSharpen: boolean;
  mapboxToken: string;
  home?: { lng: number; lat: number };
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const MAP_ID = "retailers";
const LABEL_LAYER_ID = "retailer-labels";
const DOT_LAYER_ID = "retailer-dots";
const COLOR_DOT_LAYER_ID = "retailer-color-dots";

export default function MapView({
  data,
  markerStyle,
  showLabels,
  labelColor,
  mapStyle,
  allowRotate,
  projection,
  rasterSharpen,
  mapboxToken,
  home,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const readyRef = useRef(false);

  // If no token: show a friendly message (no crash)
  if (!mapboxToken) {
    return (
      <div className="flex h-[70vh] min-h-[520px] items-center justify-center rounded-xl border border-white/10 bg-black/40">
        <div className="max-w-xl text-center">
          <h2 className="text-2xl font-semibold mb-2">Mapbox token not found</h2>
          <p className="text-white/80">
            Provide <code className="px-1 bg-white/10 rounded">NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN</code> or add{" "}
            <code className="px-1 bg-white/10 rounded">public/mapbox-token.txt</code> with your public token.
          </p>
        </div>
      </div>
    );
  }

  // Create / recreate the map when fundamental inputs change
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // destroy previous
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      readyRef.current = false;
    }

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: el,
      style: mapStyle,
      center: [-97, 38.5],
      zoom: 4,
      pitchWithRotate: allowRotate,
      dragRotate: allowRotate,
      cooperativeGestures: true,
    });

    mapRef.current = map;

    map.on("load", () => {
      readyRef.current = true;

      // projection
      try {
        map.setProjection(projection);
      } catch {
        // ignore if style doesn't support projection
      }

      // optional raster sharpen (contrast)
      if (rasterSharpen) {
        const layers = map.getStyle().layers ?? [];
        for (const l of layers) {
          if (l.type === "raster") {
            map.setPaintProperty(l.id, "raster-contrast", clamp(0.08, -1, 1));
          }
        }
      }

      // add empty/real source up front
      if (!map.getSource(MAP_ID)) {
        map.addSource(MAP_ID, {
          type: "geojson",
          data: data || { type: "FeatureCollection", features: [] },
        });
      }

      // DOT layer (default)
      if (!map.getLayer(DOT_LAYER_ID)) {
        map.addLayer({
          id: DOT_LAYER_ID,
          type: "circle",
          source: MAP_ID,
          paint: {
            "circle-radius": 6,
            "circle-color": "#ffcc00",
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#222",
          },
        });
      }

      // COLOR DOT
      if (!map.getLayer(COLOR_DOT_LAYER_ID)) {
        map.addLayer({
          id: COLOR_DOT_LAYER_ID,
          type: "circle",
          source: MAP_ID,
          paint: {
            "circle-radius": 6,
            "circle-color": [
              "case",
              ["has", "Color", ["object", ["get", "properties"]]],
              ["coalesce", ["get", "Color"], "#ffcc00"],
              "#ffcc00",
            ],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#222",
          },
          layout: { visibility: "none" },
        });
      }

      // LABELS
      if (!map.getLayer(LABEL_LAYER_ID)) {
        map.addLayer({
          id: LABEL_LAYER_ID,
          type: "symbol",
          source: MAP_ID,
          layout: {
            "text-field": ["coalesce", ["get", "Name"], ["get", "Retailer"], "—"],
            "text-size": 12,
            "text-offset": [0, 1],
            "text-anchor": "top",
            visibility: showLabels ? "visible" : "none",
          },
          paint: { "text-color": labelColor },
        });
      }

      // Home marker
      if (home) {
        new mapboxgl.Marker({ color: "#32d583" }).setLngLat([home.lng, home.lat]).addTo(map);
      }

      // show the chosen marker layer
      applyMarkerVisibility(map, markerStyle);
    });

    return () => {
      map.remove();
      readyRef.current = false;
      mapRef.current = null;
    };
  }, [mapStyle, mapboxToken, allowRotate, projection, rasterSharpen, markerStyle, home]);

  // Update geojson when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource(MAP_ID) as mapboxgl.GeoJSONSource | undefined;
    if (src && data) src.setData(data);
  }, [data]);

  // Update label toggle / color
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (map.getLayer(LABEL_LAYER_ID)) {
      map.setLayoutProperty(LABEL_LAYER_ID, "visibility", showLabels ? "visible" : "none");
      map.setPaintProperty(LABEL_LAYER_ID, "text-color", labelColor);
    }
  }, [showLabels, labelColor]);

  // Update marker style without recreating map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    applyMarkerVisibility(map, markerStyle);
  }, [markerStyle]);

  return <div ref={containerRef} className="h-[70vh] min-h-[520px] w-full" />;
}

function applyMarkerVisibility(map: MapboxMap, style: MarkerStyle) {
  // default both off, then enable one
  if (map.getLayer(DOT_LAYER_ID)) map.setLayoutProperty(DOT_LAYER_ID, "visibility", "none");
  if (map.getLayer(COLOR_DOT_LAYER_ID)) map.setLayoutProperty(COLOR_DOT_LAYER_ID, "visibility", "none");

  switch (style) {
    case "dot":
      if (map.getLayer(DOT_LAYER_ID)) map.setLayoutProperty(DOT_LAYER_ID, "visibility", "visible");
      break;
    case "color-dot":
      if (map.getLayer(COLOR_DOT_LAYER_ID)) map.setLayoutProperty(COLOR_DOT_LAYER_ID, "visibility", "visible");
      break;
    case "logo":
      // (for now) fall back to color dots; logos require sprite/image management
      if (map.getLayer(COLOR_DOT_LAYER_ID)) map.setLayoutProperty(COLOR_DOT_LAYER_ID, "visibility", "visible");
      break;
  }
}
