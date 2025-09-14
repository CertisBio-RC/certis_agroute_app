"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection as GJFC, Feature, Point } from "geojson";

export type Basemap = "Hybrid" | "Streets";

export type CertisMapProps = {
  token: string;
  basemap: Basemap;
  data: GJFC;                                   // filtered FeatureCollection (points only)
  bbox: [number, number, number, number];       // fit target when home is not set
  home?: [number, number];                      // lng,lat
  onPointClick?: (lnglat: [number, number], title: string) => void;
};

const STYLE_FOR: Record<Basemap, string> = {
  Hybrid: "mapbox://styles/mapbox/satellite-streets-v12",
  Streets: "mapbox://styles/mapbox/streets-v12",
};

function isPoint(f: Feature): f is Feature<Point> {
  return f.geometry?.type === "Point";
}

function prop(p: any, keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = p?.[k];
    if (v != null && v !== "") return String(v);
  }
  return fallback;
}

function isKingpinProps(p: any): boolean {
  const raw = String(
    prop(p, ["Kingpin", "KINGPIN", "kingpin", "Type", "Location Type"], "")
  ).trim();
  const lc = raw.toLowerCase();
  return lc === "true" || lc === "yes" || lc === "1" || lc === "kingpin";
}

export default function CertisMap(props: CertisMapProps) {
  const { token, basemap, data, bbox, home, onPointClick } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // Split data: all points for clustering, and kingpins (non-clustered)
  const fcAll = useMemo<GJFC>(() => {
    const feats = (data.features || []).filter(isPoint);
    return { type: "FeatureCollection", features: feats };
  }, [data]);

  const fcKingpins = useMemo<GJFC>(() => {
    const feats = (data.features || [])
      .filter(isPoint)
      .filter((f) => isKingpinProps(f.properties));
    return { type: "FeatureCollection", features: feats };
  }, [data]);

  // Token
  useEffect(() => {
    if (token) mapboxgl.accessToken = token;
  }, [token]);

  // Create the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_FOR[basemap],
      center: [-97, 39],
      zoom: 3.5,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    mapRef.current = map;
    popupRef.current = new mapboxgl.Popup({
      closeButton: false,
      closeOnMove: true,
      maxWidth: "320px",
    });

    map.once("style.load", () => {
      addAllSourcesAndLayers(map, fcAll, fcKingpins, onPointClick);
      initialView(map, home, bbox);
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemap changes ⇒ swap style then re-add layers/sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(STYLE_FOR[basemap]);
    map.once("style.load", () => {
      addAllSourcesAndLayers(map, fcAll, fcKingpins, onPointClick);
      initialView(map, home, bbox);
    });
  }, [basemap, fcAll, fcKingpins, onPointClick, home, bbox]);

  // Data changes (after style exists)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const r = map.getSource("retailers") as mapboxgl.GeoJSONSource | undefined;
    const k = map.getSource("kingpins") as mapboxgl.GeoJSONSource | undefined;
    if (r) r.setData(fcAll);
    if (k) k.setData(fcKingpins);
  }, [fcAll, fcKingpins]);

  // Home marker sync (create if missing)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const srcId = "home";
    let src = map.getSource(srcId) as mapboxgl.GeoJSONSource | undefined;
    const fc: GJFC =
      home
        ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: home }, properties: {} }] }
        : { type: "FeatureCollection", features: [] };

    if (!src) {
      map.addSource(srcId, { type: "geojson", data: fc });
      map.addLayer({
        id: "home-circle",
        type: "circle",
        source: srcId,
        paint: {
          "circle-radius": 8,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#00d1b2",
          "circle-stroke-width": 3,
        },
      });
    } else {
      src.setData(fc);
    }
  }, [home]);

  // Re-fit when bbox/home changes (after style ready)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    fitToView(map, home, bbox);
  }, [home, bbox]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "calc(100vh - 160px)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    />
  );
}

/* ---------------- helpers ---------------- */

function addAllSourcesAndLayers(
  map: mapboxgl.Map,
  fcAll: GJFC,
  fcKingpins: GJFC,
  onPointClick?: (lnglat: [number, number], title: string) => void
) {
  // Remove old (on style swap)
  ["cluster-count", "clusters", "unclustered-dots", "kingpin-circles", "home-circle"].forEach((l) =>
    safeRemoveLayer(map, l)
  );
  ["retailers", "kingpins", "home"].forEach((s) => safeRemoveSource(map, s));

  // All points (clustered)
  map.addSource("retailers", {
    type: "geojson",
    data: fcAll,
    cluster: true,
    clusterRadius: 40,
    clusterMaxZoom: 12,
    generateId: true,
  });

  // Kingpins (non-clustered)
  map.addSource("kingpins", {
    type: "geojson",
    data: fcKingpins,
    generateId: true,
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "retailers",
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": ["step", ["get", "point_count"], 18, 10, 26, 25, 34, 50, 42],
      "circle-color": "#5aa6ff",
      "circle-stroke-color": "#1a2742",
      "circle-stroke-width": 2,
      "circle-opacity": 0.9,
    },
  });

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
    paint: { "text-color": "#0b1220" },
  });

  map.addLayer({
    id: "unclustered-dots",
    type: "circle",
    source: "retailers",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": 6,
      "circle-color": [
        "match",
        ["downcase", ["to-string", ["coalesce", ["get", "Location Type"], ["get", "Type"], ""]]],
        "distribution", "#8a8aff",
        "agronomy/grain", "#2fd08c",
        "agronomy", "#2fd08c",
        "grain", "#ffcc66",
        /* default */ "#5dcad6",
      ],
      "circle-stroke-color": "#0b1220",
      "circle-stroke-width": 2,
    },
  });

  map.addLayer({
    id: "kingpin-circles",
    type: "circle",
    source: "kingpins",
    paint: {
      "circle-radius": 7,
      "circle-color": "#ff3b30",        // red
      "circle-stroke-color": "#ffd400", // yellow ring
      "circle-stroke-width": 3,
    },
  });

  hookInteractivity(map, onPointClick);
}

