// /components/Map.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map as MapboxMap, MapboxEvent } from "mapbox-gl";
import type { Feature, FeatureCollection, Point } from "geojson";

export type HomeLoc = { lng: number; lat: number; label?: string };

type Props = {
  data?: FeatureCollection<Point, Record<string, any>>;
  markerStyle: "logo" | "color";
  showLabels?: boolean;
  labelColor?: string;

  mapStyle: string; // style URL from page (e.g., mapbox://styles/...)
  projection?: "mercator" | "globe";
  allowRotate?: boolean;
  rasterSharpen?: boolean;

  mapboxToken: string;
  home?: HomeLoc | null;

  enableHomePick?: boolean;
  onPickHome?: (lng: number, lat: number) => void;
};

const EMPTY_FC: FeatureCollection<Point, any> = { type: "FeatureCollection", features: [] };

type RetailerFeature = Feature<Point, Record<string, any>>;

function readRetailer(p: Record<string, any>): string {
  return (p.Retailer ?? p.retailer ?? p.company ?? p.Brand ?? p.brand ?? "").toString().trim();
}
function readName(p: Record<string, any>): string {
  // Prefer a human-friendly site/location name
  return (
    (p.Name ?? p.name ?? p.Location ?? p.location ?? p.Site ?? p.site ?? "").toString().trim() ||
    readRetailer(p)
  );
}
function readCategory(p: Record<string, any>): string {
  return (p.Category ?? p.category ?? "").toString().trim();
}

// Normalize retailer → logo key (file stem). You can expand the mapping if needed.
function logoKeyFor(retailer: string): string {
  const k = retailer.toLowerCase();
  // example special cases:
  if (k.includes("growmark") || k.endsWith(" fs")) return "growmark-fs";
  if (k.includes("winfield")) return "winfield";
  if (k.includes("chs")) return "chs";
  if (k.includes("nutrien")) return "nutrien";
  if (k.includes("helena")) return "helena";
  if (k.includes("agtegr")) return "agtegra";
  // default: kebab
  return k.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Add a derived 'logoKey' to features so the style can bind icon-image: ["get","logoKey"]
function withLogoKey(fc: FeatureCollection<Point, Record<string, any>>): FeatureCollection<Point, any> {
  const features = fc.features.map((f) => {
    const p = { ...(f.properties || {}) };
    const retailer = readRetailer(p);
    p.logoKey = retailer ? logoKeyFor(retailer) : "";
    p._label = readName(p);
    p._category = readCategory(p);
    return { ...f, properties: p };
  });
  return { type: "FeatureCollection", features };
}

// Base-path safe URL (works locally and on GitHub Pages /<repo>)
function assetUrl(path: string): string {
  if (typeof window === "undefined") return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  const parts = window.location.pathname.split("/").filter(Boolean);
  // Heuristic: if running under /<repo>/..., prefix that repo for assets under /public
  const base = parts.length > 0 ? `/${parts[0]}` : "";
  // Avoid double-prefix if already present
  return p.startsWith(`${base}/`) ? p : `${base}${p}`;
}

export default function MapView(props: Props) {
  const {
    data,
    markerStyle,
    showLabels = true,
    labelColor = "#ffffff",
    mapStyle,
    projection = "globe",
    allowRotate = true,
    rasterSharpen = false,
    mapboxToken,
    home,
    enableHomePick,
    onPickHome,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const isLoadedRef = useRef(false);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const addedImagesRef = useRef<Set<string>>(new Set());
  const currentStyleURL = useRef<string>("");

  const safeData = useMemo(() => (data ? withLogoKey(data) : EMPTY_FC), [data]);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      projection,
      center: [-94.0, 41.5], // Midwest-ish default
      zoom: 5,
      pitch: 0,
      bearing: 0,
      dragRotate: allowRotate,
      pitchWithRotate: allowRotate,
    });

    mapRef.current = map;
    currentStyleURL.current = mapStyle;

    // Only proceed once the style is loaded the first time
    map.once("load", () => {
      isLoadedRef.current = true;
      applyProjection(map, projection);
      setupInteractionFlags(map, allowRotate);
      addOrUpdateData(map, safeData);
      registerLogosAndLayers(map, safeData, markerStyle, showLabels, labelColor);
      applyRasterSharpen(map, rasterSharpen);
      ensureHomeMarker(map, home);

      fitToDataOnce(map, safeData);
    });

    // On ANY subsequent style changes (e.g., switching basemap), re-add everything
    map.on("styledata", (e: MapboxEvent) => {
      const styleURL = map.getStyle()?.sprite || currentStyleURL.current;
      // Skip early spam before the first "load"
      if (!isLoadedRef.current) return;
      // Rebuild sources/layers/images after style becomes usable
      if (map.isStyleLoaded()) {
        // Reset caches bound to the previous style
        addedImagesRef.current.clear();

        addOrUpdateData(map, safeData);
        registerLogosAndLayers(map, safeData, markerStyle, showLabels, labelColor);
        applyRasterSharpen(map, rasterSharpen);
        ensureHomeMarker(map, home);
      }
    });

    // Clean up on unmount
    return () => {
      homeMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If props change, reflect them (after first load)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;

    // Style URL switch → setStyle triggers styledata → rebuild
    if (mapStyle && mapStyle !== currentStyleURL.current) {
      currentStyleURL.current = mapStyle;
      map.setStyle(mapStyle);
      return;
    }

    applyProjection(map, projection);
    setupInteractionFlags(map, allowRotate);
    applyRasterSharpen(map, rasterSharpen);

    // Data refresh
    addOrUpdateData(map, safeData);

    // Marker style/labels refresh
    rebuildSymbolVisibility(map, markerStyle, showLabels, labelColor);

    // Home marker refresh
    ensureHomeMarker(map, home);
  }, [mapStyle, projection, allowRotate, rasterSharpen, safeData, markerStyle, showLabels, labelColor, home]);

  // Click-to-pick-home
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    const handle = (e: mapboxgl.MapMouseEvent & mapboxgl.EventData) => {
      if (!enableHomePick || !onPickHome) return;
      const { lng, lat } = e.lngLat;
      onPickHome(lng, lat);
    };
    map.on("click", handle);
    return () => {
      map.off("click", handle);
    };
  }, [enableHomePick, onPickHome]);

  return <div ref={containerRef} className="h-[72vh] w-full" />;
}

