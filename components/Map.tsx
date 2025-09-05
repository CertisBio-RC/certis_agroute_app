// /components/Map.tsx
"use client";

import React, { useEffect, useRef } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";

mapboxgl.accessToken = ""; // provided via props at runtime

type RetailerProps = Record<string, any>;

type Props = {
  data?: FeatureCollection<Point, RetailerProps>;
  markerStyle: "logo" | "color";
  showLabels: boolean;
  labelColor: string;
  mapStyle: string;                 // mapbox style URI
  projection: "globe" | "mercator";
  allowRotate: boolean;
  rasterSharpen: boolean;           // we now *tune* any existing raster layers, no custom layer
  mapboxToken: string;

  home: { lng: number; lat: number; label?: string } | null;
  enableHomePick: boolean;
  onPickHome?: (lng: number, lat: number) => void;
};

const EMPTY_FC: FeatureCollection<Point, RetailerProps> = {
  type: "FeatureCollection",
  features: [],
};

// GitHub Pages basePath helper (same logic as page.tsx)
const repoBase =
  typeof window !== "undefined" && (window as any).__NEXT_DATA__?.props?.pageProps?.NEXT_PUBLIC_REPO_NAME
    ? `/${(window as any).__NEXT_DATA__.props.pageProps.NEXT_PUBLIC_REPO_NAME}`
    : (process.env.NEXT_PUBLIC_REPO_NAME ? `/${process.env.NEXT_PUBLIC_REPO_NAME}` : "");

function withBasePath(p: string) {
  return `${repoBase}${p}`;
}

