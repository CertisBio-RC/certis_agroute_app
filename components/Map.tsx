"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { Map as MapboxMap, LngLatLike, AnySourceData, AnyLayer } from "mapbox-gl";
import type { FeatureCollection, Feature, Point } from "geojson";

/** Props carried by each retailer feature */
export type RetailerProps = {
  Retailer: string;
  Name: string;
  City?: string;
  State?: string;
  Category?: string;
  Address?: string;
  Phone?: string;
  Website?: string;
  /** optional marker color (hex) */
  Color?: string;
  /** optional local logo path (relative to /public) */
  Logo?: string;
};

export type MarkerStyleOpt = "color-dot" | "dot" | "logo";

type ProjectionOpt = "mercator" | "globe";

type MapStyleOpt = "hybrid" | "satellite" | "streets";

type HomeLoc = { lng: number; lat: number };

type Props = {
  data?: FeatureCollection<Point, RetailerProps>;
  markerStyle: MarkerStyleOpt;
  showLabels: boolean;
  labelColor: string;
  mapStyle: MapStyleOpt;
  projection: ProjectionOpt;
  allowRotate: boolean;
  rasterSharpen: boolean;
  mapboxToken?: string;
  home?: HomeLoc;
  onPickHome?: (lng: number, lat: number) => void;
};

mapboxgl.accessToken = ""; // never hardcode; we inject token at runtime

