"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { Map as MapboxMap, LngLatLike, Marker } from "mapbox-gl";
import type { FeatureCollection, Feature, Point } from "geojson";
import type { MapMouseEvent } from "mapbox-gl"; // <-- fix: use MapMouseEvent

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
  mapStyle: string;
  allowRotate: boolean;
  projection: "mercator" | "globe";
  rasterSharpen: boolean;
  mapboxToken?: string;
  home?: HomeLoc;
  onPickHome?: (lng: number, lat: number) => void;
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
  onPickHome,
}: Props) {
  // Unconditional hooks (fixes React #310)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [homeMarker, setHomeMarker] = useState<Marker | null>(null);

  const token = useMemo(() => mapboxToken ?? readTokenSync(), [mapboxToken]);

  // Create / destroy map
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    if (!token) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: el,
      style: mapStyle,
      center: [-97, 38.5],
      zoom: 3.5,
      attributionControl: true,
      cooperativeGestures: true,
      pitchWithRotate: allowRotate,
      interactive: true,
      projection: projection === "globe" ? "globe" : "mercator",
    });

    mapRef.current = map;
    map.on("load", () => {
      setIsLoaded(true);
      // gentle raster contrast
      for (const l of map.getStyle().layers || []) {
        if (l.type === "raster") {
          try {
            map.setPaintProperty(l.id, "raster-contrast", rasterSharpen ? 0.08 : 0);
          } catch {}
        }
      }
    });

    return () => {
      try {
        map.remove();
      } catch {}
      mapRef.current = null;
      setIsLoaded(false);
    };
  }, [token, mapStyle, allowRotate, projection, rasterSharpen]);

  // Source & layers
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
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": labelColor || "#fff200",
            "text-halo-color": "#111",
            "text-halo-width": 1.2,
          },
        },
        "retailers-circle"
      );
    } else {
      if (map.getLayer("retailers-labels")) map.removeLayer("retailers-labels");
    }
  }, [isLoaded, data, markerStyle, showLabels, labelColor]);

  // Home marker
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

  // Pick home (double-click)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded || !onPickHome) return;

    const handler = (e: MapMouseEvent) => {
      onPickHome(e.lngLat.lng, e.lngLat.lat);
    };
    map.on("dblclick", handler);
    return () => {
      try {
        map.off("dblclick", handler);
      } catch {}
    };
  }, [isLoaded, onPickHome]);

  return (
    <div className="map-shell">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {!token && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(0,0,0,0.6)",
          }}
        >
          <div
            style={{
              background: "#171a21",
              border: "1px solid #2a3140",
              padding: 16,
              borderRadius: 12,
              color: "#e8eef6",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Mapbox token not found</h3>
            <p>
              Provide <code>NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN</code> (env) or add the meta tag in{" "}
              <code>app/layout.tsx</code>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
