"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import type { FeatureCollection, Point, Position, Feature, GeoJsonProperties } from "geojson";
import { withBasePath } from "@/utils/paths";

// ---------- Types ----------
export type CertisMapProps = {
  // New API
  main?: FeatureCollection<Point, { [k: string]: any }>;
  kingpins?: FeatureCollection<Point, { [k: string]: any }>;
  home?: Position | null;
  mapStyle?: "hybrid" | "street";
  onPointClick?: (props: any, ll: mapboxgl.LngLat) => void;

  // Legacy (still accepted; page.tsx currently uses these)
  styleMode?: "hybrid" | "street";
  selectedSuppliers?: string[];
  onAddStop?: (s: { name?: string; coord: [number, number]; [k: string]: any }) => void;
  onDataLoaded?: React.Dispatch<React.SetStateAction<any>>;
};

// ---------- Constants ----------
const STYLE_HYBRID = "mapbox://styles/mapbox/satellite-streets-v12";
const STYLE_STREET = "mapbox://styles/mapbox/streets-v12";

const MAIN_SRC = "certis-main";
const MAIN_CLUSTERS = "certis-main-clusters";
const MAIN_CLUSTER_COUNT = "certis-main-cluster-count";
const MAIN_POINTS = "certis-main-points";

const KING_SRC = "certis-kingpins";
const KING_LAYER = "certis-kingpins-points";

const HOME_SRC = "certis-home";
const HOME_LAYER = "certis-home-point";

// Category colors used for non-kingpin points + legend in the UI
export const CATEGORY_COLOR: Record<string, string> = {
  "agronomy": "#26c26a",
  "agronomy/grain": "#8e5bd3",
  "distribution": "#0bbbd6",
  "grain": "#f1c232",
  "grain/feed": "#8e6d00",
  "kingpin": "#ff4d4f",
  "office/service": "#3b82f6",
};
const DEFAULT_POINT_COLOR = "#71d1f1";

function categoryPaintExpression(): any {
  const cat = [
    "downcase",
    ["to-string",
      ["coalesce", ["get", "category"], ["get", "Category"], ["get", "type"], ["get", "Type"], ""],
    ],
  ];
  const match: any[] = ["match", cat];
  Object.entries(CATEGORY_COLOR).forEach(([k, v]) => match.push(k, v));
  match.push(DEFAULT_POINT_COLOR);
  return match;
}

function toTuple2(pos: Position | null | undefined): [number, number] | null {
  if (!pos || pos.length < 2) return null;
  return [Number(pos[0]), Number(pos[1])];
}
function emptyFC(): FeatureCollection<Point> {
  return { type: "FeatureCollection", features: [] };
}
function styleUrlFor(s: "hybrid" | "street") {
  return s === "hybrid" ? STYLE_HYBRID : STYLE_STREET;
}

