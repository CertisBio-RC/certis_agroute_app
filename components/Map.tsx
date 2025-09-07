// components/Map.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import type { Feature, FeatureCollection, Point } from "geojson";

// ---- Types you use elsewhere -------------------------------------------------
export interface RetailerProps {
  Retailer: string;     // e.g., "Nutrien", "Wilbur-Ellis"
  Name: string;         // store name or location name
  City?: string;
  State?: string;
  Category?: string;
  Address?: string;
  Phone?: string;
  Website?: string;
}

export type RetailerFC = FeatureCollection<Point, RetailerProps>;

export interface HomeLoc {
  lng: number;
  lat: number;
}

// Limit to strings that Mapbox accepts cleanly without casting hacks
type ProjectionName = "mercator" | "globe";

// ---- Component props ---------------------------------------------------------
interface Props {
  data?: RetailerFC;
  markerStyle: "logo" | "color";
  showLabels: boolean;
  labelColor: string;
  mapStyle: string;                    // style URL
  projection?: ProjectionName;         // "mercator" | "globe"
  allowRotate?: boolean;
  rasterSharpen?: boolean;             // if true, gently tweak raster contrast/saturation
  mapboxToken: string;
  pickHomeMode?: boolean;
  onPickHome?: (lng: number, lat: number) => void;
  home?: HomeLoc | null;
  className?: string;
  style?: React.CSSProperties;
}

// ---- Small helpers -----------------------------------------------------------
function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// Build a fairly stable ID prefix so we don’t collide with any other maps on page
const ID = "retailers";
const SRC_ID = `${ID}-src`;
const CIRCLE_ID = `${ID}-circles`;
const LABEL_ID = `${ID}-labels`;

// We’ll keep HTML <Marker>s for the “logo” mode here, to clean them up on changes
type LogoMarker = { marker: mapboxgl.Marker; id: string };
function makeLogoEl(src: string, title: string) {
  const size = 28;
  const el = document.createElement("div");
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = "50%";
  el.style.overflow = "hidden";
  el.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.45)";
  el.style.background = "#fff";
  el.title = title;

  const img = document.createElement("img");
  img.src = src;
  img.alt = title;
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "contain";
  el.appendChild(img);

  return el;
}

