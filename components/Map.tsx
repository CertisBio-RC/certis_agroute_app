// /components/Map.tsx
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
  Logo?: string;   // e.g. "logos/acme.png" (no leading slash)
  Color?: string;  // hex like "#ff9900" for color-dot mode
};

export type MarkerStyle = "color-dot" | "dot"; // keep it simple and reliable on Pages

type Props = {
  data?: FeatureCollection<Point, RetailerProps>;
  markerStyle: MarkerStyle;
  showLabels: boolean;
  labelColor: string;

  // UI options
  mapStyle: "hybrid" | "satellite" | "streets";
  allowRotate: boolean;
  projection: "mercator" | "globe";
  rasterSharpen: boolean;

  // infra
  mapboxToken: string;

  // Home support
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

  // Guard — show a friendly card if token missing
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

  // Init / re-init when base style or projection changes
  useEffect(() => {
    mapboxgl.accessToken = mapboxToken;

    // destroy old map if any
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
      // base raster tweak
      if (rasterSharpen) {
        const layers = map.getStyle().layers || [];
        for (const l of layers) {
          if (l.type === "raster") {
            // only properties that exist on raster layers
            try {
              // @ts-ignore (older type defs)
              map.setPaintProperty(l.id, "raster-contrast", 0.08);
            } catch {
              /* no-op */
            }
          }
        }
      }

      // add empty source; we'll setData below
      if (!map.getSource("retailers")) {
        map.addSource("retailers", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          } as FeatureCollection<Point, RetailerProps>,
        });
      }

      // circle layer (color or default)
      if (!map.getLayer("retailers-circle")) {
        map.addLayer({
          id: "retailers-circle",
          type: "circle",
          source: "retailers",
          paint: {
            "circle-radius": 5,
            "circle-color":
              markerStyle === "color-dot"
                ? ["coalesce", ["get", "Color"], "#ffb703"]
                : "#ffb703",
            "circle-stroke-color": "#000",
            "circle-stroke-width": 0.6,
          },
        });
      }

      // labels
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

      // set initial data
      if (data) {
        (map.getSource("retailers") as mapboxgl.GeoJSONSource).setData(data);
      }

      // HOME marker
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

  // Update data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource | undefined;
    if (src && data) src.setData(data);
  }, [data]);

  // Update labels visibility / color
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer("retailers-label")) {
      map.setLayoutProperty("retailers-label", "visibility", showLabels ? "visible" : "none");
      map.setPaintProperty("retailers-label", "text-color", labelColor || "#fff200");
    }
  }, [showLabels, labelColor]);

  // Update circle coloring when marker style changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer("retailers-circle")) {
      const paint = markerStyle === "color-dot"
        ? ["coalesce", ["get", "Color"], "#ffb703"]
        : "#ffb703";
      map.setPaintProperty("retailers-circle", "circle-color", paint);
    }
  }, [markerStyle]);

  // Update HOME marker position
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