/** OSM fallback style (works without a token) */
const OSM_STYLE: any = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    } as AnySourceData,
  },
  layers: [
    { id: "osm", type: "raster", source: "osm" } as AnyLayer,
  ],
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default function MapView({
  data,
  markerStyle,
  showLabels,
  labelColor,
  mapStyle,
  projection,
  allowRotate,
  rasterSharpen,
  mapboxToken,
  home,
  onPickHome,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const tokenRef = useRef<string | undefined>(mapboxToken || undefined);

  /** Build the desired base style spec depending on token & dropdown */
  const baseStyle = useMemo(() => {
    if (tokenRef.current) {
      const styleByKey: Record<MapStyleOpt, string> = {
        hybrid: "mapbox://styles/mapbox/satellite-streets-v12",
        satellite: "mapbox://styles/mapbox/satellite-v9",
        streets: "mapbox://styles/mapbox/streets-v12",
      };
      return styleByKey[mapStyle];
    }
    return OSM_STYLE;
  }, [mapStyle]);

  /** Init map once */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // If a token exists, feed it to mapbox-gl
    if (mapboxToken) {
      mapboxgl.accessToken = mapboxToken;
      tokenRef.current = mapboxToken;
    }

    const m = new mapboxgl.Map({
      container: containerRef.current,
      style: baseStyle as any,
      center: [-97, 38.5],
      zoom: 4,
      pitchWithRotate: allowRotate,
      attributionControl: true,
    });
    mapRef.current = m;

    m.on("load", () => setLoaded(true));

    // When style changes (Mapbox or OSM), rebuild our data layers
    const rebuild = () => {
      if (!mapRef.current) return;
      addOrReplaceRetailerLayers(mapRef.current, data, markerStyle, showLabels, labelColor);

      // tweak raster sharpness for imagery styles (no-op on OSM if layer not raster)
      if (rasterSharpen) {
        safeSharpenRasters(mapRef.current);
      }
    };
    m.on("styledata", rebuild);
    m.on("load", rebuild);

    // dbl-click to set Home
    if (onPickHome) {
      const dbl = (e: mapboxgl.MapMouseEvent) => onPickHome(e.lngLat.lng, e.lngLat.lat);
      m.on("dblclick", dbl);
      return () => {
        m.off("dblclick", dbl);
        m.remove();
      };
    }

    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** React to base style changes (Mapbox vs OSM, or style dropdown) */
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    // projection
    try {
      m.setProjection(projection);
    } catch {}
    // rotation
    try {
      m.dragRotate.enable();
      m.touchZoomRotate.enableRotation();
      if (!allowRotate) {
        m.dragRotate.disable();
        m.touchZoomRotate.disableRotation();
        m.setBearing(0);
        m.setPitch(0);
      }
    } catch {}

    // swap style: this triggers our 'styledata' listener which rebuilds layers
    try {
      m.setStyle(baseStyle as any);
    } catch (err) {
      console.warn("setStyle failed; keeping previous base style", err);
    }
  }, [baseStyle, projection, allowRotate]);

  /** React to data & viz options */
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded) return;
    addOrReplaceRetailerLayers(m, data, markerStyle, showLabels, labelColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, markerStyle, showLabels, labelColor, loaded]);

  /** Keep home marker in sync */
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded) return;

    // remove existing
    const id = "__home_marker";
    const el = document.getElementById(id);
    if (el?.parentElement) el.parentElement.removeChild(el);

    if (home) {
      const node = document.createElement("div");
      node.id = id;
      node.style.width = "18px";
      node.style.height = "18px";
      node.style.borderRadius = "50%";
      node.style.background = "#22d3ee";
      node.style.border = "2px solid #0ea5e9";
      new mapboxgl.Marker({ element: node }).setLngLat([home.lng, home.lat] as LngLatLike).addTo(m);
    }
  }, [home, loaded]);

  return (
    <div className="map-shell">
      {!tokenRef.current && (
        <div className="p-3 text-sm text-amber-300/90">
          <h3 className="font-semibold mb-1">Mapbox token not provided</h3>
          <p className="opacity-80">
            Falling back to OSM raster tiles. Labels and clustering still work, but Mapbox vector styles won’t be
            available.
          </p>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
      <div className="map-footer">
        <span>Use two fingers to move the map</span>
        <span>Use ctrl + scroll to zoom the map</span>
      </div>
    </div>
  );
}

/** (Re)create our data source and layers */
function addOrReplaceRetailerLayers(
  map: MapboxMap,
  data: FeatureCollection<Point, RetailerProps> | undefined,
  markerStyle: MarkerStyleOpt,
  showLabels: boolean,
  labelColor: string
) {
  // remove old layers/sources if present
  ["retailers-labels", "retailers-circle", "retailers-src"].forEach((id) => {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {}
    try {
      if (map.getSource(id)) map.removeSource(id);
    } catch {}
  });

  if (!data) return;

  map.addSource("retailers-src", { type: "geojson", data });

  // circle dots
  map.addLayer({
    id: "retailers-circle",
    type: "circle",
    source: "retailers-src",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3, 2.2,
        6, 3.5,
        10, 5,
        14, 7,
      ],
      "circle-color":
        markerStyle === "color-dot"
          ? ["coalesce", ["get", "Color"], "#ffb703"]
          : "#ffb703",
      "circle-stroke-color": "#222",
      "circle-stroke-width": 0.7,
      "circle-opacity": 0.95,
    },
  });

  if (showLabels) {
    map.addLayer({
      id: "retailers-labels",
      type: "symbol",
      source: "retailers-src",
      layout: {
        "text-field": ["coalesce", ["get", "Name"], ["get", "Retailer"]],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3, 8,
          6, 10,
          10, 12,
          14, 14,
        ],
        "text-allow-overlap": false,
        "text-optional": true,
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-offset": [0, 1.2],
        "text-anchor": "top",
      },
      paint: {
        "text-color": labelColor || "#fff200",
        "text-halo-color": "#111",
        "text-halo-width": 1.2,
      },
    });
  }
}

/** Gently boost raster clarity if the current style uses raster layers */
function safeSharpenRasters(map: MapboxMap) {
  try {
    const style = map.getStyle();
    for (const l of style.layers || []) {
      if (l.type === "raster") {
        map.setPaintProperty(l.id, "raster-contrast", clamp(0.08, -1, 1));
      }
    }
  } catch {}
}
