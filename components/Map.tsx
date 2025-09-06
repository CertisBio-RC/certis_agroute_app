"use client";

import React, { useEffect, useMemo, useRef } from "react";
import type { FeatureCollection, Feature, Point } from "geojson";
import mapboxgl from "mapbox-gl";

type MapboxMap = mapboxgl.Map;

export type HomeLoc = { lng: number; lat: number; label?: string };

type Props = {
  data?: FeatureCollection<Point, Record<string, any>>;
  markerStyle: "logo" | "color";
  showLabels: boolean;        // kept for compat
  labelColor: string;         // kept for compat
  mapStyle: string;
  projection: "mercator" | "globe";
  allowRotate: boolean;
  rasterSharpen: boolean;     // kept for compat
  mapboxToken: string;
  home?: HomeLoc | null;
  enableHomePick?: boolean;
  onPickHome?: (lng: number, lat: number) => void;
};

const SOURCE_ID = "retailers";
const L_CLUSTER = "retailers-clusters";
const L_CLUSTER_COUNT = "retailers-cluster-count";
const L_POINTS = "retailers-points"; // fallback circles
const L_LOGOS = "retailers-logos";   // symbol layer with retailer logos

/** Prefix paths with repo name for GitHub Pages */
function withBasePath(path: string) {
  const repo = process.env.NEXT_PUBLIC_REPO_NAME || "";
  const prefix = repo ? `/${repo}` : "";
  return `${prefix}${path}`;
}

/** Wait until a style is finished loading */
async function waitStyle(map: MapboxMap) {
  if (map.isStyleLoaded()) return;
  await new Promise<void>((resolve) => {
    const onIdle = () => {
      map.off("idle", onIdle);
      resolve();
    };
    map.on("idle", onIdle);
  });
}

/** Try to load a retailer logo into the style sprite, return an image key or null */
async function loadRetailerLogo(map: MapboxMap, retailer: string): Promise<string | null> {
  const base = withBasePath("/icons/");
  const fileBase = `${retailer} Logo`;
  const exts = [".png", ".jpg", ".jpeg", ".jfif"];

  for (const ext of exts) {
    try {
      const url = `${base}${encodeURIComponent(fileBase)}${ext}`;
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) continue;
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      const key = `logo:${retailer}`;
      if (!map.hasImage(key)) map.addImage(key, bmp, { pixelRatio: 2 });
      return key;
    } catch {
      /* try next extension */
    }
  }
  return null;
}

/** Create sources & layers if missing (safe to call repeatedly) */
function ensureSourcesAndLayers(map: MapboxMap) {
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    });
  }

  if (!map.getLayer(L_CLUSTER)) {
    map.addLayer({
      id: L_CLUSTER,
      type: "circle",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": ["step", ["get", "point_count"], "#16a34a", 10, "#22c55e", 25, "#34d399"],
        "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 25, 26],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#0f172a",
      },
    });
  }

  if (!map.getLayer(L_CLUSTER_COUNT)) {
    map.addLayer({
      id: L_CLUSTER_COUNT,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["to-string", ["get", "point_count"]],
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 12,
      },
      paint: { "text-color": "#ffffff" },
    });
  }

  if (!map.getLayer(L_POINTS)) {
    map.addLayer({
      id: L_POINTS,
      type: "circle",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#22c55e",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 8, 6, 12, 7.5],
        "circle-stroke-width": 1.25,
        "circle-stroke-color": "#0f172a",
      },
    });
  }

  if (!map.getLayer(L_LOGOS)) {
    map.addLayer({
      id: L_LOGOS,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["all", ["!", ["has", "point_count"]], ["has", "logo"]],
      layout: {
        "icon-image": ["get", "logo"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.35, 8, 0.5, 12, 0.75],
        "icon-allow-overlap": true,
      },
    });
  }
}

/** Push (possibly) enriched data into the GeoJSON source */
function syncData(map: MapboxMap, data?: FeatureCollection<Point, Record<string, any>>) {
  const src = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!src) return;

  if (!data) {
    src.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const enriched: FeatureCollection<Point, Record<string, any>> = {
    type: "FeatureCollection",
    features: data.features.map((f) => {
      const p = f.properties || {};
      const retailer =
        (typeof p.retailer === "string" && p.retailer.trim()) ||
        (typeof p.Retailer === "string" && p.Retailer.trim()) ||
        "";
      const newP = { ...p } as Record<string, any>;
      if (retailer) newP.logo = `logo:${retailer}`;
      const nf: Feature<Point, Record<string, any>> = {
        type: "Feature",
        geometry: f.geometry,
        properties: newP,
      };
      return nf;
    }),
  };

  src.setData(enriched);
}