/* --------------------------- Map utilities --------------------------- */

function applyProjection(map: MapboxMap, projection: "mercator" | "globe") {
  try {
    map.setProjection(projection);
  } catch {
    // Projection may be missing temporarily during style reload
  }
}

function setupInteractionFlags(map: MapboxMap, allowRotate: boolean) {
  try {
    if (allowRotate) {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
    } else {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.setPitch(0);
      map.setBearing(0);
    }
  } catch {
    // ignore during style churn
  }
}

function fitToDataOnce(map: MapboxMap, fc: FeatureCollection<Point, any>) {
  if (!fc?.features?.length) return;
  const coords = fc.features.map((f) => f.geometry.coordinates);
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return;
  try {
    map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 40, duration: 0 });
  } catch { /* ignore */ }
}

function addOrUpdateData(map: MapboxMap, fc: FeatureCollection<Point, any>) {
  const id = "retailers-src";
  const existing = map.getSource(id) as mapboxgl.GeoJSONSource | undefined;

  const clusterOpts: mapboxgl.GeoJSONSourceRaw = {
    type: "geojson",
    data: fc,
    cluster: true,
    clusterRadius: 60,
    clusterMaxZoom: 10,
  };

  if (existing) {
    try {
      existing.setData(fc as any);
    } catch {
      // source may be stale after style change; re-add
      if (map.getSource(id)) {
        // Remove layers before re-adding source
        safeRemoveLayer(map, "retailers-clusters");
        safeRemoveLayer(map, "retailers-cluster-count");
        safeRemoveLayer(map, "retailers-points-logo");
        safeRemoveLayer(map, "retailers-points-circle");
        safeRemoveLayer(map, "retailers-labels");
        safeRemoveSource(map, id);
      }
      map.addSource(id, clusterOpts);
    }
  } else {
    map.addSource(id, clusterOpts);
  }

  // (Re)ensure cluster layers exist
  addClusterLayers(map);
}

function addClusterLayers(map: MapboxMap) {
  if (!map.getLayer("retailers-clusters")) {
    map.addLayer({
      id: "retailers-clusters",
      type: "circle",
      source: "retailers-src",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#334155",
        "circle-radius": [
          "step",
          ["get", "point_count"],
          16, 25, 20, 100, 26, 500, 32
        ],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#0f172a",
        "circle-opacity": 0.8,
      },
    });
  }
  if (!map.getLayer("retailers-cluster-count")) {
    map.addLayer({
      id: "retailers-cluster-count",
      type: "symbol",
      source: "retailers-src",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 12,
      },
      paint: {
        "text-color": "#ffffff",
      },
    });
  }
}

function registerLogosAndLayers(
  map: MapboxMap,
  fc: FeatureCollection<Point, any>,
  markerStyle: "logo" | "color",
  showLabels: boolean,
  labelColor: string
) {
  // Ensure data source exists (and cluster layers)
  addOrUpdateData(map, fc);

  // Preload and register logo images for all distinct logoKeys
  const keys = new Set<string>();
  for (const f of fc.features as RetailerFeature[]) {
    const k = f.properties?.logoKey;
    if (k) keys.add(k);
  }

  // Attempt to load each logo image (silently skip missing)
  const promises: Promise<void>[] = [];
  keys.forEach((k) => {
    promises.push(
      addImageIfMissing(map, k, assetUrl(`/icons/${k}.png`)).catch(() => Promise.resolve())
    );
  });

  Promise.all(promises).finally(() => {
    // Add/refresh unclustered point layers (logo + circle fallback)
    ensurePointLayers(map);

    // Apply visibility per markerStyle
    rebuildSymbolVisibility(map, markerStyle, showLabels, labelColor);
  });
}

