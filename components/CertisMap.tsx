"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection as GJFC, Feature, Point } from "geojson";

export type Basemap = "Hybrid" | "Streets";

export type CertisMapProps = {
  token: string;
  basemap: Basemap;
  data: GJFC;                                   // filtered feature collection (points only)
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
  const v1 = String(prop(p, ["Kingpin", "KINGPIN", "kingpin", "Type", "Location Type"], "")).trim();
  const lc = v1.toLowerCase();
  return lc === "true" || lc === "yes" || lc === "1" || lc === "kingpin";
}

export default function CertisMap(props: CertisMapProps) {
  const { token, basemap, data, bbox, home, onPointClick } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // Split data into two FCs: all points (for cluster) and kingpins only (non-cluster layer)
  const fcAll = useMemo<GJFC>(() => {
    const feats = (data.features || []).filter(isPoint);
    return { type: "FeatureCollection", features: feats };
  }, [data]);

  const fcKingpins = useMemo<GJFC>(() => {
    const feats = (data.features || []).filter(isPoint).filter((f) => isKingpinProps(f.properties));
    return { type: "FeatureCollection", features: feats };
  }, [data]);

  // Ensure token
  useEffect(() => {
    if (!token) return;
    mapboxgl.accessToken = token;
  }, [token]);

  // Create the map (once)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_FOR[basemap],
      center: [-97, 39], // fly to bbox/home later
      zoom: 3.5,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    mapRef.current = map;
    popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnMove: true, maxWidth: "320px" });

    // When the first style is ready, add our sources/layers.
    map.once("style.load", () => {
      addAllSourcesAndLayers(map, fcAll, fcKingpins);
      initialView(map, home, bbox);
    });

    // Cleanup
    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to basemap changes by replacing style, then re-adding sources/layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const styleUrl = STYLE_FOR[basemap];
    if (map.getStyle()?.sprite?.includes(styleUrl)) return; // already on this style (cheap guard)
    map.setStyle(styleUrl);
    map.once("style.load", () => {
      addAllSourcesAndLayers(map, fcAll, fcKingpins);
      // re-center after style swap
      initialView(map, home, bbox);
    });
  }, [basemap, fcAll, fcKingpins, bbox, home]);

  // Update data in place when FCs change and style is already present
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const r = map.getSource("retailers") as mapboxgl.GeoJSONSource | undefined;
    if (r) r.setData(fcAll);
    const k = map.getSource("kingpins") as mapboxgl.GeoJSONSource | undefined;
    if (k) k.setData(fcKingpins);
  }, [fcAll, fcKingpins]);

  // Keep home marker in sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // create/update simple geojson for home
    const srcId = "home";
    let src = map.getSource(srcId) as mapboxgl.GeoJSONSource | undefined;
    if (!src) {
      map.addSource(srcId, {
        type: "geojson",
        data: home
          ? {
              type: "FeatureCollection",
              features: [
                { type: "Feature", geometry: { type: "Point", coordinates: home }, properties: {} },
              ],
            }
          : { type: "FeatureCollection", features: [] },
      });
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
      src.setData(
        home
          ? {
              type: "FeatureCollection",
              features: [
                { type: "Feature", geometry: { type: "Point", coordinates: home }, properties: {} },
              ],
            }
          : { type: "FeatureCollection", features: [] }
      );
    }
  }, [home]);

  // Fit when bbox/home changes (only after style is ready)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return;
    fitToView(map, home, bbox);
  }, [home, bbox]);

  return <div ref={containerRef} style={{ width: "100%", height: "calc(100vh - 160px)", borderRadius: 14, overflow: "hidden" }} />;
}

/* ---------------- helpers for map wiring ---------------- */

