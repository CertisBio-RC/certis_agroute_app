// components/Map.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { FeatureCollection, Feature, Point } from "geojson";

// ---------- Types exported for page.tsx ----------
export type MarkerStyleOpt = "dot" | "circle";
export type HomeLoc = { lng: number; lat: number };

export type RetailerProps = {
  Retailer: string;
  Name: string;
  City?: string;
  State?: string;
  Category?: string;
  Address?: string;
  Phone?: string;
  Website?: string;
  Logo?: string;   // normalized (no leading slash)
  Color?: string;  // optional hex or named color
};

// ---------- Component Props ----------
type Props = {
  data?: FeatureCollection<Point, RetailerProps>;
  markerStyle: MarkerStyleOpt;
  showLabels: boolean;
  labelColor: string; // CSS color
  mapStyle: "streets" | "satellite" | "hybrid";
  allowRotate: boolean;
  projection: "mercator" | "globe"; // keep it simple/stable
  rasterSharpen: boolean; // we apply a gentle raster-contrast on raster layers
  mapboxToken?: string;   // if empty -> fallback OSM raster style
  home?: HomeLoc;
  onPickHome?: (lng: number, lat: number) => void; // set on dblclick
};

// ---------- Small helpers ----------
const OSM_RASTER_STYLE = {
  version: 8,
  name: "OSM Raster",
  sources: {
    "osm-tiles": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: "osm-tiles",
      type: "raster",
      source: "osm-tiles",
    },
  ],
  // set glyphs so symbol layers (labels) work
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
} as const;

function getMapboxStyle(style: Props["mapStyle"], token?: string): string | object {
  if (!token) return OSM_RASTER_STYLE;
  // Mapbox styles
  const v12 = "v12";
  switch (style) {
    case "streets":
      return `mapbox://styles/mapbox/streets-${v12}`;
    case "satellite":
      return "mapbox://styles/mapbox/satellite-v9";
    case "hybrid":
    default:
      return `mapbox://styles/mapbox/satellite-streets-${v12}`;
  }
}

function fitToData(map: mapboxgl.Map, fc: FeatureCollection<Point, RetailerProps>) {
  if (!fc.features || fc.features.length === 0) return;
  const bounds = new mapboxgl.LngLatBounds();
  for (const f of fc.features) {
    if (f.geometry?.type === "Point" && Array.isArray(f.geometry.coordinates)) {
      const [lng, lat] = f.geometry.coordinates;
      if (Number.isFinite(lng) && Number.isFinite(lat)) bounds.extend([lng, lat]);
    }
  }
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 40, duration: 0 });
  }
}

function ensureRetailerSource(map: mapboxgl.Map, data?: FeatureCollection<Point, RetailerProps>) {
  const id = "retailers";
  if (map.getSource(id)) {
    (map.getSource(id) as mapboxgl.GeoJSONSource).setData(data || { type: "FeatureCollection", features: [] });
    return;
  }
  map.addSource(id, {
    type: "geojson",
    data: data || { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterRadius: 40,
    clusterMaxZoom: 12,
  });
}

function addOrUpdateLayers(
  map: mapboxgl.Map,
  markerStyle: MarkerStyleOpt,
  showLabels: boolean,
  labelColor: string
) {
  // Remove old layers if present (order matters: remove children first)
  const maybeRemove = (id: string) => {
    if (map.getLayer(id)) map.removeLayer(id);
  };

  maybeRemove("retailers-labels");
  maybeRemove("retailers-circle");
  maybeRemove("retailers-dot");
  maybeRemove("clusters-count");
  maybeRemove("clusters");
  maybeRemove("unclustered");

  // Cluster circle layer
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "retailers",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#5bbcff",
        25,
        "#4299e1",
        100,
        "#2b6cb0",
      ],
      "circle-radius": ["step", ["get", "point_count"], 14, 25, 20, 100, 26],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#152232",
    },
  });

  // Cluster count
  map.addLayer({
    id: "clusters-count",
    type: "symbol",
    source: "retailers",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12,
      "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
    },
    paint: {
      "text-color": "#ffffff",
    },
  });

  // Unclustered points (base)
  map.addLayer({
    id: "unclustered",
    type: "circle",
    source: "retailers",
    filter: ["!", ["has", "point_count"]],
    paint: {
      // default Point layer paint; we may hide it depending on markerStyle
      "circle-radius": 6,
      "circle-color": [
        "case",
        ["has", "Color"],
        ["get", "Color"],
        "#ffb703",
      ],
      "circle-stroke-color": "#0b1220",
      "circle-stroke-width": 1.5,
    },
  });

  // Marker style refinement
  if (markerStyle === "dot") {
    // smaller dot
    map.addLayer({
      id: "retailers-dot",
      type: "circle",
      source: "retailers",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": 3.5,
        "circle-color": [
          "case",
          ["has", "Color"],
          ["get", "Color"],
          "#ffb703",
        ],
        "circle-stroke-color": "#0b1220",
        "circle-stroke-width": 1,
      },
    });
    // Hide the base unclustered circle (we replace it with the smaller dot)
    map.setLayoutProperty("unclustered", "visibility", "none");
  } else {
    // "circle" -> keep the base "unclustered" layer visible
    map.setLayoutProperty("unclustered", "visibility", "visible");
  }

  // Labels (optional)
  if (showLabels) {
    map.addLayer({
      id: "retailers-labels",
      type: "symbol",
      source: "retailers",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "text-field": [
          "coalesce",
          ["get", "Name"],
          ["get", "Retailer"],
          "—",
        ],
        "text-size": 11,
        "text-offset": [0, 1],
        "text-anchor": "top",
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      },
      paint: {
        "text-color": labelColor || "#fff200",
        "text-halo-color": "rgba(0,0,0,0.65)",
        "text-halo-width": 1.2,
      },
    });
  }
}