function ensurePointLayers(map: MapboxMap) {
  // Unclustered logo layer
  if (!map.getLayer("retailers-points-logo")) {
    map.addLayer({
      id: "retailers-points-logo",
      type: "symbol",
      source: "retailers-src",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["get", "logoKey"],
        "icon-size": 0.25,              // scale big PNGs down
        "icon-allow-overlap": true,
        "icon-anchor": "bottom",
      },
    });
  }
  // Unclustered circle fallback
  if (!map.getLayer("retailers-points-circle")) {
    map.addLayer({
      id: "retailers-points-circle",
      type: "circle",
      source: "retailers-src",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": 6,
        "circle-color": "#22c55e",
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#052e16",
      },
    });
  }
  // Optional labels
  if (!map.getLayer("retailers-labels")) {
    map.addLayer({
      id: "retailers-labels",
      type: "symbol",
      source: "retailers-src",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "text-field": ["coalesce", ["get", "_label"], ["get", "Name"], ["get", "Retailer"]],
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-size": 11,
        "text-offset": [0, 1.2],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": labelColor || "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1.2,
      },
    });
  }
}

function rebuildSymbolVisibility(
  map: MapboxMap,
  markerStyle: "logo" | "color",
  showLabels: boolean,
  labelColor: string
) {
  // Toggle between logo vs color markers
  const useLogo = markerStyle === "logo";
  safeSetLayoutProperty(map, "retailers-points-logo", "visibility", useLogo ? "visible" : "none");
  safeSetLayoutProperty(map, "retailers-points-circle", "visibility", useLogo ? "none" : "visible");

  // Label toggling + color update
  safeSetLayoutProperty(map, "retailers-labels", "visibility", showLabels ? "visible" : "none");
  try {
    map.setPaintProperty("retailers-labels", "text-color", labelColor || "#ffffff");
  } catch { /* ignore */ }
}

function applyRasterSharpen(map: MapboxMap, enable: boolean) {
  try {
    const style = map.getStyle();
    if (!style?.layers) return;
    for (const layer of style.layers) {
      if (layer.type === "raster") {
        // These paint props exist on raster layers; adjust modestly
        map.setPaintProperty(layer.id, "raster-contrast", enable ? 0.1 : 0);
        map.setPaintProperty(layer.id, "raster-saturation", enable ? 0.05 : 0);
        map.setPaintProperty(layer.id, "raster-brightness-min", enable ? 0.02 : 0);
        map.setPaintProperty(layer.id, "raster-brightness-max", enable ? 0.98 : 1);
      }
    }
  } catch { /* ignore while styles are swapping */ }
}

function ensureHomeMarker(map: MapboxMap, home?: HomeLoc | null) {
  // Remove existing
  if (homeMarkerRef.current) {
    try { homeMarkerRef.current.remove(); } catch { /* ignore */ }
    homeMarkerRef.current = null;
  }
  if (!home) return;

  const el = document.createElement("div");
  el.className = "rounded-full shadow ring-2 ring-black/50";
  el.style.width = "18px";
  el.style.height = "18px";
  el.style.background = "#fde047"; // yellow
  el.style.border = "2px solid #1c1917";

  const marker = new mapboxgl.Marker({ element: el, anchor: "bottom", offset: [0, 0] })
    .setLngLat([home.lng, home.lat])
    .addTo(map);

  homeMarkerRef.current = marker;
}

/* ----------------------- Image / layer helpers ---------------------- */

function safeSetLayoutProperty(map: MapboxMap, layerId: string, prop: string, value: any) {
  try { map.setLayoutProperty(layerId, prop, value); } catch { /* ignore */ }
}
function safeRemoveLayer(map: MapboxMap, layerId: string) {
  try { if (map.getLayer(layerId)) map.removeLayer(layerId); } catch { /* ignore */ }
}
function safeRemoveSource(map: MapboxMap, sourceId: string) {
  try { if (map.getSource(sourceId)) map.removeSource(sourceId); } catch { /* ignore */ }
}

function addImageIfMissing(map: MapboxMap, id: string, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!id) return resolve();
    // If the image is already registered on this style, skip
    try {
      if ((map as any).hasImage && (map as any).hasImage(id)) return resolve();
    } catch { /* older typings */ }

    // Load the image and add
    map.loadImage(url, (err, image) => {
      if (err || !image) return reject(err || new Error("no image"));
      try {
        map.addImage(id, image, { sdf: false, pixelRatio: 1 });
        resolve();
      } catch (e) {
        // If style just changed mid-flight, ignore
        resolve();
      }
    });
  });
}