// ---------- Component ----------
const CertisMap: React.FC<CertisMapProps> = (props) => {
  const {
    main = emptyFC(),
    kingpins = emptyFC(),
    home = null,
    mapStyle,
    onPointClick,
    // legacy
    styleMode,
    onAddStop,
    onDataLoaded,
  } = props;

  const selectedStyle: "hybrid" | "street" = styleMode ?? mapStyle ?? "hybrid";

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);

  // Ensure Mapbox token
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!mapboxgl.accessToken) {
          const resp = await fetch(withBasePath("/mapbox-token"));
          const t = (await resp.text()).trim();
          if (mounted && t) mapboxgl.accessToken = t;
        }
      } catch {}
      if (mounted) setReady(true);
    })();
    return () => { mounted = false; };
  }, []);

  // Init map once
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;

    const m = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUrlFor(selectedStyle),
      attributionControl: false,
      hash: false,
      pitchWithRotate: false,
      dragRotate: false,
      cooperativeGestures: true,
      projection: { name: "mercator" as any },
    });

    mapRef.current = m;
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    m.addControl(new mapboxgl.AttributionControl({ compact: true }));

    m.once("style.load", () => {
      try {
        m.setProjection({ name: "mercator" as any });
        wireSourcesAndLayers(m);
        wireEvents(m);
        setData(m, main, kingpins, home, onPointClick, onAddStop);
        // initial bounds (CONUS)
        m.fitBounds([[-124.848974, 24.396308], [-66.885444, 49.384358]], { padding: 40, duration: 0 });
        // ping legacy summary hook if present
        if (onDataLoaded) {
          onDataLoaded({
            total: (main.features?.length ?? 0) + (kingpins.features?.length ?? 0),
          });
        }
      } catch {}
    });

    return () => {
      try { (m as any).__certisPopup?.remove(); } catch {}
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Change style (Hybrid/Street)
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.setStyle(styleUrlFor(selectedStyle));
    m.once("style.load", () => {
      try {
        m.setProjection({ name: "mercator" as any });
        wireSourcesAndLayers(m);
        wireEvents(m);
        setData(m, main, kingpins, home, onPointClick, onAddStop);
      } catch {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStyle]);

  // Update data on props change
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (!m.isStyleLoaded()) {
      m.once("style.load", () => setData(m, main, kingpins, home, onPointClick, onAddStop));
      return;
    }
    setData(m, main, kingpins, home, onPointClick, onAddStop);
  }, [main, kingpins, home, onPointClick, onAddStop]);

  return <div ref={containerRef} className="map-root" />; // NOTE: no map-frame logo
};