// ---- Map component -----------------------------------------------------------
const MapView: React.FC<Props> = ({
  data,
  markerStyle,
  showLabels,
  labelColor,
  mapStyle,
  projection = "mercator",
  allowRotate = false,
  rasterSharpen = false,
  mapboxToken,
  pickHomeMode = false,
  onPickHome,
  home = null,
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const isLoadedRef = useRef(false);

  const logoMarkersRef = useRef<LogoMarker[]>([]);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Ensure token
  useMemo(() => {
    mapboxgl.accessToken = mapboxToken || "";
  }, [mapboxToken]);

  // Init map
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      projection,
      // viewport defaults – tweak as you like
      center: [-95.9, 39.5],
      zoom: 3.6,
      attributionControl: true,
      cooperativeGestures: true,
    });

    mapRef.current = map;

    // Basic controls
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true, showZoom: true }), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "imperial", maxWidth: 160 }), "bottom-left");

    // Rotation interaction
    if (allowRotate) map.dragRotate.enable();
    else map.dragRotate.disable();

    map.on("load", () => {
      isLoadedRef.current = true;

      // Optional raster tweaks – only for raster layers Mapbox knows about
      if (rasterSharpen) {
        const layers = map.getStyle().layers || [];
        for (const l of layers) {
          if (l.type === "raster") {
            // NOTE: "raster-sharpness" is not a Mapbox GL JS paint prop; omit to satisfy types/runtime.
            map.setPaintProperty(l.id, "raster-contrast", clamp(0.08, -1, 1));
            map.setPaintProperty(l.id, "raster-saturation", clamp(0.06, -1, 1));
          }
        }
      }

      // Source + default layers
      ensureSource(map, data);
      ensureVectorLayers(map, markerStyle, showLabels, labelColor);

      // If logo mode, build HTML markers
      if (markerStyle === "logo" && data) {
        rebuildLogoMarkers(map, data, logoMarkersRef);
      }

      // Home marker (if provided)
      ensureHomeMarker(map, home);
    });

    return () => {
      // Cleanup markers first to avoid dangling DOM
      clearLogoMarkers(logoMarkersRef);
      if (homeMarkerRef.current) {
        try { homeMarkerRef.current.remove(); } catch {}
        homeMarkerRef.current = null;
      }
      isLoadedRef.current = false;
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
  }, []); // mount once

  // Projection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    try {
      map.setProjection(projection);
    } catch { /* ignore */ }
  }, [projection]);

  // Rotate interaction
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    if (allowRotate) map.dragRotate.enable();
    else map.dragRotate.disable();
  }, [allowRotate]);

  // Style change (basemap)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // When we change style URL, Mapbox rebuilds layers; re-add things on 'styledata'/'load'
    let reattach = () => {
      if (!isLoadedRef.current) return;
      ensureSource(map, data);
      ensureVectorLayers(map, markerStyle, showLabels, labelColor);
      // Logo markers need to be rebuilt (because style reset nukes symbol layers we’re not using for logos anyway)
      clearLogoMarkers(logoMarkersRef);
      if (markerStyle === "logo" && data) rebuildLogoMarkers(map, data, logoMarkersRef);
      ensureHomeMarker(map, home);
    };

    map.setStyle(mapStyle);
    map.once("load", () => {
      isLoadedRef.current = true;
      if (rasterSharpen) {
        const layers = map.getStyle().layers || [];
        for (const l of layers) {
          if (l.type === "raster") {
            map.setPaintProperty(l.id, "raster-contrast", clamp(0.08, -1, 1));
            map.setPaintProperty(l.id, "raster-saturation", clamp(0.06, -1, 1));
          }
        }
      }
      reattach();
    });

    return () => {
      // noop
    };
  }, [mapStyle]);

  // Data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;

    ensureSource(map, data);

    // Vector layers react to showLabels/labelColor/markerStyle
    ensureVectorLayers(map, markerStyle, showLabels, labelColor);

    // Rebuild logo markers when data or style changes & we’re in logo mode
    clearLogoMarkers(logoMarkersRef);
    if (markerStyle === "logo" && data) rebuildLogoMarkers(map, data, logoMarkersRef);
  }, [data, markerStyle, showLabels, labelColor]);

  // Pick-home mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;

    const handle = (e: mapboxgl.MapMouseEvent) => {
      if (!pickHomeMode || !onPickHome) return;
      const { lng, lat } = e.lngLat;
      onPickHome(lng, lat);
    };

    if (pickHomeMode) {
      map.getCanvas().style.cursor = "crosshair";
      map.on("click", handle);
    } else {
      map.getCanvas().style.cursor = "";
      map.off("click", handle);
    }

    return () => {
      try { map.off("click", handle); } catch {}
      if (map && !pickHomeMode) map.getCanvas().style.cursor = "";
    };
  }, [pickHomeMode, onPickHome]);

  // Home marker updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    ensureHomeMarker(map, home);
  }, [home]);

  return (
    <div className={className} style={{ position: "relative", ...style }}>
      <div ref={containerRef} className="w-full h-[640px] rounded-lg overflow-hidden" />
    </div>
  );
};

export default MapView;

// ---- Map helpers -------------------------------------------------------------

function ensureSource(map: MapboxMap, fc?: RetailerFC) {
  const existing = map.getSource(SRC_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!fc) {
    // If no data, remove source & layers if they exist
    if (map.getLayer(CIRCLE_ID)) map.removeLayer(CIRCLE_ID);
    if (map.getLayer(LABEL_ID)) map.removeLayer(LABEL_ID);
    if (existing) map.removeSource(SRC_ID);
    return;
  }

  if (!existing) {
    map.addSource(SRC_ID, {
      type: "geojson",
      data: fc,
    });
  } else {
    existing.setData(fc);
  }
}