function hookInteractivity(
  map: mapboxgl.Map,
  onPointClick?: (lnglat: [number, number], title: string) => void
) {
  const hoverTargets = ["unclustered-dots", "kingpin-circles"];
  const popup = new mapboxgl.Popup({ closeButton: false, closeOnMove: true, maxWidth: "320px" });

  function htmlFor(f: Feature<Point>): string {
    const p = (f.properties || {}) as any;
    const retailer = prop(p, ["Retailer", "Retailer Name", "Name"], "Unknown");
    const city = prop(p, ["City"], "");
    const st = prop(p, ["State", "ST"], "");
    const kp = isKingpinProps(p);
    const title = kp
      ? `${retailer}<span style="color:#ffd400;margin-left:6px">KINGPIN</span>`
      : retailer;

    return `
      <div class="popup">
        <div class="popup-title">${title}</div>
        <div class="popup-body">${[city, st].filter(Boolean).join(", ")}</div>
      </div>
    `;
  }

  // Accept both mouse and touch layer events
  const showPopup = (ev: mapboxgl.MapLayerMouseEvent | mapboxgl.MapLayerTouchEvent) => {
    const f = ev.features && (ev.features[0] as Feature | undefined);
    if (!f || f.geometry?.type !== "Point") {
      popup.remove();
      return;
    }
    const pt = f as Feature<Point>;
    const coord = (pt.geometry.coordinates as [number, number]).slice() as [number, number];
    popup.setLngLat(coord).setHTML(htmlFor(pt)).addTo(map);
    map.getCanvas().style.cursor = "pointer";
  };

  const hidePopup = () => {
    popup.remove();
    map.getCanvas().style.cursor = "";
  };

  hoverTargets.forEach((id) => {
    map.on("mousemove", id, showPopup);
    map.on("mouseleave", id, hidePopup);
    map.on("touchstart", id, showPopup); // no cast needed with union type
  });

  // Clicking a cluster zooms in
  map.on("click", "clusters", (e) => {
    const src = map.getSource("retailers") as mapboxgl.GeoJSONSource;
    const f = e.features && e.features[0];
    if (!f) return;
    const clusterId = (f.properties as any)["cluster_id"];
    if (typeof clusterId !== "number") return;
    src.getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      const center = (f.geometry as any).coordinates as [number, number];
      map.easeTo({ center, zoom });
    });
  });

  // Click a point → add stop (both callback + DOM event)
  const clickTargets = ["unclustered-dots", "kingpin-circles"];
  clickTargets.forEach((id) => {
    map.on("click", id, (e) => {
      const f = e.features && (e.features[0] as Feature | undefined);
      if (!f || f.geometry?.type !== "Point") return;
      const pt = f as Feature<Point>;
      const coord = pt.geometry.coordinates as [number, number];
      const p = (pt.properties || {}) as any;
      const name = prop(p, ["Retailer", "Retailer Name", "Name"], "Stop");

      // Direct callback if provided:
      onPointClick?.(coord, name);

      // Also dispatch a DOM custom event for any external listener:
      const ce = new CustomEvent("certis:point-click", { detail: { coord, name } });
      map.getContainer().dispatchEvent(ce);
    });
  });

  // Cursor for clusters
  map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
}

function initialView(
  map: mapboxgl.Map,
  home: [number, number] | undefined,
  bbox: [number, number, number, number]
) {
  if (home) {
    map.jumpTo({ center: home, zoom: 10 });
  } else {
    fitToView(map, home, bbox);
  }
}

function fitToView(
  map: mapboxgl.Map,
  home: [number, number] | undefined,
  bbox: [number, number, number, number]
) {
  if (home) {
    map.easeTo({ center: home, zoom: 10 });
  } else if (Array.isArray(bbox) && bbox.length === 4) {
    map.fitBounds(bbox as any, { padding: 40, duration: 600 });
  }
}

function safeRemoveLayer(map: mapboxgl.Map, id: string) {
  if (map.getLayer(id)) map.removeLayer(id);
}
function safeRemoveSource(map: mapboxgl.Map, id: string) {
  if (map.getSource(id)) map.removeSource(id);
}