function addAllSourcesAndLayers(
  map: mapboxgl.Map,
  fcAll: GJFC,
  fcKingpins: GJFC
) {
  // Remove if exist (style swaps)
  safeRemoveLayer(map, "cluster-count");
  safeRemoveLayer(map, "clusters");
  safeRemoveLayer(map, "unclustered-dots");
  safeRemoveLayer(map, "kingpin-circles");
  safeRemoveSource(map, "retailers");
  safeRemoveSource(map, "kingpins");

  // Clustered source for ALL points
  map.addSource("retailers", {
    type: "geojson",
    data: fcAll,
    cluster: true,
    clusterRadius: 40,
    clusterMaxZoom: 12,
    generateId: true,
  });

  // NON-cluster source for kingpins only (always visible)
  map.addSource("kingpins", {
    type: "geojson",
    data: fcKingpins,
    generateId: true,
  });

  // Cluster bubbles
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "retailers",
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": [
        "step",
        ["get", "point_count"],
        18, 10, 26, 25, 34, 50, 42,
      ],
      "circle-color": "#5aa6ff",
      "circle-stroke-color": "#1a2742",
      "circle-stroke-width": 2,
      "circle-opacity": 0.9,
    },
  });

  // Cluster labels
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

  // Unclustered dots (non-kingpins only). We render them by drawing from the cluster source
  // and excluding features that are clusters.
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
        /* other */ "#5dcad6",
      ],
      "circle-stroke-color": "#0b1220",
      "circle-stroke-width": 2,
    },
  });

  // Kingpins (from a separate non-clustered source)
  map.addLayer({
    id: "kingpin-circles",
    type: "circle",
    source: "kingpins",
    paint: {
      "circle-radius": 7,
      "circle-color": "#ff3b30",          // bright red
      "circle-stroke-color": "#ffd400",   // yellow ring
      "circle-stroke-width": 3,
    },
  });

  hookInteractivity(map);
}

function hookInteractivity(map: mapboxgl.Map) {
  const hoverTargets = ["unclustered-dots", "kingpin-circles"];
  const popup = new mapboxgl.Popup({ closeButton: false, closeOnMove: true, maxWidth: "320px" });

  function htmlFor(f: Feature<Point>): string {
    const p = (f.properties || {}) as any;
    const retailer = prop(p, ["Retailer", "Retailer Name", "Name"], "Unknown");
    const city = prop(p, ["City"], "");
    const st = prop(p, ["State", "ST"], "");
    const kp = isKingpinProps(p);
    const title = kp ? `${retailer}<span style="color:#ffd400;margin-left:6px">KINGPIN</span>` : retailer;

    // optional logo in popup if you ever add logos again:
    // const logo = prop(p, ["logo_url","logo"], "");
    // const img = logo ? `<img src="${logo}" style="max-width:120px;display:block;margin-bottom:6px" />` : "";

    return `
      <div class="popup">
        <div class="popup-title">${title}</div>
        <div class="popup-body">${[city, st].filter(Boolean).join(", ")}</div>
      </div>
    `;
  }

  const showPopup = (ev: mapboxgl.MapLayerMouseEvent) => {
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
    map.on("touchstart", id, (e) => showPopup(e as mapboxgl.MapLayerMouseEvent));
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

  // Clicking a point calls back to the page to add a stop
  const clickTargets = ["unclustered-dots", "kingpin-circles"];
  clickTargets.forEach((id) => {
    map.on("click", id, (e) => {
      const f = e.features && (e.features[0] as Feature | undefined);
      if (!f || f.geometry?.type !== "Point") return;
      const pt = f as Feature<Point>;
      const coord = pt.geometry.coordinates as [number, number];
      const p = (pt.properties || {}) as any;
      const name = prop(p, ["Retailer", "Retailer Name", "Name"], "Stop");
      // Attach a DOM CustomEvent so the parent can listen if desired.
      const ce = new CustomEvent("certis:point-click", { detail: { coord, name } });
      map.getContainer().dispatchEvent(ce);
    });
  });

  // Keep pointer for clusters as well
  map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
}

function initialView(map: mapboxgl.Map, home: [number, number] | undefined, bbox: [number, number, number, number]) {
  // After first load: center either on home or bbox
  if (home) {
    map.jumpTo({ center: home, zoom: 10 });
  } else {
    fitToView(map, home, bbox);
  }
}

function fitToView(map: mapboxgl.Map, home: [number, number] | undefined, bbox: [number, number, number, number]) {
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
