// /components/Map.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import type { Feature, FeatureCollection, Point } from "geojson";
import mapboxgl from "mapbox-gl";

type HomeLoc = { lng: number; lat: number; label?: string };

type Props = {
  data?: FeatureCollection<Point, Record<string, any>>;
  markerStyle: "logo" | "color";
  showLabels?: boolean;       // kept for future use
  labelColor?: string;        // kept for future use
  mapStyle: string;           // mapbox:// style URL
  projection: "mercator" | "globe";
  allowRotate: boolean;
  rasterSharpen: boolean;
  mapboxToken: string;
  home?: HomeLoc | null;
  enableHomePick?: boolean;
  onPickHome?: (lng: number, lat: number) => void;
};

type MapboxMap = mapboxgl.Map;

mapboxgl.accessToken = ""; // we set per-instance via options; leaving empty here is fine.

/** Convert retailer name to an image id + filename base */
function retailerToIconBase(retailer?: unknown) {
  const r =
    typeof retailer === "string" && retailer.trim()
      ? retailer.trim()
      : "";
  // Normalize: remove slashes, collapse spaces, keep letters/digits/&/- and space
  const safe = r.replace(/[\\/:"*?<>|]+/g, "").replace(/\s+/g, " ").trim();
  return safe ? `${safe} Logo` : ""; // filenames are "<Retailer> Logo.*"
}

/** Create an anchored HTML element for the Home marker. */
function createHomeEl(label = "H"): HTMLElement {
  const el = document.createElement("div");
  el.className = "home-pin";
  el.style.width = "28px";
  el.style.height = "28px";
  el.style.borderRadius = "50%";
  el.style.background = "#16a34a";
  el.style.border = "2px solid white";
  el.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.25)";
  el.style.color = "white";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.font = "600 14px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  // anchor bottom-center and keep tip on coordinate at all zooms
  el.style.transform = "translate(-50%, -100%)";
  el.textContent = (label || "H").slice(0, 2);
  return el;
}

/** Load an image into the style sprite if it doesn't already exist. */
async function ensureImage(map: MapboxMap, id: string, exts: string[]) {
  if (!id) return false;
  if (map.hasImage(id)) return true;

  // Try several extensions (png, jpg, webp, jfif)
  for (const ext of exts) {
    const url = `/icons/${id}.${ext}`;
    try {
      const img = await loadHTMLImage(url);
      if (!map.hasImage(id)) map.addImage(id, img as unknown as any, { sdf: false });
      return true;
    } catch {
      // try next extension
    }
  }
  return false;
}

function loadHTMLImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Prepare data: add an 'icon' property to each feature based on Retailer. */
function withIcons(
  fc?: FeatureCollection<Point, Record<string, any>>
): FeatureCollection<Point, Record<string, any>> | undefined {
  if (!fc) return undefined;
  const feats: Feature<Point, Record<string, any>>[] = fc.features.map((f) => {
    const p = f.properties || {};
    const retailer =
      typeof p.retailer === "string" && p.retailer.trim()
        ? p.retailer.trim()
        : typeof p.Retailer === "string"
        ? p.Retailer.trim()
        : "";
    const iconBase = retailerToIconBase(retailer);
    return {
      ...f,
      properties: { ...p, retailer, icon: iconBase || undefined },
    };
  });
  return { type: "FeatureCollection", features: feats };
}

/** Collect unique icon ids from a feature collection. */
function collectIconIds(fc?: FeatureCollection<Point, any>): string[] {
  if (!fc) return [];
  const seen = new Set<string>();
  for (const f of fc.features) {
    const id = f.properties?.icon;
    if (id && typeof id === "string") seen.add(id);
  }
  return Array.from(seen);
}

const SOURCE_ID = "retailers";
const LAYER_CIRCLE = "retailers-circles";
const LAYER_SYMBOL = "retailers-logos";
const LAYER_CLUSTER = "retailers-clusters";
const LAYER_CLUSTER_COUNT = "retailers-cluster-count";

const MapView: React.FC<Props> = (props) => {
  const {
    data,
    markerStyle,
    mapStyle,
    projection,
    allowRotate,
    rasterSharpen,
    mapboxToken,
    home,
    enableHomePick,
    onPickHome,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const currentDataRef = useRef<FeatureCollection<Point, any> | undefined>(undefined);

  const prepared = useMemo(() => withIcons(data), [data]);

  // ---------- Initialize map ----------
  useEffect(() => {
    if (!containerRef.current) return;
    // (re)create map when container or token available
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      projection,
      accessToken: mapboxToken,
      attributionControl: true,
      antialias: true,
    });
    mapRef.current = map;

    // Base interactions
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");

    const onLoad = () => {
      // after style load we can add sources/layers/images
      setupSourcesAndLayers(map, currentDataRef.current, markerStyle).catch(() => { /* ignore */ });

      // click-to-pick home
      map.on("click", (e) => {
        if (!enableHomePick || !onPickHome) return;
        const { lng, lat } = e.lngLat;
        onPickHome(lng, lat);
      });

      // initial sharpen if requested
      if (rasterSharpen) trySharpenRaster(map, true);
    };

    // Map style events
    map.on("load", onLoad);

    return () => {
      try { homeMarkerRef.current?.remove(); } catch {}
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

  // ---------- Respond to style change ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getStyle()?.name && map.getStyle().sprite && map.getStyle().glyphs && map.getStyle().sources) {
      // Force setStyle; will emit 'load' again, so re-add our layers in that handler
      map.setStyle(mapStyle);
    }
  }, [mapStyle]);

  // ---------- Respond to projection change ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try { map.setProjection(projection as any); } catch {}
  }, [projection]);

  // ---------- Allow rotate / pitch ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (allowRotate) {
      map.dragRotate.enable();
    } else {
      map.dragRotate.disable();
      // reset pitch so the view doesn't get stuck pitched
      try { map.setPitch(0); } catch {}
      try { map.setBearing(0); } catch {}
    }
  }, [allowRotate]);

  // ---------- Sharpen satellite imagery ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // after every style load we re-apply; guard if style not ready
    const apply = () => trySharpenRaster(map, rasterSharpen);
    if (map.isStyleLoaded()) apply();
    map.once("load", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rasterSharpen, mapStyle]);

  // ---------- Update data (and images) ----------
  useEffect(() => {
    currentDataRef.current = prepared;
    const map = mapRef.current;
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once("load", () => {
        setupSourcesAndLayers(map, prepared, markerStyle).catch(() => {});
      });
      return;
    }

    // Ensure source exists; if not, (re)create full stack
    const src = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!src) {
      setupSourcesAndLayers(map, prepared, markerStyle).catch(() => {});
    } else {
      // update data
      src.setData(prepared || { type: "FeatureCollection", features: [] });
      // (re)load images for any new retailers
      refreshImages(map, prepared).catch(() => {});
      // toggle layers visibility based on markerStyle
      setMarkerVisibility(map, markerStyle);
    }
  }, [prepared, markerStyle]);

  // ---------- Update Home marker ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!home) {
      try { homeMarkerRef.current?.remove(); } catch {}
      homeMarkerRef.current = null;
      return;
    }

    const el = createHomeEl(home.label || "H");
    if (homeMarkerRef.current) {
      // @ts-expect-error: setElement exists at runtime
      homeMarkerRef.current.setElement?.(el);
      homeMarkerRef.current.setLngLat([home.lng, home.lat]);
    } else {
      homeMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([home.lng, home.lat])
        .addTo(map);
    }
  }, [home]);

  return <div ref={containerRef} className="h-[70vh] w-full bg-black" />;
};