export default function MapView({
  data,
  markerStyle,
  mapStyle,
  projection,
  allowRotate,
  mapboxToken,
  home,
  enableHomePick,
  onPickHome,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const retailerNames = useMemo(() => {
    const s = new Set<string>();
    if (data) {
      for (const f of data.features) {
        const p = f.properties || {};
        const r =
          (typeof p.retailer === "string" && p.retailer.trim()) ||
          (typeof p.Retailer === "string" && p.Retailer.trim()) ||
          "";
        if (r) s.add(r);
      }
    }
    return Array.from(s.values());
  }, [data]);

  // Initial map create
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = mapboxToken || "";

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      projection,
      attributionControl: true,
    });

    map.touchZoomRotate.enable(); // good mobile UX
    mapRef.current = map;

    map.on("load", async () => {
      await waitStyle(map);
      ensureSourcesAndLayers(map);
      syncData(map, data);
      for (const r of retailerNames) {
        // eslint-disable-next-line no-await-in-loop
        await loadRetailerLogo(map, r);
      }
    });

    // NOTE: v3 typings – use MapMouseEvent only
    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (!enableHomePick || !onPickHome) return;
      const { lng, lat } = e.lngLat;
      onPickHome(lng, lat);
    };
    map.on("click", onClick);

    return () => {
      map.off("click", onClick);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Style changes require re-adding sources/layers/images
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setStyle(mapStyle);
    (async () => {
      await waitStyle(map);
      ensureSourcesAndLayers(map);
      syncData(map, data);
      for (const r of retailerNames) {
        // eslint-disable-next-line no-await-in-loop
        await loadRetailerLogo(map, r);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle]);

  // Projection
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setProjection(projection);
    } catch {
      /* ignore if not supported */
    }
  }, [projection]);

  // Rotation controls
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (allowRotate) {
      map.dragRotate.enable();
    } else {
      map.dragRotate.disable();
      map.setPitch(0);
      map.setBearing(0);
    }
  }, [allowRotate]);

  // Toggle symbol/circle visibility (logos on/off)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const logosVisible = markerStyle === "logo";
    if (map.getLayer(L_LOGOS)) map.setLayoutProperty(L_LOGOS, "visibility", logosVisible ? "visible" : "none");
    if (map.getLayer(L_POINTS)) map.setLayoutProperty(L_POINTS, "visibility", "visible");
  }, [markerStyle]);

  // Data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureSourcesAndLayers(map);
    syncData(map, data);
    (async () => {
      for (const r of retailerNames) {
        // eslint-disable-next-line no-await-in-loop
        await loadRetailerLogo(map, r);
      }
    })();
  }, [data, retailerNames]);

  // Home marker (position and creation) — RECREATE instead of setElement (v3)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (home && Number.isFinite(home.lng) && Number.isFinite(home.lat)) {
      // build marker element
      const el = document.createElement("div");
      el.style.width = "28px";
      el.style.height = "28px";
      el.style.borderRadius = "50%";
      el.style.background = "#10b981";
      el.style.color = "#0f172a";
      el.style.display = "grid";
      el.style.placeItems = "center";
      el.style.fontWeight = "700";
      el.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
      el.style.boxShadow = "0 0 0 2px #0f172a, 0 1px 6px rgba(0,0,0,.35)";
      el.textContent = "H";
      el.title = home.label || "Home";

      // remove & recreate marker (setElement no longer exists in v3)
      if (homeMarkerRef.current) {
        homeMarkerRef.current.remove();
        homeMarkerRef.current = null;
      }
      homeMarkerRef.current = new mapboxgl.Marker({
        element: el,
        anchor: "center",
        pitchAlignment: "map",
        rotationAlignment: "map",
      })
        .setLngLat([home.lng, home.lat])
        .addTo(map);
    } else {
      if (homeMarkerRef.current) {
        homeMarkerRef.current.remove();
        homeMarkerRef.current = null;
      }
    }
  }, [home]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "72vh", borderRadius: 12, overflow: "hidden" }}
      aria-label="Retailer Map"
    />
  );
}