function ensureVectorLayers(
  map: MapboxMap,
  markerStyle: "logo" | "color",
  showLabels: boolean,
  labelColor: string
) {
  // We use vector layers only for the "color" mode (logos use HTML markers)
  const wantCircles = markerStyle === "color";
  const haveCircle = !!map.getLayer(CIRCLE_ID);

  if (wantCircles && !haveCircle) {
    if (!map.getSource(SRC_ID)) return;
    map.addLayer({
      id: CIRCLE_ID,
      type: "circle",
      source: SRC_ID,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3, 3,
          6, 5,
          8, 7,
          10, 9,
        ],
        "circle-color": [
          "case",
          ["==", ["get", "Retailer"], "Nutrien"], "#0ea5e9",
          ["==", ["get", "Retailer"], "Wilbur-Ellis"], "#f59e0b",
          ["==", ["get", "Retailer"], "Helena"], "#10b981",
          ["==", ["get", "Retailer"], "Growmark"], "#a855f7",
          "#ef4444",
        ],
        "circle-stroke-color": "#111827",
        "circle-stroke-width": 1,
        "circle-opacity": 0.9,
      },
    });
  } else if (!wantCircles && haveCircle) {
    map.removeLayer(CIRCLE_ID);
  }

  // Labels
  const wantLabels = showLabels && markerStyle === "color";
  const haveLabels = !!map.getLayer(LABEL_ID);

  if (wantLabels && !haveLabels) {
    if (!map.getSource(SRC_ID)) return;
    map.addLayer({
      id: LABEL_ID,
      type: "symbol",
      source: SRC_ID,
      layout: {
        "text-field": ["coalesce", ["get", "Name"], ["get", "Retailer"]],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3, 9,
          6, 11,
          10, 13
        ],
        "text-offset": [0, 1.0],
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": labelColor || "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1.2,
      },
    });
  } else if (!wantLabels && haveLabels) {
    map.removeLayer(LABEL_ID);
  }
}

function rebuildLogoMarkers(
  map: MapboxMap,
  fc: RetailerFC,
  store: React.MutableRefObject<LogoMarker[]>
) {
  clearLogoMarkers(store);
  if (!fc?.features?.length) return;

  // Create one HTML marker per feature
  for (const feat of fc.features) {
    if (!feat?.geometry || feat.geometry.type !== "Point") continue;
    const [lng, lat] = feat.geometry.coordinates;
    const props = feat.properties || ({} as RetailerProps);
    const retailer = props.Retailer || "store";
    const title = props.Name || retailer;

    const logoPath = `logos/${safeFile(retailer)}.png`; // served from /public/logos/

    const el = makeLogoEl(logoPath, title);
    const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat([lng, lat])
      .addTo(map);

    const id = `${retailer}-${lng.toFixed(5)}-${lat.toFixed(5)}`;
    store.current.push({ marker, id });
  }
}

function clearLogoMarkers(store: React.MutableRefObject<LogoMarker[]>) {
  for (const m of store.current) {
    try { m.marker.remove(); } catch {}
  }
  store.current = [];
}

function safeFile(s: string) {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-_.]/g, "");
}

function ensureHomeMarker(map: MapboxMap, home?: HomeLoc | null) {
  // Remove existing first
  const mkRef = (homeMarkerRef as any) as React.MutableRefObject<mapboxgl.Marker | null>;
  // (TypeScript trick: allow reuse outside component scope)
  // In our component we always call through the exported ref above.

  if (!("current" in mkRef)) return; // safety if called too early

  if (mkRef.current) {
    try { mkRef.current.remove(); } catch {}
    mkRef.current = null;
  }

  if (!home) return;

  const el = document.createElement("div");
  el.style.width = "18px";
  el.style.height = "18px";
  el.style.borderRadius = "50%";
  el.style.background = "#22c55e";
  el.style.boxShadow = "0 0 0 2px #00000088";
  el.title = "Home";

  mkRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
    .setLngLat([home.lng, home.lat])
    .addTo(map);
}
