"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map as MapboxMap, LngLatLike } from "mapbox-gl";
import type { FeatureCollection, Feature, Point } from "geojson";

export type RetailerProps = {
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
};

export type MarkerStyle = "color-dot" | "dot";

type Props = {
  data?: FeatureCollection<Point, RetailerProps>;
  markerStyle: MarkerStyle;
  showLabels: boolean;
  labelColor: string;

  mapStyle: "hybrid" | "satellite" | "streets";
  allowRotate: boolean;
  projection: "mercator" | "globe";
  rasterSharpen: boolean;

  mapboxToken: string;

  home?: { lng: number; lat: number };
};

function styleUrl(style: Props["mapStyle"]): string {
  switch (style) {
    case "hybrid":
      return "mapbox://styles/mapbox/satellite-streets-v12";
    case "satellite":
      return "mapbox://styles/mapbox/satellite-v9";
    default:
      return "mapbox://styles/mapbox/streets-v12";
  }
}

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
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  if (!mapboxToken) {
    return (
      <div className="map-shell grid place-items-center">
        <div className="rounded-xl border border-gray-800/40 bg-black px-6 py-5 text-gray-200">
          <h2 className="mb-2 text-xl font-semibold">Mapbox token not found</h2>
          <p className="text-sm opacity-80">
            Provide <code className="px-1 bg-white/10 rounded">NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN</code>{" "}
            (env) or the meta tag in <code>app/layout.tsx</code>.
          </p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    mapboxgl.accessToken = mapboxToken;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = new mapboxgl.Map({
      container: mapNode.current as HTMLDivElement,
      style: styleUrl(mapStyle),
      center: [-97, 38.35],
      zoom: 3.7,
      attributionControl: false,
      pitchWithRotate: allowRotate,
      dragRotate: allowRotate,
      cooperativeGestures: true,
      projection: { name: projection },
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    map.on("load", () => {
      if (rasterSharpen) {
        const layers = map.getStyle().layers || [];
        for (const l of layers) {
          if (l.type === "raster") {
            try {
              // @ts-ignore older defs
              map.setPaintProperty(l.id, "raster-contrast", 0.08);
            } catch {}
          }
        }
      }

      if (!map.getSource("retailers")) {
        map.addSource("retailers", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          } as FeatureCollection<Point, RetailerProps>,
        });
      }

      if (!map.getLayer("retailers-circle")) {
        map.addLayer({
          id: "retailers-circle",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 5,
            // Cast the expression to any to satisfy TS in strict mode
            "circle-color": (markerStyle === "color-dot"
              ? ["coalesce", ["get", "Color"], "#ffb703"]
              : "#ffb703") as any,
            "circle-stroke-color": "#000",
            "circle-stroke-width": 0.6,
          },
        });
      }

      if (!map.getLayer("retailers-label")) {
        map.addLayer({
          id: "retailers-label",
          type: "symbol",
          source: "retailers",
          layout: {
            "text-field": ["get", "Name"],
            "text-size": 10,
            "text-offset": [0, 1.2],
            "text-anchor": "top",
            "text-allow-overlap": false,
            "text-optional": true,
            visibility: showLabels ? "visible" : "none",
          },
          paint: {
            "text-color": labelColor || "#fff200",
            "text-halo-color": "#000000",
            "text-halo-width": 1.2,
          },
        });
      }

      if (data) {
        (map.getSource("retailers") as mapboxgl.GeoJSONSource).setData(data);
      }

      if (home) {
        if (homeMarkerRef.current) {
          homeMarkerRef.current.remove();
          homeMarkerRef.current = null;
        }
        homeMarkerRef.current = new mapboxgl.Marker({ color: "#00e0ff" })
          .setLngLat([home.lng, home.lat] as LngLatLike)
          .addTo(map);
      }
    });

    mapRef.current = map;

    return () => {
      if (homeMarkerRef.current) {
        homeMarkerRef.current.remove();
        homeMarkerRef.current = null;
      }
      map.remove();
    };
  }, [mapStyle, projection, allowRotate, rasterSharpen, mapboxToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource | undefined;
    if (src && data) src.setData(data);
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer("retailers-label")) {
      map.setLayoutProperty("retailers-label", "visibility", showLabels ? "visible" : "none");
      map.setPaintProperty("retailers-label", "text-color", labelColor || "#fff200");
    }
  }, [showLabels, labelColor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer("retailers-circle")) {
      const paint =
        markerStyle === "color-dot"
          ? (["coalesce", ["get", "Color"], "#ffb703"] as any)
          : ("#ffb703" as any);
      // Cast to any to satisfy TS signature
      map.setPaintProperty("retailers-circle", "circle-color", paint as any);
    }
  }, [markerStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (home) {
      if (!homeMarkerRef.current) {
        homeMarkerRef.current = new mapboxgl.Marker({ color: "#00e0ff" })
          .setLngLat([home.lng, home.lat] as LngLatLike)
          .addTo(map);
      } else {
        homeMarkerRef.current.setLngLat([home.lng, home.lat] as LngLatLike);
      }
    } else {
      if (homeMarkerRef.current) {
        homeMarkerRef.current.remove();
        homeMarkerRef.current = null;
      }
    }
  }, [home]);

  return <div ref={mapNode} className="map-shell" />;
}