export default function MapView(props: Props) {
  const {
    data,
    markerStyle,
    showLabels,
    labelColor,
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
  const clickHandlerRef = useRef<((e: any) => void) | null>(null);
  const rebuildingRef = useRef<Promise<void> | null>(null);

  // ---------- helpers ----------
  async function waitForStyle(map: MapboxMap): Promise<void> {
    if (map.isStyleLoaded()) return;
    await new Promise<void>((resolve) => {
      const onLoad = () => {
        if (map.isStyleLoaded()) {
          map.off("style.load", onLoad);
          resolve();
        }
      };
      map.on("style.load", onLoad);
    });
  }

  function uniqueRetailers(fc: FeatureCollection<Point, RetailerProps>) {
    const set = new Set<string>();
    for (const f of fc.features) {
      const p = f.properties || {};
      const retailer =
        (typeof p.retailer === "string" && p.retailer.trim()) ||
        (typeof p.Retailer === "string" && p.Retailer.trim()) ||
        "";
      if (retailer) set.add(retailer);
    }
    return Array.from(set.values());
  }

  function idFromRetailer(r: string) {
    return `ret-${r.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  }

  async function loadRetailerImages(map: MapboxMap, fc: FeatureCollection<Point, RetailerProps>) {
    if (markerStyle !== "logo") return;
    await waitForStyle(map);

    const retailers = uniqueRetailers(fc);
    for (const r of retailers) {
      const id = idFromRetailer(r);
      if (map.hasImage(id)) continue;

      const candidates = [
        withBasePath(`/icons/${r} Logo.png`),
        withBasePath(`/icons/${r} Logo.jpg`),
        withBasePath(`/icons/${r} Logo.jpeg`),
        withBasePath(`/icons/${r} Logo.jfif`),
      ];

      for (const url of candidates) {
        try {
          const img = await loadHTMLImage(url);
          if (!map.hasImage(id)) {
            map.addImage(id, img, { pixelRatio: 2 });
          }
          break;
        } catch {
          /* try next extension */
        }
      }
    }
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

  function ensureHomeMarker(map: MapboxMap) {
    const current = homeMarkerRef.current;
    if (!home) {
      if (current) {
        current.remove();
        homeMarkerRef.current = null;
      }
      return;
    }

    const el =
      current?.getElement() ||
      (() => {
        const div = document.createElement("div");
        div.style.width = "28px";
        div.style.height = "28px";
        div.style.borderRadius = "50%";
        div.style.background = "#10b981"; // emerald
        div.style.boxShadow = "0 1px 6px rgba(0,0,0,.4)";
        div.style.display = "flex";
        div.style.alignItems = "center";
        div.style.justifyContent = "center";
        div.style.transform = "translateY(-6px)";
        div.style.color = "#001";
        div.style.fontSize = "14px";
        div.style.fontWeight = "700";
        div.textContent = "H";
        return div;
      })();

    if (!current) {
      homeMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([home.lng, home.lat])
        .addTo(map);
    } else {
      current.setLngLat([home.lng, home.lat]);
    }
  }

  // Gentle sharpen by adjusting *existing* raster layers only (no new layers)
  async function enhanceRasterLayers(map: MapboxMap) {
    await waitForStyle(map);
    if (!rasterSharpen) return;

    const style = map.getStyle();
    if (!style?.layers) return;

    for (const lyr of style.layers) {
      try {
        if (lyr.type === "raster") {
          map.setPaintProperty(lyr.id, "raster-contrast", 0.2);
          map.setPaintProperty(lyr.id, "raster-brightness-min", 0.0);
          map.setPaintProperty(lyr.id, "raster-brightness-max", 0.9);
        }
      } catch {
        /* ignore if property not supported on this layer */
      }
    }
  }

  // ---------- setup ----------
  useEffect(() => {
    if (!containerRef.current) return;

    mapboxgl.accessToken = mapboxToken || "";
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      projection,
      pitchWithRotate: allowRotate,
      dragRotate: allowRotate,
      center: [-95.6, 39.8],
      zoom: 4,
      attributionControl: true,
      cooperativeGestures: true,
    });
    mapRef.current = map;

    clickHandlerRef.current = (e: any) => {
      if (!props.enableHomePick || !props.onPickHome) return;
      const { lng, lat } = e.lngLat;
      props.onPickHome(lng, lat);
    };

    map.on("load", async () => {
      rebuildingRef.current = initializeOrRebuild(map);
      await rebuildingRef.current;
    });

    return () => {
      clickHandlerRef.current = null;
      map.remove();
      mapRef.current = null;
      if (homeMarkerRef.current) {
        homeMarkerRef.current.remove();
        homeMarkerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-style (basemap switch)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(mapStyle);
    map.once("style.load", async () => {
      rebuildingRef.current = initializeOrRebuild(map);
      await rebuildingRef.current;
    });
  }, [mapStyle]);

  // projection + rotate toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setProjection(projection);
    } catch {}
  }, [projection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.dragRotate.enable(); map.pitchWithRotate = true;
    if (!allowRotate) {
      map.dragRotate.disable(); map.pitchWithRotate = false;
      map.setPitch(0);
      map.setBearing(0);
    }
  }, [allowRotate]);

  // data & visual changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    updateDataAndStyle(map);
  }, [data, markerStyle, showLabels, labelColor, rasterSharpen]);

  // home position & pick mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    ensureHomeMarker(map);
  }, [home]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (enableHomePick && clickHandlerRef.current) {
      map.getCanvas().style.cursor = "crosshair";
      map.on("click", clickHandlerRef.current);
    } else if (clickHandlerRef.current) {
      map.getCanvas().style.cursor = "";
      map.off("click", clickHandlerRef.current);
    }
  }, [enableHomePick]);

  // ---------- core ----------
  async function initializeOrRebuild(map: MapboxMap) {
    await waitForStyle(map);

    // cleanup defensively
    for (const layerId of ["ret-clusters", "ret-cluster-count", "ret-points", "ret-points-logo", "ret-labels"]) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    if (map.getSource("retailers")) map.removeSource("retailers");

    // data source
    map.addSource("retailers", {
      type: "geojson",
      data: data || EMPTY_FC,
      cluster: true,
      clusterMaxZoom: 13,
      clusterRadius: 40,
    });

    // cluster layers
    map.addLayer({
      id: "ret-clusters",
      type: "circle",
      source: "retailers",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": ["step", ["get", "point_count"], "#4ade80", 10, "#22d3ee", 25, "#a78bfa"],
        "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 25, 26],
        "circle-opacity": 0.9,
      },
    });

    map.addLayer({
      id: "ret-cluster-count",
      type: "symbol",
      source: "retailers",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["to-string", ["get", "point_count"]],
        "text-size": 12,
      },
      paint: { "text-color": "#081B0E" },
    });

    // points (both layers; toggle visibility)
    map.addLayer({
      id: "ret-points",
      type: "circle",
      source: "retailers",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": 6,
        "circle-color": "#38bdf8",
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#0b1020",
      },
    });

    map.addLayer({
      id: "ret-points-logo",
      type: "symbol",
      source: "retailers",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-allow-overlap": true,
        "icon-size": 0.7,
        "icon-image": [
          "coalesce",
          ["image", ["concat", "ret-", ["downcase", ["replace", ["get", "Retailer"], /[^a-zA-Z0-9]+/g, "-"]]]],
          ""
        ],
      },
    });

    if (showLabels) {
      map.addLayer({
        id: "ret-labels",
        type: "symbol",
        source: "retailers",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": [
            "coalesce",
            ["get", "Name"],
            ["get", "name"],
            ["get", "Retailer"],
            ["get", "retailer"],
          ],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
        },
        paint: { "text-color": labelColor || "#fff" },
      });
    }

    // optional image loading for logos & raster enhancement
    if (data) await loadRetailerImages(map, data);
    await enhanceRasterLayers(map);
    ensureHomeMarker(map);
  }

  async function updateDataAndStyle(map: MapboxMap) {
    // If a rebuild is in-flight (on setStyle), wait for it first
    if (rebuildingRef.current) {
      try { await rebuildingRef.current; } catch {}
    }
    await waitForStyle(map);

    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource | undefined;
    if (!src) return; // style not fully rebuilt yet

    src.setData(data || EMPTY_FC);

    if (markerStyle === "logo" && data) {
      await loadRetailerImages(map, data);
    }

    const logoVisible = markerStyle === "logo" ? "visible" : "none";
    const circVisible = markerStyle === "logo" ? "none" : "visible";
    if (map.getLayer("ret-points-logo")) map.setLayoutProperty("ret-points-logo", "visibility", logoVisible);
    if (map.getLayer("ret-points")) map.setLayoutProperty("ret-points", "visibility", circVisible);

    if (map.getLayer("ret-labels")) {
      map.setLayoutProperty("ret-labels", "visibility", showLabels ? "visible" : "none");
      map.setPaintProperty("ret-labels", "text-color", labelColor || "#fff");
    }

    await enhanceRasterLayers(map);
  }

  return <div ref={containerRef} className="h-[70vh] w-full rounded-xl overflow-hidden border border-zinc-700" />;
}
