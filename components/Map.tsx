"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map as MapboxMap, LngLatLike } from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";
import type { HomeLoc } from "@/utils/home";

mapboxgl.accessToken = ""; // we pass the token at runtime via constructor

type Props = {
  data?: FeatureCollection<Point, any>;
  markerStyle: "logo" | "color";
  showLabels?: boolean;
  labelColor?: string;
  mapStyle: string;
  projection: "mercator" | "globe";
  allowRotate?: boolean;
  rasterSharpen?: boolean;
  mapboxToken: string;
  home: HomeLoc | null;
  enableHomePick?: boolean;
  onPickHome?: (lng: number, lat: number) => void;
};

type RetailerProps = Record<string, any>;

const SRC_ID = "retailers-src";
const CLUSTER_CIRCLES = "retailer-clusters";
const CLUSTER_COUNTS = "retailer-cluster-count";
const DOTS_LAYER = "retailer-dots";
const SYMBOL_LAYER = "retailer-symbols";

export default function Map({
  data,
  markerStyle,
  showLabels = true,
  labelColor = "#fff200",
  mapStyle,
  projection,
  allowRotate = false,
  rasterSharpen = false,
  mapboxToken,
  home,
  enableHomePick,
  onPickHome,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const loadedLogos = useRef<Set<string>>(new Set());

  // ---------- helpers ----------
  function getRetailer(props: RetailerProps): string {
    const r =
      typeof props?.retailer === "string" && props.retailer.trim()
        ? props.retailer.trim()
        : typeof props?.Retailer === "string"
        ? props.Retailer.trim()
        : "";
    return r;
  }

  // Add/replace GeoJSON source (with clustering enabled)
  function ensureSource(m: MapboxMap, fc: FeatureCollection<Point, any>) {
    const exists = m.getSource(SRC_ID);
    const prepared = {
      type: "FeatureCollection",
      features: fc.features.map((f) => {
        const retailer = getRetailer(f.properties || {});
        // Precompute icon name so the symbol layer can reference it immediately
        const iconName = retailer ? `logo/${retailer}` : "";
        return {
          ...f,
          properties: { ...(f.properties || {}), iconName },
        };
      }),
    } as FeatureCollection<Point, any>;

    if (exists) {
      (exists as mapboxgl.GeoJSONSource).setData(prepared);
      return;
    }

    m.addSource(SRC_ID, {
      type: "geojson",
      data: prepared,
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 12,
    });
  }

  // Small, zoom-dependent logo sizing and overlap behavior
  function addLayers(m: MapboxMap) {
    // Cluster bubbles
    if (!m.getLayer(CLUSTER_CIRCLES)) {
      m.addLayer({
        id: CLUSTER_CIRCLES,
        type: "circle",
        source: SRC_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#2dd4bf",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            14, // up to 10
            10,
            18, // up to 25
            25,
            24, // 25+
          ],
          "circle-opacity": 0.9,
        },
      });
    }
    if (!m.getLayer(CLUSTER_COUNTS)) {
      m.addLayer({
        id: CLUSTER_COUNTS,
        type: "symbol",
        source: SRC_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-size": 12,
        },
        paint: { "text-color": "#051b1a" },
      });
    }

    // Colored dots (simple fallback / alternative style)
    if (!m.getLayer(DOTS_LAYER)) {
      m.addLayer({
        id: DOTS_LAYER,
        type: "circle",
        source: SRC_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            2.0,
            8,
            3.5,
            12,
            5.0,
            15,
            6.0,
          ],
          "circle-color": "#60a5fa",
          "circle-stroke-color": "#0b1220",
          "circle-stroke-width": 1.5,
        },
      });
    }

    // Logo symbols (shown only when not clustered)
    if (!m.getLayer(SYMBOL_LAYER)) {
      m.addLayer({
        id: SYMBOL_LAYER,
        type: "symbol",
        source: SRC_ID,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": ["get", "iconName"], // e.g., "logo/Central Valley Ag"
          // scale with zoom; these numbers assume source logos are ~96px
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.05,
            6,
            0.08,
            8,
            0.12,
            10,
            0.17,
            12,
            0.22,
            14,
            0.28,
            16,
            0.34,
          ],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-anchor": "center",
          "symbol-z-order": "auto",
        },
      });
    }

    // visibility toggles based on style
    m.setLayoutProperty(DOTS_LAYER, "visibility", markerStyle === "color" ? "visible" : "none");
    m.setLayoutProperty(SYMBOL_LAYER, "visibility", markerStyle === "logo" ? "visible" : "none");
  }

  // Load and *downscale* a logo image before adding to sprite
  async function ensureLogo(m: MapboxMap, retailer: string) {
    const name = `logo/${retailer}`;
    if (!retailer || loadedLogos.current.has(name) || m.hasImage(name)) return;

    const tryExt = async (ext: "png" | "jpg" | "jpeg") => {
      const url = `/icons/${retailer} Logo.${ext}`;
      const r = await fetch(url, { cache: "force-cache" });
      if (!r.ok) throw new Error("not found");
      const blob = await r.blob();

      // create bitmap then draw into a <canvas> to cap size ~96px (long edge)
      const bmp = await createImageBitmap(blob).catch(() => null);
      if (!bmp) throw new Error("bitmap failed");

      const MAX = 96;
      const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d ctx failed");
      ctx.drawImage(bmp, 0, 0, w, h);

      const smallBmp = await createImageBitmap(canvas);
      // add at pixelRatio 1 (icon-size handles final scaling)
      m.addImage(name, smallBmp, { pixelRatio: 1, sdf: false });
      loadedLogos.current.add(name);
    };

    try {
      await tryExt("png");
    } catch {
      try {
        await tryExt("jpg");
      } catch {
        try {
          await tryExt("jpeg");
        } catch {
          // no logo available; silently ignore
        }
      }
    }
  }

  // Iterate current features and queue any missing logos
  async function preloadLogos(m: MapboxMap, fc?: FeatureCollection<Point, any>) {
    if (!fc) return;
    // Use a small subset around the view would be nicer; keep it simple for now.
    const unique = new Set<string>();
    for (const f of fc.features) {
      const r = getRetailer(f.properties || {});
      if (r) unique.add(r);
    }
    for (const r of unique) {
      await ensureLogo(m, r);
    }
  }

  // Add/replace sources + layers once the style is ready
  function refreshMapStyle(m: MapboxMap, fc?: FeatureCollection<Point, any>) {
    const addAll = () => {
      if (!fc) return;
      ensureSource(m, fc);
      addLayers(m);
    };
    if (m.isStyleLoaded()) {
      addAll();
    } else {
      m.once("styledata", addAll);
    }
  }

  // ---------- lifecycle ----------
  // Create map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: mapboxToken,
      style: mapStyle,
      projection,
      center: [-96.5, 40.8], // continental US
      zoom: 4,
      attributionControl: true,
      cooperativeGestures: true,
    });

    // rotate behavior
    map.on("load", () => {
      if (allowRotate) map.dragRotate.enable();
      else {
        map.dragRotate.disable();
        map.setPitch(0);
      }
    });

    // click-to-pick home
    const clickHandler = (e: mapboxgl.MapMouseEvent) => {
      if (!enableHomePick || !onPickHome) return;
      const { lng, lat } = e.lngLat;
      onPickHome(lng, lat);
    };
    map.on("click", clickHandler);

    mapRef.current = map;

    return () => {
      map.off("click", clickHandler);
      map.remove();
      mapRef.current = null;
      loadedLogos.current.clear();
    };
  }, []); // once

  // Style / projection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getStyle().name !== mapStyle) {
      map.setStyle(mapStyle);
    }
    // projection
    try {
      map.setProjection(projection);
    } catch {
      /* ignore */
    }
  }, [mapStyle, projection]);

  // Rotation toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (allowRotate) map.dragRotate.enable();
    else {
      map.dragRotate.disable();
      map.setPitch(0);
    }
  }, [allowRotate]);

  // Data updates: (re)add source/layers and queue logo loads
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    const apply = () => {
      refreshMapStyle(map, data);
      preloadLogos(map, data);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("styledata", apply);
  }, [data]);

  // Marker style toggle (logos vs dots)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(DOTS_LAYER))
      map.setLayoutProperty(DOTS_LAYER, "visibility", markerStyle === "color" ? "visible" : "none");
    if (map.getLayer(SYMBOL_LAYER))
      map.setLayoutProperty(SYMBOL_LAYER, "visibility", markerStyle === "logo" ? "visible" : "none");
  }, [markerStyle]);

  // Home marker
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!home) {
      if (homeMarkerRef.current) {
        homeMarkerRef.current.remove();
        homeMarkerRef.current = null;
      }
      return;
    }

    const el = document.createElement("div");
    el.style.width = "28px";
    el.style.height = "28px";
    el.style.borderRadius = "50%";
    el.style.background = "#10b981";
    el.style.color = "#053a31";
    el.style.display = "grid";
    el.style.placeItems = "center";
    el.style.fontWeight = "700";
    el.style.boxShadow = "0 0 0 2px #022e2a, 0 0 0 4px rgba(2,46,42,.2)";
    el.textContent = "H";
    el.title = home.label || "Home";

    if (homeMarkerRef.current) {
      homeMarkerRef.current.setLngLat([home.lng, home.lat]);
      // swap element for crisp position at all zooms
      homeMarkerRef.current.remove();
      homeMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([home.lng, home.lat])
        .addTo(map);
    } else {
      homeMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([home.lng, home.lat])
        .addTo(map);
    }
  }, [home]);

  return <div ref={containerRef} className="h-[72vh] w-full" />;
}
