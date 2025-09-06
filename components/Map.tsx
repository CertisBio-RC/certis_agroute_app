// /components/Map.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { Map as MapboxMap, GeoJSONSource } from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";

// ---------------- Types ----------------

export type RetailerProps = {
  /** short retailer key, used for logo file name like logos/<Retailer>.png */
  Retailer: string;
  /** human-friendly name */
  Name: string;
  /** optional extras used by filters elsewhere */
  State?: string;
  Category?: string;
  [k: string]: any;
};

type HomeLoc = { lng: number; lat: number };

export type Props = {
  /** FeatureCollection of retailer points */
  data?: FeatureCollection<Point, RetailerProps>;
  /** "logo" shows symbol images from /public/logos, "color" shows colored circles */
  markerStyle: "logo" | "color";
  /** draw text labels next to points / clusters */
  showLabels?: boolean;
  /** label color (CSS color) */
  labelColor?: string;
  /** Mapbox style URL (e.g., "mapbox://styles/..." or any raster style) */
  mapStyle: string;
  /** "mercator" for flat map, "globe" for 3D globe */
  projection?: "mercator" | "globe";
  /** allow rotation interaction */
  allowRotate?: boolean;
  /** if true and your basemap supports it, sharpen raster */
  rasterSharpen?: boolean;
  /** explicit token (optional; we also resolve from env/meta) */
  mapboxToken?: string;

  /** Home marker support (optional) */
  home?: HomeLoc | null;
  enableHomePick?: boolean;
  onPickHome?: (lng: number, lat: number) => void;
};

// ---------------- Helpers ----------------

function resolveMapboxToken(explicit?: string) {
  if (explicit && explicit.trim()) return explicit.trim();

  // Next.js inlines NEXT_PUBLIC_* at build time
  // @ts-expect-error NEXT_PUBLIC_* is replaced during build
  if (process?.env?.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN) {
    // @ts-expect-error see above
    return String(process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN);
  }

  if (typeof document !== "undefined") {
    const meta = document
      .querySelector('meta[name="mapbox-token"]')
      ?.getAttribute("content");
    if (meta && meta.trim()) return meta.trim();
  }
  return "";
}

function retailerLogo(prop?: string) {
  if (!prop) return null;
  // no leading slash so it works on GitHub Pages subpath
  return `logos/${prop}.png`;
}

// ---------------- Component ----------------

const MapView: React.FC<Props> = ({
  data,
  markerStyle,
  showLabels = false,
  labelColor = "#ffffff",
  mapStyle,
  projection = "mercator",
  allowRotate = true,
  rasterSharpen = false,
  mapboxToken,
  home = null,
  enableHomePick = false,
  onPickHome,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const isLoadedRef = useRef(false);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Derived IDs so we can re-use sources/layers safely
  const ids = useMemo(() => {
    const base = "retailers";
    return {
      src: `${base}-src`,
      clusterCircle: `${base}-cluster-circle`,
      clusterCount: `${base}-cluster-count`,
      points: `${base}-points`,
      pointLabels: `${base}-point-labels`,
    };
  }, []);

  // init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const token = resolveMapboxToken(mapboxToken);
    mapboxgl.accessToken = token;

    if (!token) {
      console.error("Mapbox token missing.");
      return;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      projection: projection as any, // types allow string or spec, but TS sometimes complains
      pitchWithRotate: allowRotate,
      dragRotate: allowRotate,
      renderWorldCopies: true,
    }) as MapboxMap;

    mapRef.current = map;

    map.on("load", () => {
      isLoadedRef.current = true;

      // Optional raster sharpening
      if (rasterSharpen) {
        try {
          map.setPaintProperty("satellite", "raster-sharpen", 0.25);
        } catch {
          /* style may not have a raster layer named 'satellite' */
        }
      }

      // Add nav + scale controls
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new mapboxgl.ScaleControl({ unit: "imperial" }));

      // Add initial data if provided
      if (data) ensureDataLayers(map, ids, data, { markerStyle, showLabels, labelColor });
      // Place initial home if provided
      ensureHomeMarker(map, home);
    });

    return () => {
      try {
        map.remove();
      } catch {}
      mapRef.current = null;
      isLoadedRef.current = false;
    };
  }, []); // init once

  // react to style / projection / rotation toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;

    // set projection (cast to any to appease types across versions)
    try {
      map.setProjection(projection as any);
    } catch {}

    // rotation
    try {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
      if (!allowRotate) {
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();
        map.setBearing(0);
        map.setPitch(0);
      }
    } catch {}

    // style swap
    if (map.getStyle()?.sprite && map.getStyle().sprite?.startsWith(mapStyle)) {
      // same style, nothing
      return;
    }
    map.setStyle(mapStyle);

    // After style loads again, re-add sources/layers + home
    const onStyle = () => {
      if (data) ensureDataLayers(map, ids, data, { markerStyle, showLabels, labelColor });
      ensureHomeMarker(map, home);
      map.off("styledata", onStyle);
    };
    map.on("styledata", onStyle);
  }, [mapStyle, projection, allowRotate]); // eslint-disable-line react-hooks/exhaustive-deps

  // react to data or rendering options
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    if (data) ensureDataLayers(map, ids, data, { markerStyle, showLabels, labelColor });
  }, [data, markerStyle, showLabels, labelColor]); // eslint-disable-line react-hooks/exhaustive-deps

  // support clicking to select home
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;

    const handle = (e: mapboxgl.MapMouseEvent) => {
      if (!enableHomePick || !onPickHome) return;
      const { lng, lat } = e.lngLat;
      onPickHome(lng, lat);
    };

    if (enableHomePick) map.on("click", handle);
    return () => {
      try {
        map.off("click", handle);
      } catch {}
    };
  }, [enableHomePick, onPickHome]);

  // react to home marker changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    ensureHomeMarker(map, home);
  }, [home]);

  return <div ref={containerRef} className="w-full h-[70vh] rounded-lg overflow-hidden" />;
};