// ---------- Wiring helpers ----------
function wireSourcesAndLayers(m: mapboxgl.Map) {
  // Remove any leftovers (fresh style)
  ["layer", "source"].forEach(() => {
    [MAIN_CLUSTERS, MAIN_CLUSTER_COUNT, MAIN_POINTS].forEach((id) => { if (m.getLayer(id)) m.removeLayer(id); });
    [KING_LAYER].forEach((id) => { if (m.getLayer(id)) m.removeLayer(id); });
    [HOME_LAYER].forEach((id) => { if (m.getLayer(id)) m.removeLayer(id); });
    [MAIN_SRC, KING_SRC, HOME_SRC].forEach((id) => { if (m.getSource(id)) m.removeSource(id); });
  });

  // Sources
  m.addSource(MAIN_SRC, { type: "geojson", data: emptyFC(), cluster: true, clusterRadius: 55, clusterMaxZoom: 12 });
  m.addSource(KING_SRC, { type: "geojson", data: emptyFC() });
  m.addSource(HOME_SRC, { type: "geojson", data: emptyFC() });

  // Cluster circles
  m.addLayer({
    id: MAIN_CLUSTERS,
    type: "circle",
    source: MAIN_SRC,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#68e0cf",
      "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 25, 24, 50, 30],
      "circle-stroke-color": "#0d2231",
      "circle-stroke-width": 1.5,
    },
  });

  // Cluster counts
  m.addLayer({
    id: MAIN_CLUSTER_COUNT,
    type: "symbol",
    source: MAIN_SRC,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12,
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
    },
    paint: { "text-color": "#002d3d" },
  });

  // Unclustered points (category color)
  m.addLayer({
    id: MAIN_POINTS,
    type: "circle",
    source: MAIN_SRC,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": categoryPaintExpression() as any,
      "circle-radius": 6,
      "circle-stroke-width": 1.25,
      "circle-stroke-color": "#0d2231",
    },
  });

  // Kingpins on top
  m.addLayer({
    id: KING_LAYER,
    type: "circle",
    source: KING_SRC,
    paint: {
      "circle-color": "#ff4d4f",
      "circle-radius": 7,
      "circle-stroke-width": 2.25,
      "circle-stroke-color": "#ffd43b",
    },
  });

  // Home
  m.addLayer({
    id: HOME_LAYER,
    type: "circle",
    source: HOME_SRC,
    paint: {
      "circle-color": "#ffffff",
      "circle-radius": 5,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#3b82f6",
    },
  });

  // Events
  // Hover
  const hoverMove = (e: mapboxgl.MapLayerMouseEvent) => {
    m.getCanvas().style.cursor = "pointer";
    const feat = e.features?.[0] as Feature<Point, GeoJsonProperties> | undefined;
    if (!feat) return;
    const p = feat.properties || {};
    const [lng, lat] = (feat.geometry?.coordinates || []) as [number, number];

    const name = String(p.name ?? p.Name ?? p.title ?? "Location");
    const cat = String((p.category ?? p.Category ?? p.type ?? p.Type ?? "")).toLowerCase();
    const logoSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const logoUrl = withBasePath(`/icons/${logoSlug}.png`);

    const html = `
      <div style="font: 600 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto;">
        <div style="display:flex;align-items:center;gap:8px;">
          <img src="${logoUrl}" onerror="this.style.display='none'" width="28" height="28" style="object-fit:contain;border-radius:4px;" />
          <div>
            <div>${name}</div>
            <div style="opacity:.75;font-weight:500;text-transform:capitalize">${cat || ""}</div>
          </div>
        </div>
      </div>
    `;

    let popup = (m as any).__certisPopup as mapboxgl.Popup | undefined;
    if (!popup) {
      popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
      (m as any).__certisPopup = popup;
    }
    popup.setLngLat([lng, lat]).setHTML(html).addTo(m);
  };
  const hoverLeave = () => {
    m.getCanvas().style.cursor = "";
    const popup: mapboxgl.Popup | undefined = (m as any).__certisPopup;
    popup?.remove();
  };

  m.on("mousemove", MAIN_POINTS, hoverMove as any);
  m.on("mousemove", KING_LAYER, hoverMove as any);
  m.on("mouseleave", MAIN_POINTS, hoverLeave as any);
  m.on("mouseleave", KING_LAYER, hoverLeave as any);

  // Clicks
  const pointClick = (e: mapboxgl.MapLayerMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
    const feat = e.features?.[0] as Feature<Point, GeoJsonProperties> | undefined;
    if (!feat) return;
    const props = feat.properties || {};
    const [lng, lat] = (feat.geometry?.coordinates || []) as [number, number];

    const cb: undefined | ((p: any, ll: mapboxgl.LngLat) => void) = (m as any).__onPointClick;
    if (cb) cb(props, new mapboxgl.LngLat(lng, lat));
  };
  m.on("click", MAIN_POINTS, pointClick as any);
  m.on("click", KING_LAYER, pointClick as any);

  // Cluster expansion
  const clusterClick = (e: mapboxgl.MapLayerMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
    const feat = e.features?.[0];
    if (!feat) return;
    const src = m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
    const clusterId = (feat.properties as any)?.cluster_id;
    if (!src || clusterId == null) return;

    // @ts-ignore present at runtime
    src.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
      if (err) return;
      const c = (feat.geometry as any)?.coordinates as [number, number];
      if (Array.isArray(c)) m.easeTo({ center: c as any, zoom });
    });
  };
  m.on("click", MAIN_CLUSTERS, clusterClick as any);
}

function setData(
  m: mapboxgl.Map,
  main: FeatureCollection<Point, any>,
  kingpins: FeatureCollection<Point, any>,
  home: Position | null | undefined,
  onPointClick?: (props: any, ll: mapboxgl.LngLat) => void,
  onAddStop?: (s: { name?: string; coord: [number, number]; [k: string]: any }) => void
) {
  (m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined)?.setData(main ?? emptyFC());
  (m.getSource(KING_SRC) as mapboxgl.GeoJSONSource | undefined)?.setData(kingpins ?? emptyFC());

  const h = toTuple2(home);
  (m.getSource(HOME_SRC) as mapboxgl.GeoJSONSource | undefined)?.setData(
    h
      ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: h } }] }
      : emptyFC()
  );

  // Bridge new/legacy click callbacks
  (m as any).__onPointClick = (props: any, ll: mapboxgl.LngLat) => {
    if (typeof onPointClick === "function") {
      onPointClick(props, ll);
      return;
    }
    if (typeof onAddStop === "function") {
      const name = props?.name ?? props?.Name ?? "Location";
      onAddStop({ name, coord: [ll.lng, ll.lat], ...props });
    }
  };
}

export default CertisMap;