function applyRasterTweak(map: mapboxgl.Map, enable: boolean) {
  // Gentle contrast tweak on raster layers only (works on OSM raster and Mapbox satellite)
  const layers = map.getStyle().layers || [];
  for (const l of layers) {
    if (l.type === "raster") {
      map.setPaintProperty(l.id, "raster-contrast", enable ? 0.08 : 0);
    }
  }
}

function ensureHomeMarker(
  map: mapboxgl.Map,
  markerRef: React.MutableRefObject<mapboxgl.Marker | null>,
  home?: HomeLoc
) {
  // remove if no home
  if (!home) {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    return;
  }
  const el = document.createElement("div");
  el.style.width = "10px";
  el.style.height = "10px";
  el.style.borderRadius = "50%";
  el.style.background = "#00ffd5";
  el.style.boxShadow = "0 0 0 2px #0b1220";
  el.title = "Home";
  const options: mapboxgl.MarkerOptions = { element: el };
  if (markerRef.current) {
    markerRef.current.setLngLat([home.lng, home.lat]);
  } else {
    markerRef.current = new mapboxgl.Marker(options).setLngLat([home.lng, home.lat]).addTo(map);
  }
}

// ---------- Component ----------
export default function MapView(props: Props) {
  const {
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
    onPickHome,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const lastStyleKey = useRef<string>(""); // to avoid duplicate rebuilds

  // Configure access token (when applicable)
  useMemo(() => {
    if (mapboxToken) {
      (mapboxgl as any).accessToken = mapboxToken;
    }
  }, [mapboxToken]);

  // Initialize once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const styleObj = getMapboxStyle(mapStyle, mapboxToken);

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleObj as any,
      center: [-96.9, 38.5], // USA-ish
      zoom: 4,
      pitchWithRotate: allowRotate,
      dragRotate: allowRotate,
      attributionControl: true,
    });

    mapRef.current = map;

    map.once("load", () => {
      // Set projection
      try {
        map.setProjection(projection);
      } catch {
        /* ignore if not supported in this build */
      }

      // Source + layers
      ensureRetailerSource(map, data);
      addOrUpdateLayers(map, markerStyle, showLabels, labelColor);
      applyRasterTweak(map, rasterSharpen);

      // Fit
      if (data && data.features?.length) {
        fitToData(map, data);
      }
    });

    // Double-click to pick home (optional)
    if (onPickHome) {
      const handler = (e: mapboxgl.MapMouseEvent) => {
        onPickHome(e.lngLat.lng, e.lngLat.lat);
      };
      map.on("dblclick", handler);
      return () => {
        map.off("dblclick", handler);
        map.remove();
      };
    }

    // Cleanup if no dblclick handler return
    return () => {
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // init once

  // Style switcher
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const styleObj = getMapboxStyle(mapStyle, mapboxToken);
    const key = typeof styleObj === "string" ? styleObj : JSON.stringify(styleObj);
    if (key === lastStyleKey.current) return;
    lastStyleKey.current = key;

    map.setStyle(styleObj as any);

    const onStyle = () => {
      try {
        map.setProjection(projection);
      } catch {
        /* ignore */
      }
      ensureRetailerSource(map, data);
      addOrUpdateLayers(map, markerStyle, showLabels, labelColor);
      applyRasterTweak(map, rasterSharpen);
      if (data && data.features?.length) {
        fitToData(map, data);
      }
      // home marker after style reload
      ensureHomeMarker(map, homeMarkerRef, home);
    };

    map.once("styledata", onStyle);
    return () => {
      map.off("styledata", onStyle as any);
    };
  }, [mapStyle, mapboxToken, projection, data, markerStyle, showLabels, labelColor, rasterSharpen, home]);

  // Update dataset only (no style change)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureRetailerSource(map, data);
    // keep layers alive, just refit optionally
    if (data && data.features?.length) {
      fitToData(map, data);
    }
  }, [data]);

  // Update label visibility/color / marker style without rebuilding the world
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // Rebuild the point layers to switch between dot/circle & labels cleanly
    addOrUpdateLayers(map, markerStyle, showLabels, labelColor);
  }, [markerStyle, showLabels, labelColor]);

  // Raster tweak toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyRasterTweak(map, rasterSharpen);
  }, [rasterSharpen]);

  // Rotation enable/disable
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.dragRotate.enable();
    map.touchZoomRotate.enableRotation();
    if (!allowRotate) {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    }
  }, [allowRotate]);

  // Projection change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    try {
      map.setProjection(projection);
    } catch {
      /* ignore */
    }
  }, [projection]);

  // Home marker update
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureHomeMarker(map, homeMarkerRef, home);
  }, [home]);

  // Token hint
  const hasToken = Boolean(mapboxToken);

  return (
    <div className="map-shell" style={{ minHeight: 480, position: "relative" }}>
      {!hasToken && (
        <div
          style={{
            position: "absolute",
            inset: 12,
            zIndex: 2,
            background: "rgba(10,16,26,0.9)",
            border: "1px solid #2a3140",
            borderRadius: 12,
            padding: 12,
            color: "#e8eef6",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Mapbox token not provided</h3>
          <p className="small muted">
            Falling back to OSM raster tiles. Labels and clustering still work,
            but Mapbox vector styles won’t be available.
          </p>
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div className="map-footer">
        <span className="muted">Scroll to zoom • drag to pan • dbl-click to set Home</span>
      </div>
    </div>
  );
}
