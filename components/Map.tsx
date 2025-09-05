// components/Map.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";

export type HomeLoc = { lng: number; lat: number; label?: string };

type RetailerProps = Record<string, any>;

type MapProps = {
  data?: FeatureCollection<Point, RetailerProps>;
  markerStyle: "logo" | "color";
  showLabels: boolean;
  labelColor: string;
  mapStyle: string;
  projection: "mercator" | "globe";
  allowRotate: boolean;
  rasterSharpen: boolean;
  mapboxToken: string;
  home: HomeLoc | null;
  enableHomePick: boolean;
  onPickHome?: (lng: number, lat: number) => void;
};

function createHomeMarkerEl(label?: string) {
  // Fixed-size inline SVG => prevents drift at different zooms
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.width = "28px";
  wrap.style.height = "36px";
  wrap.style.pointerEvents = "none";

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.style.width = "28px";
  svg.style.height = "36px";
  svg.style.display = "block";

  const path = document.createElementNS(svgNS, "path");
  path.setAttribute(
    "d",
    "M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z"
  );
  path.setAttribute("fill", "#1e90ff");

  const circle = document.createElementNS(svgNS, "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "9.5");
  circle.setAttribute("r", "2.75");
  circle.setAttribute("fill", "#ffffff");

  svg.appendChild(path);
  svg.appendChild(circle);
  wrap.appendChild(svg);

  if (label) {
    const lab = document.createElement("div");
    lab.textContent = label;
    lab.style.position = "absolute";
    lab.style.left = "50%";
    lab.style.top = "-4px";
    lab.style.transform = "translate(-50%, -100%)";
    lab.style.background = "rgba(17,24,39,0.9)";
    lab.style.color = "#e5e7eb";
    lab.style.padding = "2px 6px";
    lab.style.borderRadius = "6px";
    lab.style.fontSize = "12px";
    lab.style.whiteSpace = "nowrap";
    lab.style.pointerEvents = "auto";
    wrap.appendChild(lab);
  }
  return wrap;
}

export default function MapView(props: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // token
  useEffect(() => {
    if (props.mapboxToken) mapboxgl.accessToken = props.mapboxToken;
  }, [props.mapboxToken]);

  // init
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: props.mapStyle,
      projection: props.projection,
      center: [-96, 40.5],
      zoom: 4,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");

    // pick-home toggle
    const clickHandler = (e: any) => {
      if (!props.enableHomePick || !props.onPickHome) return;
      const { lng, lat } = e.lngLat;
      props.onPickHome(lng, lat);
    };
    map.on("click", clickHandler);

    mapRef.current = map;

    return () => {
      map.off("click", clickHandler);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // once

  // style / projection / rotation
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getStyle()?.sprite?.includes(props.mapStyle)) return;

    map.setStyle(props.mapStyle);
    map.once("styledata", () => {
      // re-add data after style change
      addOrUpdateSourceAndLayers(map, props);
      // restore home marker
      if (homeMarkerRef.current) {
        homeMarkerRef.current.addTo(map);
      }
    });
  }, [props.mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setProjection(props.projection);
    } catch {}
  }, [props.projection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      if (props.allowRotate) {
        map.dragRotate.enable();
        map.touchZoomRotate.enableRotation();
      }
    } catch {}
  }, [props.allowRotate]);

  // data
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) {
      map.once("styledata", () => addOrUpdateSourceAndLayers(map, props));
      return;
    }
    addOrUpdateSourceAndLayers(map, props);
  }, [props.data, props.markerStyle, props.showLabels, props.labelColor]);

  // Home marker (drift-free)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (homeMarkerRef.current) {
      homeMarkerRef.current.remove();
      homeMarkerRef.current = null;
    }
    if (!props.home) return;

    const el = createHomeMarkerEl(props.home.label || "Home");
    const m = new mapboxgl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([props.home.lng, props.home.lat])
      .addTo(map);
    homeMarkerRef.current = m;
    // ensure above clusters
    try {
      (m as any)._element.style.zIndex = "2";
    } catch {}
  }, [props.home]);

  // raster "sharpen" (best-effort, only if raster layers exist)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return;

    const layers = map.getStyle().layers || [];
    for (const l of layers) {
      if (l.type === "raster") {
        try {
          map.setPaintProperty(
            l.id,
            "raster-contrast",
            props.rasterSharpen ? 0.15 : 0,
          );
          map.setPaintProperty(
            l.id,
            "raster-brightness-max",
            props.rasterSharpen ? 0.98 : 1,
          );
        } catch {}
      }
    }
  }, [props.rasterSharpen, props.mapStyle]);

  return (
    <div
      ref={containerRef}
      className="h-[72vh] w-full overflow-hidden rounded-xl border border-zinc-700"
    />
  );
}

// Helpers

function addOrUpdateSourceAndLayers(map: MapboxMap, props: MapProps) {
  const srcId = "retailers";
  const has = !!map.getSource(srcId);

  const data =
    props.data || ({
      type: "FeatureCollection",
      features: [],
    } as FeatureCollection<Point, RetailerProps>);

  if (!has) {
    map.addSource(srcId, {
      type: "geojson",
      data,
      cluster: true,
      clusterMaxZoom: 12,
      clusterRadius: 48,
    });

    // clusters
    map.addLayer({
      id: "clusters",
      type: "circle",
      source: srcId,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#10b981",
        "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 26, 60, 32],
        "circle-opacity": 0.9,
      },
    });

    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: srcId,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-size": 12,
      },
      paint: { "text-color": "#111827" },
    });

    // unclustered
    map.addLayer({
      id: "unclustered-point",
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": props.markerStyle === "color" ? "#38bdf8" : "#0ea5e9",
        "circle-radius": 6,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#111827",
      },
    });

    if (props.showLabels) {
      map.addLayer({
        id: "unclustered-label",
        type: "symbol",
        source: srcId,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": [
            "coalesce",
            ["get", "Name"],
            ["get", "name"],
            ["get", "Retailer"],
            ["get", "retailer"],
          ],
          "text-offset": [0, 1.2],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": 11,
        },
        paint: { "text-color": props.labelColor || "#fff200", "text-halo-color": "#111827", "text-halo-width": 1.5 },
      });
    }
  } else {
    const src = map.getSource(srcId) as mapboxgl.GeoJSONSource;
    src.setData(data);
    try {
      map.setPaintProperty(
        "unclustered-point",
        "circle-color",
        props.markerStyle === "color" ? "#38bdf8" : "#0ea5e9",
      );
      if (props.showLabels) {
        map.setLayoutProperty("unclustered-label", "visibility", "visible");
        map.setPaintProperty("unclustered-label", "text-color", props.labelColor || "#fff200");
      } else {
        map.setLayoutProperty("unclustered-label", "visibility", "none");
      }
    } catch {}
  }
}