export default MapView;

/* ---------------- helpers ---------------- */

async function setupSourcesAndLayers(
  map: MapboxMap,
  fc: FeatureCollection<Point, any> | undefined,
  markerStyle: "logo" | "color"
) {
  // Remove any prior layers/sources if style was reset
  for (const id of [LAYER_CLUSTER_COUNT, LAYER_CLUSTER, LAYER_SYMBOL, LAYER_CIRCLE]) {
    if (map.getLayer(id)) try { map.removeLayer(id); } catch {}
  }
  if (map.getSource(SOURCE_ID)) try { map.removeSource(SOURCE_ID); } catch {}

  // Add source (no clustering by default; you can enable if you want)
  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: fc || { type: "FeatureCollection", features: [] },
  });

  // Circles (colored dots)
  map.addLayer({
    id: LAYER_CIRCLE,
    type: "circle",
    source: SOURCE_ID,
    paint: {
      "circle-radius": 6,
      "circle-color": [
        "case",
        ["==", ["typeof", ["get", "retailer"]], "string"],
        "#60a5fa", // blue for retailers
        "#f97316"  // orange otherwise
      ],
      "circle-stroke-color": "#111827",
      "circle-stroke-width": 1.5
    },
    layout: { visibility: markerStyle === "color" ? "visible" : "none" }
  });

  // Symbol (logos) – use per-feature icon from 'icon'
  map.addLayer({
    id: LAYER_SYMBOL,
    type: "symbol",
    source: SOURCE_ID,
    layout: {
      "icon-image": ["coalesce", ["get", "icon"], ""],
      "icon-size": 0.6,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      visibility: markerStyle === "logo" ? "visible" : "none"
    }
  });

  // Preload any icons present in data
  await refreshImages(map, fc);
}

async function refreshImages(map: MapboxMap, fc?: FeatureCollection<Point, any>) {
  const ids = collectIconIds(fc);
  const exts = ["png", "jpg", "webp", "jfif"]; // try a few common ones
  for (const id of ids) {
    await ensureImage(map, id, exts);
  }
}

function setMarkerVisibility(map: MapboxMap, mode: "logo" | "color") {
  const logoVis = mode === "logo" ? "visible" : "none";
  const dotVis = mode === "color" ? "visible" : "none";
  if (map.getLayer(LAYER_SYMBOL)) map.setLayoutProperty(LAYER_SYMBOL, "visibility", logoVis);
  if (map.getLayer(LAYER_CIRCLE)) map.setLayoutProperty(LAYER_CIRCLE, "visibility", dotVis);
}

/** Boost contrast a bit for raster layers (satellite styles). */
function trySharpenRaster(map: MapboxMap, on: boolean) {
  try {
    const style = map.getStyle();
    if (!style || !style.layers) return;
    for (const layer of style.layers) {
      if (layer.type === "raster") {
        const id = layer.id;
        map.setPaintProperty(id, "raster-contrast", on ? 0.2 : 0);
        map.setPaintProperty(id, "raster-saturation", on ? -0.05 : 0);
        map.setPaintProperty(id, "raster-brightness-max", on ? 0.9 : 1.0);
      }
    }
  } catch {
    // non-fatal
  }
}
