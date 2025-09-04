// components/Map.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import type { MapMouseEvent } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Feature, FeatureCollection, Point } from "geojson";
import { colorForRetailer, iconUrlCandidates } from "@/utils/retailerStyles";

type MarkerStyle = "color" | "logo";
type RetailerProps = Record<string, any>;
type ProjectionMode = "mercator" | "globe";

export interface MapProps {
  data?: FeatureCollection<Point, RetailerProps>;
  dataUrl?: string;
  mapboxToken?: string;
  mapStyle?: string;
  markerStyle?: MarkerStyle;
  showLabels?: boolean;
  labelColor?: string;
  projection?: ProjectionMode;
  allowRotate?: boolean;
  rasterSharpen?: boolean;
  initialCenter?: [number, number];
  initialZoom?: number;
  onReady?: () => void;
  home?: { lng: number; lat: number; label?: string } | null;
  enableHomePick?: boolean;
  onPickHome?: (lng: number, lat: number) => void;
}

export default function AgMap({
  data,
  dataUrl,
  mapboxToken,
  mapStyle = "mapbox://styles/mapbox/streets-v12",
  markerStyle = "logo",
  showLabels = true,
  labelColor = "#fff200",
  projection = "mercator",
  allowRotate = false,
  rasterSharpen = false,
  initialCenter = [-94.0, 41.9],
  initialZoom = 6,
  onReady,
  home = null,
  enableHomePick = false,
  onPickHome,
}: MapProps) {
  const resolvedToken =
    mapboxToken ||
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
    process.env.MAPBOX_PUBLIC_TOKEN ||
    "";

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  // Use globalThis.Map so built-in Map is never shadowed
  const markerPoolRef = useRef<globalThis.Map<string, mapboxgl.Marker>>(
    new globalThis.Map<string, mapboxgl.Marker>()
  );
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const [fetchError, setFetchError] = useState<string | null>(null);
  const [geojson, setGeojson] = useState<FeatureCollection<Point, RetailerProps> | null>(
    data || null
  );

  // Load external data if dataUrl provided
  useEffect(() => {
    let cancelled = false;
    if (!geojson && dataUrl) {
      const ts = Date.now();
      const url = dataUrl.includes("?") ? `${dataUrl}&ts=${ts}` : `${dataUrl}?ts=${ts}`;
      (async () => {
        try {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`Fetch failed (${r.status})`);
          const j = (await r.json()) as FeatureCollection<Point, RetailerProps>;
          if (!cancelled) setGeojson(j);
        } catch (err: any) {
          if (!cancelled) setFetchError(err?.message || "Failed to load GeoJSON");
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [dataUrl, geojson]);

  // If parent passes data directly
  useEffect(() => {
    if (data) setGeojson(data);
  }, [data]);

  // Create map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!resolvedToken) console.error("Mapbox token missing.");

    mapboxgl.accessToken = resolvedToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
      maxTileCacheSize: 512,
    });

    const nav = new mapboxgl.NavigationControl({
      visualizePitch: true,
      showCompass: allowRotate,
      showZoom: true,
    });
    map.addControl(nav, "top-right");
    map.addControl(
      new mapboxgl.AttributionControl({
        compact: true,
        customAttribution: "© Certis AgRoute",
      })
    );

    const onInitialLoad = () => {
      applyProjectionAndRotation(map, projection, allowRotate);
      ensureSourcesAndLayers(map, showLabels, labelColor);
      if (rasterSharpen) tweakSatellitePaint(map);
      onReady?.();
    };

    map.on("load", onInitialLoad);
    map.on("style.load", () => {
      applyProjectionAndRotation(map, projection, allowRotate);
      ensureSourcesAndLayers(map, showLabels, labelColor);
      if (rasterSharpen) tweakSatellitePaint(map);
    });

    // FIX: Mapbox GL v3 – use MapMouseEvent only
    const clickHandler = (e: MapMouseEvent) => {
      if (!enableHomePick || !onPickHome) return;
      const { lng, lat } = e.lngLat;
      onPickHome(lng, lat);
    };
    map.on("click", clickHandler);

    mapRef.current = map;
    return () => {
      markerPoolRef.current.forEach((m) => m.remove());
      markerPoolRef.current.clear();
      if (homeMarkerRef.current) {
        homeMarkerRef.current.remove();
        homeMarkerRef.current = null;
      }
      map.off("click", clickHandler);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Style / projection / rotation toggles
  useEffect(() => {
    const m = mapRef.current;
    if (m) m.setStyle(mapStyle);
  }, [mapStyle]);

  useEffect(() => {
    const m = mapRef.current;
    if (m) applyProjectionAndRotation(m, projection, allowRotate);
  }, [projection, allowRotate]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded()) return;
    if (rasterSharpen) tweakSatellitePaint(m);
  }, [rasterSharpen]);

  // Data and markers
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded()) return;

    if (geojson) {
      const src = m.getSource("retailers") as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(geojson);
    }

    const handleRender = () => updateVisibleMarkers(m, markerStyle);
    m.on("render", handleRender);
    return () => {
      m.off("render", handleRender);
      markerPoolRef.current.forEach((mk) => mk.remove());
      markerPoolRef.current.clear();
    };
  }, [geojson, markerStyle]);

  // Home marker
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded()) return;
    if (!home) {
      if (homeMarkerRef.current) {
        homeMarkerRef.current.remove();
        homeMarkerRef.current = null;
      }
      return;
    }
    const el = createHomeMarkerEl(home.label);
    if (homeMarkerRef.current) {
      homeMarkerRef.current.setLngLat([home.lng, home.lat]).setElement(el);
    } else {
      homeMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([home.lng, home.lat])
        .addTo(m);
    }
  }, [home]);

  // UI overlays
  const loader = useMemo(() => {
    if (!geojson && !fetchError) {
      return (
        <div className="absolute left-3 top-3 z-10 rounded-xl bg-white/90 px-3 py-2 text-sm shadow">
          Loading data…
        </div>
      );
    }
    if (fetchError) {
      return (
        <div className="absolute left-3 top-3 z-10 max-w-[360px] rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 shadow">
          Error loading data: {fetchError}
        </div>
      );
    }
    if (enableHomePick) {
      return (
        <div className="absolute left-3 top-3 z-10 rounded-xl bg-yellow-50 px-3 py-2 text-sm text-yellow-900 shadow">
          Click on the map to set <b>Home</b>.
        </div>
      );
    }
    return null;
  }, [geojson, fetchError, enableHomePick]);

  return (
    <div className="relative h-[calc(100vh-8rem)] w-full rounded-2xl overflow-hidden border border-gray-200">
      {loader}
      <div ref={containerRef} className="h-full w-full" />
      <div
        className="pointer-events-none absolute bottom-3 left-3 rounded-xl bg-white/90 px-3 py-2 text-xs text-gray-700 shadow"
        aria-hidden
      >
        Markers: <b>{markerStyle === "logo" ? "Retailer logos" : "Retailer colors"}</b>
      </div>
    </div>
  );

  // ---------- internals ----------
  function ensureSourcesAndLayers(map: MapboxMap, showLbls: boolean, lblColor: string) {
    if (!map.getSource("retailers")) {
      map.addSource("retailers", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 48,
      });
    }
    if (!map.getLayer("clusters")) {
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "retailers",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#93c5fd", 10, "#60a5fa", 30, "#3b82f6", 60, "#1d4ed8"],
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 24, 60, 28],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
    }
    if (!map.getLayer("cluster-count")) {
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "retailers",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });
    }
    if (!map.getLayer("unclustered-point")) {
      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "retailers",
        filter: ["!", ["has", "point_count"]],
        paint: { "circle-radius": 0.1, "circle-color": "#000", "circle-opacity": 0.01 },
      });
    }
    if (showLbls && !map.getLayer("retailer-labels")) {
      map.addLayer({
        id: "retailer-labels",
        type: "symbol",
        source: "retailers",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["coalesce", ["get", "Name"], ["get", "name"], ["get", "Retailer"], ["get", "retailer"], ""],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 12,
          "text-offset": [0, 1.4],
          "text-anchor": "top",
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": lblColor,
          "text-halo-color": "#000",
          "text-halo-width": 1.25,
          "text-halo-blur": 0.2,
        },
      });
    }

    map.on("click", "clusters", (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
      const clusterId = (features?.[0]?.properties as any)?.cluster_id;
      if (clusterId == null) return;
      (map.getSource("retailers") as mapboxgl.GeoJSONSource).getClusterExpansionZoom(
        clusterId,
        (err, zoom) => {
          if (err) return;
          map.easeTo({
            center: (features[0].geometry as any).coordinates as [number, number],
            zoom,
          });
        }
      );
    });
    map.on("mouseenter", "clusters", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "clusters", () => {
      map.getCanvas().style.cursor = "";
    });
  }

  function updateVisibleMarkers(map: MapboxMap, style: MarkerStyle) {
    if (!map.getLayer("unclustered-point")) return;
    const features = map.queryRenderedFeatures({
      layers: ["unclustered-point"],
    }) as unknown as Feature<Point, RetailerProps>[];
    const nextKeys = new Set<string>();

    for (const f of features) {
      if (!f?.geometry?.coordinates) continue;
      const key = makeKey(f);
      nextKeys.add(key);
      if (markerPoolRef.current.has(key)) continue;

      const p = f.properties || {};
      const retailer = pick(p, ["retailer", "Retailer"]);
      const name = pick(p, ["name", "Name"]);
      const city = pick(p, ["city", "City"]);
      const state = pick(p, ["state", "State"]);
      const category = pick(p, ["category", "Category"]);
      const color = colorForRetailer(retailer);

      const el = createMarkerEl(retailer, name, city, color, style);
      el.title = [name || retailer || "Location", city && state ? `${city}, ${state}` : city || state, category]
        .filter(Boolean)
        .join(" • ");

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(f.geometry.coordinates as [number, number])
        .addTo(map);

      const popupHtml = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;min-width:180px;line-height:1.25">
          <div style="font-weight:700;margin-bottom:4px">${escapeHtml(name || retailer || "Location")}</div>
          <div style="font-size:12px;opacity:.85">${escapeHtml(category || "")}</div>
          <div style="font-size:12px;opacity:.85">${escapeHtml(city || "")}${city && state ? ", " : ""}${escapeHtml(state || "")}</div>
        </div>`;
      marker.getElement().addEventListener("click", () => {
        new mapboxgl.Popup({ offset: 16 })
          .setLngLat(f.geometry.coordinates as [number, number])
          .setHTML(popupHtml)
          .addTo(map);
      });

      markerPoolRef.current.set(key, marker);
    }
    for (const [key, m] of markerPoolRef.current.entries()) {
      if (!nextKeys.has(key)) {
        m.remove();
        markerPoolRef.current.delete(key);
      }
    }
  }

  function createMarkerEl(
    retailer?: string,
    name?: string,
    city?: string,
    fallbackColor?: string,
    style?: MarkerStyle
  ) {
    const el = document.createElement("div");
    el.style.position = "relative";
    el.style.display = "grid";
    el.style.placeItems = "center";
    el.style.width = "34px";
    el.style.height = "34px";
    el.style.borderRadius = "9999px";
    el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.25)";
    el.style.border = "2px solid #ffffff";
    el.style.background = fallbackColor || "#3b82f6";

    if (style === "logo") {
      const candidates = iconUrlCandidates(retailer, name, city);
      if (candidates.length) {
        const img = document.createElement("img");
        img.alt = retailer || name || "Retailer";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        img.style.borderRadius = "9999px";
        let i = 0;
        const tryNext = () => {
          if (i >= candidates.length) {
            img.remove();
            return;
          }
          img.src = candidates[i++];
        };
        img.addEventListener("error", () => tryNext(), { passive: true } as any);
        tryNext();
        el.appendChild(img);
      }
    }
    return el;
  }

  function createHomeMarkerEl(title?: string) {
    const wrap = document.createElement("div");
    wrap.title = title || "Home";
    wrap.style.position = "relative";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.style.width = "30px";
    svg.style.height = "30px";
    svg.innerHTML =
      '<path d="M12 2l9 8h-3v10h-5V14H11v6H6V10H3l9-8z" fill="#10b981" stroke="#fff" stroke-width="1.5" />';
    wrap.appendChild(svg);
    return wrap;
  }

  function applyProjectionAndRotation(map: MapboxMap, proj: ProjectionMode, canRotate: boolean) {
    try {
      map.setProjection(proj as any);
    } catch {}
    if (canRotate) {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
    } else {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      if (map.getPitch()) map.setPitch(0);
      if (map.getBearing()) map.setBearing(0);
    }
  }

  function tweakSatellitePaint(map: MapboxMap) {
    const style = map.getStyle();
    if (!style?.layers) return;
    for (const layer of style.layers) {
      if (layer.type === "raster" && layer.id) {
        try {
          map.setPaintProperty(layer.id, "raster-contrast", 0.15);
          map.setPaintProperty(layer.id, "raster-brightness-min", 0.03);
          map.setPaintProperty(layer.id, "raster-brightness-max", 0.97);
        } catch {}
      }
    }
  }
}

function pick(obj: any, keys: string[]) {
  for (const k of keys) if (obj && typeof obj[k] === "string" && obj[k].trim()) return String(obj[k]).trim();
  return "";
}
function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
}
function makeKey(f: Feature<Point, Record<string, any>>) {
  const p = f.properties || {};
  const retailer = (p.retailer || p.Retailer || "").trim();
  const name = (p.name || p.Name || "").trim();
  const [lng, lat] = (f.geometry?.coordinates as [number, number]) || [0, 0];
  return `${retailer}|${name}|${lng.toFixed(5)},${lat.toFixed(5)}`;
}
