"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import type { FeatureCollection, Feature, Point } from "geojson";

// ------------------- Types -------------------
export type RetailerProps = {
  Retailer: string;
  Name: string;
  City?: string;
  State?: string;
  Category?: string;
  Address?: string;
  Phone?: string;
  Website?: string;
  Color?: string;   // optional per-point color
  Logo?: string;    // we’re not using logos in this minimal map layer
  id?: string;      // page.tsx may supply synthetic ids
};

export type MarkerStyleOpt = "dot" | "color-dot";

export type HomeLoc = { lng: number; lat: number };

type Props = {
  data?: FeatureCollection<Point, RetailerProps>;
  markerStyle: MarkerStyleOpt;
  showLabels: boolean;
  labelColor: string;

  // "hybrid" | "satellite" | "streets" (case-insensitive)
  mapStyle: string;

  allowRotate?: boolean;
  projection?: "mercator" | "globe";
  rasterSharpen?: boolean;

  // If provided we’ll try Mapbox first, and auto-fallback on auth/network errors
  mapboxToken?: string;

  // Optional home marker
  home?: HomeLoc;
};

// ------------------- Style Helpers -------------------
const MAPBOX_STYLE_FOR = (kind: string, token?: string) => {
  // Return a concrete Mapbox style URL if token is present; otherwise null
  if (!token) return null;

  const k = (kind || "").toLowerCase();
  if (k === "satellite") return "mapbox://styles/mapbox/satellite-v9";
  if (k === "hybrid") return "mapbox://styles/mapbox/satellite-streets-v12";
  return "mapbox://styles/mapbox/streets-v12"; // default
};

// Open, token-free style with glyphs so symbol labels work
const OSM_STYLE: any = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

