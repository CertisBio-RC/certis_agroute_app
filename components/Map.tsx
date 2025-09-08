"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { Map as MapboxMap, LngLatLike, Marker } from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";
import type { MapMouseEvent } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// ---------- Types ----------
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
  id?: string;
};

export type MarkerStyle = "logo" | "dot" | "color-dot";
export type MarkerStyleOpt = MarkerStyle | "logo" | "dot" | "color-dot";
export type HomeLoc = { lng: number; lat: number };

type Props = {
  data?: FeatureCollection<Point, RetailerProps>;
  markerStyle: MarkerStyleOpt;
  showLabels: boolean;
  labelColor: string;
  mapStyle: string; // e.g. "mapbox://styles/mapbox/satellite-streets-v12"
  allowRotate: boolean;
  projection: "mercator" | "globe";
  rasterSharpen: boolean;
  mapboxToken?: string;
  home?: HomeLoc;
  onPickHome?: (lng: number, lat: number) => void;
};

// ---------- Fallback raster style (no token needed) ----------
const OSM_STYLE: any = {
  version: 8,
  // 👇 Add a public glyphs source so text labels can render without Mapbox
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

// ---------- Helpers ----------
function readTokenSync(): string | null {
  if (typeof document !== "undefined") {
    const meta = document.querySelector('meta[name="mapbox-token"]') as HTMLMetaElement | null;
    if (meta?.content) return meta.content;
    const w = window as any;
    if (typeof w.__MAPBOX_TOKEN === "string" && w.__MAPBOX_TOKEN) return w.__MAPBOX_TOKEN;
  }
  if (process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN) return process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN;
  return null;
}
function ensureSource(map: MapboxMap, id: string, spec: any) {
  if (!map.getSource(id)) map.addSource(id, spec);
}
function ensureLayer(map: MapboxMap, spec: mapboxgl.AnyLayer, beforeId?: string) {
  if (!map.getLayer(spec.id)) map.addLayer(spec, beforeId);
}

// ---------- Component ----------
export default function MapView(props: Props) {
  // keep hook order stable
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
  const mapRef = useRef<MapboxMap | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [homeMarker, setHomeMarker] = useState<Marker | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const token = useMemo(() => mapboxToken ?? readTokenSync(), [mapboxToken]);

  // create/destroy
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const startOnFallback = !token;
    if (token) mapboxgl.accessToken = token;

    setMapError(null);

    const map = new mapboxgl.Map({
      container: el,
      style: startOnFallback ? OSM_STYLE : mapStyle,
      center: [-97, 38.5],
      zoom: 3.5,
      cooperativeGestures: true,
      attributionControl: true,
      pitchWithRotate: allowRotate,
      projection: projection === "globe" ? "globe" : "mercator",
    });

    mapRef.current = map;
    setUsingFallback(startOnFallback);

    const onLoad = () => {
      setIsLoaded(true);
      // gentle “sharpen” for raster layers
      for (const l of map.getStyle().layers || []) {
        if (l.type === "raster") {
          try {
            map.setPaintProperty(l.id, "raster-contrast", rasterSharpen ? 0.08 : 0);
          } catch {}
        }
      }
    };
    const onError = (e: any) => {
      const msg =
        e?.error?.message ||
        e?.error?.statusText ||
        (typeof e?.error === "string" ? e.error : "") ||
        "Map error";
      setMapError(msg);
    };

    map.on("load", onLoad);
    map.on("error", onError);

    return () => {
      try {
        map.off("load", onLoad);
        map.off("error", onError);
        map.remove();
      } catch {}
      mapRef.current = null;
      setIsLoaded(false);
    };
  }, [token, mapStyle, allowRotate, projection, rasterSharpen]);

  // switch to fallback (manual)
  const switchToFallback = () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      setMapError(null);
      map.setStyle(OSM_STYLE);
      setUsingFallback(true);
      // When style changes, wait for load again
      const reAdd = () => setIsLoaded(true);
      setIsLoaded(false);
      map.once("load", reAdd);
    } catch (e: any) {
      setMapError(e?.message || "Failed to switch style");
    }
  };

  // data layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded || !data) return;

    ensureSource(map, "retailers", { type: "geojson", data });

    ensureLayer(map, {
      id: "retailers-circle",
      type: "circle",
      source: "retailers",
      paint: {
        "circle-radius": 5,
        "circle-color": "#ffb703",
        "circle-stroke-color": "#111",
        "circle-stroke-width": 1,
      },
    });

    try {
      if (markerStyle === "color-dot") {
        map.setPaintProperty(
          "retailers-circle",
          "circle-color",
          ["coalesce", ["get", "Color"], "#ffb703"] as any
        );
      } else {
        map.setPaintProperty("retailers-circle", "circle-color", "#ffb703");
      }
    } catch {}

    if (showLabels) {
      ensureLayer(
        map,
        {
          id: "retailers-labels",
          type: "symbol",
          source: "retailers",
          layout: {
            "text-field": ["coalesce", ["get", "Name"], ["get", "Retailer"]],
            "text-size": 12,
            "text-offset": [0, 1.0],
            "text-anchor": "top",
          },
          paint: {
            "text-color": labelColor || "#fff200",
            "text-halo-color": "#111",
            "text-halo-width": 1.2,
          },
        },
        "retailers-circle"
      );
    } else if (map.getLayer("retailers-labels")) {
      map.removeLayer("retailers-labels");
    }
  }, [isLoaded, data, markerStyle, showLabels, labelColor]);

  // home marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;

    if (!home) {
      if (homeMarker) {
        homeMarker.remove();
        setHomeMarker(null);
      }
      return;
    }
    let mk = homeMarker;
    if (!mk) {
      mk = new mapboxgl.Marker({ color: "#00d084" });
      setHomeMarker(mk);
    }
    mk!.setLngLat([home.lng, home.lat] as LngLatLike).addTo(map);
  }, [isLoaded, home]);

  // pick home
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded || !onPickHome) return;
    const handler = (e: MapMouseEvent) => onPickHome(e.lngLat.lng, e.lngLat.lat);
    map.on("dblclick", handler);
    return () => {
      try {
        map.off("dblclick", handler);
      } catch {}
    };
  }, [isLoaded, onPickHome]);

  const tokenMissing = !token;

  return (
    <div className="map-shell">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {(tokenMissing || mapError) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(0,0,0,0.6)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              background: "#171a21",
              border: "1px solid #2a3140",
              padding: 16,
              borderRadius: 12,
              color: "#e8eef6",
              maxWidth: 560,
            }}
          >
            <h3 style={{ marginTop: 0 }}>{tokenMissing ? "Mapbox token not found" : "Map error"}</h3>
            {tokenMissing ? (
              <p>
                Provide <code>NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN</code> or the{' '}
                <code>&lt;meta name="mapbox-token" /&gt;</code> in <code>app/layout.tsx</code>.
              </p>
            ) : (
              <>
                <p className="small">
                  {mapError}
                  <br />
                  (DevTools → Network will show the failing request. 401/403 usually means token
                  scope or URL restriction.)
                </p>
                {!usingFallback && (
                  <button onClick={switchToFallback} style={{ marginTop: 8 }}>
                    Use open basemap
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
