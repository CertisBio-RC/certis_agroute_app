// /components/Map.tsx
"use client";

import React, { useEffect, useRef } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import type { Feature, FeatureCollection, Point } from "geojson";

mapboxgl.accessToken = ""; // we set the real token via props

type RetailerProps = Record<string, any>;

type Props = {
  data?: FeatureCollection<Point, RetailerProps>;
  markerStyle: "logo" | "color";
  showLabels: boolean;
  labelColor: string;
  mapStyle: string; // mapbox style uri
  projection: "globe" | "mercator";
  allowRotate: boolean;
  rasterSharpen: boolean; // we only tweak existing raster layers' paint props
  mapboxToken: string;

  home: { lng: number; lat: number; label?: string } | null;
  enableHomePick: boolean;
  onPickHome?: (lng: number, lat: number) => void;
};

// ---------- tiny helpers ----------
const EMPTY_FC: FeatureCollection<Point, RetailerProps> = { type: "FeatureCollection", features: [] };

const repoBase =
  typeof window !== "undefined" && (window as any).__NEXT_DATA__?.props?.pageProps?.NEXT_PUBLIC_REPO_NAME
    ? `/${(window as any).__NEXT_DATA__.props.pageProps.NEXT_PUBLIC_REPO_NAME}`
    : (process.env.NEXT_PUBLIC_REPO_NAME ? `/${process.env.NEXT_PUBLIC_REPO_NAME}` : "");

const withBasePath = (p: string) => `${repoBase}${p}`;