// Clamp helper
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// ------------------- Component -------------------
export default function MapView({
  data,
  markerStyle,
  showLabels,
  labelColor,
  mapStyle,
  allowRotate = false,
  projection = "mercator",
  rasterSharpen = true,
  mapboxToken,
  home,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Decide initial style
  const initialStyle = useMemo(() => {
    const s = MAPBOX_STYLE_FOR(mapStyle, mapboxToken);
    return s ?? OSM_STYLE;
  }, [mapStyle, mapboxToken]);

  const wantMapbox = !!MAPBOX_STYLE_FOR(mapStyle, mapboxToken);

  // ---------- Mount map ----------
  useEffect(() => {
    if (!containerRef.current) return;

    // Configure token even if we might fall back later
    if (mapboxToken) mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: initialStyle,
      center: [-97, 38.35],
      zoom: 3.2,
      attributionControl: true,
      projection, // "mercator" | "globe"
      hash: false,
    });

    mapRef.current = map;

    // Interaction toggles
    if (!allowRotate) {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    }

    // GLOBAL error handler: if we’re trying Mapbox and get 401/403, show overlay + allow fallback
    const errorHandler = (e: any) => {
      const status =
        e?.error?.status ||
        e?.status ||
        (typeof e?.message === "string" &&
          (e.message.includes("401") ? 401 : e.message.includes("403") ? 403 : 0)) ||
        0;

      if (wantMapbox && (status === 401 || status === 403)) {
        setLoadError(
          "Map error (401/403). Your token is missing scopes or the style URL is restricted."
        );
      }
    };
    map.on("error", errorHandler);

    // When a style is fully ready, (re)add our sources/layers and tweak raster paint
    const ensureLayers = () => {
      if (!map.isStyleLoaded()) return;

      // Source
      if (map.getSource("retailers")) {
        // Replace data if source exists
        if (data) (map.getSource("retailers") as mapboxgl.GeoJSONSource).setData(data);
      } else {
        if (data) {
          map.addSource("retailers", {
            type: "geojson",
            data,
            cluster: true,
            clusterMaxZoom: 9,
            clusterRadius: 40,
          });
        }
      }

      // Marker layer (simple circles)
      if (data && !map.getLayer("retailers-circle")) {
        map.addLayer({
          id: "retailers-circle",
          type: "circle",
          source: "retailers",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": 6,
            "circle-stroke-color": "#0b0d12",
            "circle-stroke-width": 1.25,
            "circle-color":
              markerStyle === "color-dot"
                ? ["coalesce", ["get", "Color"], "#ffb703"]
                : "#ffb703",
          },
        });
      }

      // Cluster bubbles
      if (data && !map.getLayer("retailers-clusters")) {
        map.addLayer({
          id: "retailers-clusters",
          type: "circle",
          source: "retailers",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#3fa0ff",
            "circle-stroke-color": "#0b0d12",
            "circle-stroke-width": 1.25,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              12, // <= 10
              10,
              18, // 10-24
              25,
              26, // 25+
              35,
            ],
          },
        });
      }

      // Cluster count labels
      if (data && !map.getLayer("retailers-cluster-count")) {
        map.addLayer({
          id: "retailers-cluster-count",
          type: "symbol",
          source: "retailers",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["to-string", ["get", "point_count"]],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": 12,
          },
          paint: {
            "text-color": "#0b0d12",
          },
        });
      }

      // Retailer name labels (optional)
      if (data && !map.getLayer("retailers-labels")) {
        map.addLayer({
          id: "retailers-labels",
          type: "symbol",
          source: "retailers",
          filter: ["!", ["has", "point_count"]],
          layout: {
            "text-field": ["coalesce", ["get", "Name"], ""],
            "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
            "text-size": 11,
            "text-offset": [0, 1.1],
            "text-anchor": "top",
            "text-allow-overlap": false,
            "text-optional": true,
            visibility: showLabels ? "visible" : "none",
          },
          paint: {
            "text-color": labelColor || "#ffe26d",
            "text-halo-color": "#0b0d12",
            "text-halo-width": 0.8,
          },
        });
      }

      // Light raster enhancement for imagery
      if (rasterSharpen) {
        const style = map.getStyle();
        for (const l of style.layers ?? []) {
          if (l.type === "raster") {
            map.setPaintProperty(l.id, "raster-contrast", clamp(0.08, -1, 1));
          }
        }
      }
    };

    // First time + every style change
    map.on("load", ensureLayers);
    map.on("styledata", ensureLayers);

    return () => {
      map.off("error", errorHandler);
      map.remove();
      mapRef.current = null;
    };
  }, [initialStyle, projection, allowRotate, rasterSharpen, wantMapbox, data, mapboxToken, mapStyle, labelColor, markerStyle, showLabels]);

  // ---------- Respond to prop changes that don’t require re-creating map ----------
  // Label visibility + color
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer("retailers-labels")) {
      map.setLayoutProperty(
        "retailers-labels",
        "visibility",
        showLabels ? "visible" : "none"
      );
      map.setPaintProperty("retailers-labels", "text-color", labelColor || "#ffe26d");
    }
  }, [showLabels, labelColor]);

  // Marker style (color switch)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer("retailers-circle")) {
      map.setPaintProperty(
        "retailers-circle",
        "circle-color",
        markerStyle === "color-dot"
          ? ["coalesce", ["get", "Color"], "#ffb703"]
          : "#ffb703"
      );
    }
  }, [markerStyle]);

  // Rotation controls
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (allowRotate) {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
    } else {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    }
  }, [allowRotate]);

  // Projection
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // @ts-ignore (mapbox type doesn’t include this narrow literal)
    map.setProjection(projection);
  }, [projection]);

  // Home marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // remove old
    if (homeMarkerRef.current) {
      homeMarkerRef.current.remove();
      homeMarkerRef.current = null;
    }

    if (home) {
      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "9999px";
      el.style.background = "#22d3ee";
      el.style.boxShadow = "0 0 0 3px rgba(2,8,23,.9)";
      const mk = new mapboxgl.Marker({ element: el }).setLngLat([home.lng, home.lat]).addTo(map);
      homeMarkerRef.current = mk;
    }
  }, [home]);

  // Force fallback via button
  const useOpenBasemap = () => {
    const map = mapRef.current;
    if (!map) return;
    setUsingFallback(true);
    setLoadError(null);
    map.setStyle(OSM_STYLE); // styledata listener will rebuild layers
  };

  return (
    <div className="map-shell" ref={containerRef}>
      {/* Error/Fallback overlay */}
      {(loadError || usingFallback) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "rgba(17,20,27,0.92)",
              border: "1px solid #2a3140",
              borderRadius: 12,
              padding: 18,
              width: 420,
              maxWidth: "95%",
              color: "#e8eef6",
              textAlign: "center",
              pointerEvents: "auto",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Map error</h3>
            <p className="small" style={{ margin: "0 0 12px", color: "#a6b0c3" }}>
              {usingFallback
                ? "Using the open basemap. Labels & markers still work."
                : loadError ??
                  "Map error. (DevTools → Network will show the failing request.)"}
            </p>
            {!usingFallback && (
              <button onClick={useOpenBasemap}>Use open basemap</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