export default MapView;

// ---------------- Internals: sources/layers ----------------

function ensureDataLayers(
  map: MapboxMap,
  ids: { src: string; clusterCircle: string; clusterCount: string; points: string; pointLabels: string },
  fc: FeatureCollection<Point, RetailerProps>,
  opts: { markerStyle: "logo" | "color"; showLabels: boolean; labelColor: string }
) {
  const existing = map.getSource(ids.src) as GeoJSONSource | undefined;

  if (!existing) {
    map.addSource(ids.src, {
      type: "geojson",
      data: fc,
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 40,
    });

    // clusters – circles
    map.addLayer({
      id: ids.clusterCircle,
      type: "circle",
      source: ids.src,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#1976d2", // small clusters
          20,
          "#ef6c00", // medium
          50,
          "#c62828", // large
        ],
        "circle-radius": ["step", ["get", "point_count"], 16, 20, 22, 50, 28],
        "circle-opacity": 0.85,
      },
    });

    // clusters – count labels
    map.addLayer({
      id: ids.clusterCount,
      type: "symbol",
      source: ids.src,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 12,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1,
      },
    });

    // unclustered points
    if (opts.markerStyle === "color") {
      map.addLayer({
        id: ids.points,
        type: "circle",
        source: ids.src,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 6,
          "circle-color": "#e91e63",
          "circle-stroke-color": "#141414",
          "circle-stroke-width": 1,
        },
      });
    } else {
      // symbol with retailer logo
      // sprite-independent images: we add them dynamically per feature as needed
      map.addLayer({
        id: ids.points,
        type: "symbol",
        source: ids.src,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": [
            "coalesce",
            ["image", ["concat", ["literal", "retailer-"], ["get", "Retailer"]]], // runtime added images
            ["literal", ""],
          ],
          "icon-size": 0.25,
          "icon-allow-overlap": true,
        },
      });

      // preload any unique logos we can find (best effort)
      preloadRetailerLogos(map, fc);
    }

    // optional labels next to points
    if (opts.showLabels) {
      map.addLayer({
        id: ids.pointLabels,
        type: "symbol",
        source: ids.src,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["coalesce", ["get", "Name"], ["get", "Retailer"]],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        },
        paint: {
          "text-color": opts.labelColor || "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1.2,
        },
      });
    }
  } else {
    // just update the data + label paint if already present
    existing.setData(fc as any);
    if (map.getLayer(ids.pointLabels)) {
      map.setPaintProperty(ids.pointLabels, "text-color", opts.labelColor || "#ffffff");
    }
    if (opts.markerStyle === "logo") {
      preloadRetailerLogos(map, fc); // keep images in sync if new retailers appear
    }
  }
}

function preloadRetailerLogos(map: MapboxMap, fc: FeatureCollection<Point, RetailerProps>) {
  const retailers = new Set<string>();
  for (const f of fc.features) {
    const r = f.properties?.Retailer;
    if (r) retailers.add(r);
  }
  retailers.forEach((r) => {
    const key = `retailer-${r}`;
    if (map.hasImage(key)) return;
    const url = retailerLogo(r);
    if (!url) return;

    // Load as HTMLImageElement and add to style
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        if (!map.hasImage(key)) map.addImage(key, img, { sdf: false });
      } catch {}
    };
    img.onerror = () => {
      // ignore missing images
    };
    img.src = url;
  });
}

// ---------------- Internals: home marker ----------------

function ensureHomeMarker(map: MapboxMap, home?: HomeLoc | null) {
  // remove any existing
  const anyWin = homeMarkerRefGlobal as { current: mapboxgl.Marker | null };
  if (anyWin.current) {
    try {
      anyWin.current.remove();
    } catch {}
    anyWin.current = null;
  }
  if (!home) return;

  const el = document.createElement("div");
  el.style.width = "18px";
  el.style.height = "18px";
  el.style.borderRadius = "50%";
  el.style.background = "#22c55e";
  el.style.boxShadow = "0 0 0 2px #0f172a";
  el.title = "Home";

  const marker = new mapboxgl.Marker({ element: el, draggable: false })
    .setLngLat([home.lng, home.lat])
    .addTo(map);

  anyWin.current = marker;
}

// a tiny module-level ref to hold the home marker across re-init
const homeMarkerRefGlobal: { current: mapboxgl.Marker | null } = { current: null };