const toIconId = (retailer: string) =>
  `ret-${retailer.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

// defensively add iconId to all features so the style can reference ["get","iconId"]
function addIconIds(
  fc: FeatureCollection<Point, RetailerProps> | undefined,
  wantLogos: boolean
): FeatureCollection<Point, RetailerProps> {
  if (!fc) return EMPTY_FC;
  const cloned: FeatureCollection<Point, RetailerProps> = {
    type: "FeatureCollection",
    features: fc.features.map((f) => {
      const p = { ...(f.properties || {}) };
      if (wantLogos) {
        const retailer =
          (typeof p.retailer === "string" && p.retailer.trim()) ||
          (typeof p.Retailer === "string" && p.Retailer.trim()) ||
          "";
        p.iconId = retailer ? toIconId(retailer) : "";
      } else {
        p.iconId = "";
      }
      const nf: Feature<Point, RetailerProps> = {
        type: "Feature",
        geometry: f.geometry,
        properties: p,
      };
      return nf;
    }),
  };
  return cloned;
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

  // ---------- style readiness ----------
  async function waitForStyle(map: MapboxMap): Promise<void> {
    if (map.isStyleLoaded()) return;
    await new Promise<void>((resolve) => {
      const on = () => {
        if (map.isStyleLoaded()) {
          map.off("style.load", on);
          resolve();
        }
      };
      map.on("style.load", on);
    });
  }

  // ---------- retailer images ----------
  function uniqueRetailers(fc: FeatureCollection<Point, RetailerProps>) {
    const s = new Set<string>();
    for (const f of fc.features) {
      const p = f.properties || {};
      const r =
        (typeof p.retailer === "string" && p.retailer.trim()) ||
        (typeof p.Retailer === "string" && p.Retailer.trim()) ||
        "";
      if (r) s.add(r);
    }
    return Array.from(s);
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

  async function loadRetailerImages(map: MapboxMap, fc: FeatureCollection<Point, RetailerProps>) {
    if (markerStyle !== "logo") return;
    await waitForStyle(map);

    const retailers = uniqueRetailers(fc);
    for (const r of retailers) {
      const id = toIconId(r);
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
          /* try next */
        }
      }
    }
  }

  // ---------- raster tweak (no custom layer) ----------
  async function enhanceRasterLayers(map: MapboxMap) {
    if (!rasterSharpen) return;
    await waitForStyle(map);
    const style = map.getStyle();
    for (const lyr of style.layers || []) {
      if (lyr.type === "raster") {
        try {
          map.setPaintProperty(lyr.id, "raster-contrast", 0.2);
          map.setPaintProperty(lyr.id, "raster-brightness-min", 0.0);
          map.setPaintProperty(lyr.id, "raster-brightness-max", 0.9);
        } catch {
          /* ignore unsupported props */
        }
      }
    }
  }

  // ---------- home marker ----------
  function ensureHomeMarker(map: MapboxMap) {
    if (!home) {
      homeMarkerRef.current?.remove();
      homeMarkerRef.current = null;
      return;
    }
    const baseEl =
      homeMarkerRef.current?.getElement() ||
      (() => {
        const d = document.createElement("div");
        d.style.width = "28px";
        d.style.height = "28px";
        d.style.borderRadius = "50%";
        d.style.background = "#10b981";
        d.style.boxShadow = "0 1px 6px rgba(0,0,0,.4)";
        d.style.display = "flex";
        d.style.alignItems = "center";
        d.style.justifyContent = "center";
        d.style.transform = "translateY(-6px)";
        d.style.color = "#001";
        d.style.fontSize = "14px";
        d.style.fontWeight = "700";
        d.textContent = "H";
        return d;
      })();

    if (!homeMarkerRef.current) {
      homeMarkerRef.current = new mapboxgl.Marker({ element: baseEl, anchor: "bottom" })
        .setLngLat([home.lng, home.lat])
        .addTo(map);
    } else {
      homeMarkerRef.current.setLngLat([home.lng, home.lat]);
    }
  }

  // ---------- init ----------
  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = mapboxToken || "";

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      projection,
      pitchWithRotate: allowRotate, // allowed in ctor even if not in TS type
      dragRotate: allowRotate,
      center: [-95.6, 39.8],
      zoom: 4,
      attributionControl: true,
      cooperativeGestures: true,
    } as any);
    mapRef.current = map;

    clickHandlerRef.current = (e: any) => {
      if (!enableHomePick || !onPickHome) return;
      const { lng, lat } = e.lngLat;
      onPickHome(lng, lat);
    };

    map.on("load", async () => {
      rebuildingRef.current = initializeOrRebuild(map);
      await rebuildingRef.current;
    });

    return () => {
      clickHandlerRef.current = null;
      homeMarkerRef.current?.remove();
      homeMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // basemap switch
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(mapStyle);
    map.once("style.load", async () => {
      rebuildingRef.current = initializeOrRebuild(map);
      await rebuildingRef.current;
    });
  }, [mapStyle]);

  // projection
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try { map.setProjection(projection); } catch {}
  }, [projection]);

  // rotate toggles (no direct pitchWithRotate mutations)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (allowRotate) {
      map.dragRotate.enable();
      try { (map as any).touchZoomRotate?.enable(); } catch {}
    } else {
      map.dragRotate.disable();
      try { (map as any).touchZoomRotate?.disable(); } catch {}
      map.setPitch(0);
      map.setBearing(0);
    }
  }, [allowRotate]);

  // data/visual changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    updateDataAndStyle(map);
  }, [data, markerStyle, showLabels, labelColor, rasterSharpen]);

  // home position
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    ensureHomeMarker(map);
  }, [home]);

  // pick mode
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

  // ---------- build style ----------
  async function initializeOrRebuild(map: MapboxMap) {
    await waitForStyle(map);

    for (const id of ["ret-clusters", "ret-cluster-count", "ret-points", "ret-points-logo", "ret-labels"]) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource("retailers")) map.removeSource("retailers");

    const fc = addIconIds(data, markerStyle === "logo");

    map.addSource("retailers", {
      type: "geojson",
      data: fc,
      cluster: true,
      clusterMaxZoom: 13,
      clusterRadius: 40,
    });

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
      layout: { "text-field": ["to-string", ["get", "point_count"]], "text-size": 12 },
      paint: { "text-color": "#081B0E" },
    });

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
        "icon-image": ["coalesce", ["get", "iconId"], ""],
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

    await loadRetailerImages(map, fc);
    await enhanceRasterLayers(map);
    ensureHomeMarker(map);
  }

  // ---------- update ----------
  async function updateDataAndStyle(map: MapboxMap) {
    if (rebuildingRef.current) {
      try { await rebuildingRef.current; } catch {}
    }
    await waitForStyle(map);

    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    const fc = addIconIds(data, markerStyle === "logo");
    src.setData(fc);

    if (markerStyle === "logo") {
      await loadRetailerImages(map, fc);
    }

    const logoVis = markerStyle === "logo" ? "visible" : "none";
    const circVis = markerStyle === "logo" ? "none" : "visible";
    if (map.getLayer("ret-points-logo")) map.setLayoutProperty("ret-points-logo", "visibility", logoVis);
    if (map.getLayer("ret-points")) map.setLayoutProperty("ret-points", "visibility", circVis);

    if (map.getLayer("ret-labels")) {
      map.setLayoutProperty("ret-labels", "visibility", showLabels ? "visible" : "none");
      map.setPaintProperty("ret-labels", "text-color", labelColor || "#fff");
    }

    await enhanceRasterLayers(map);
    ensureHomeMarker(map);
  }

  return (
    <div
      ref={containerRef}
      className="h-[70vh] w-full rounded-xl overflow-hidden border border-zinc-700"
    />
  );
}
