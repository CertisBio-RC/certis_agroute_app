"use client";

import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type {
  Map as MapboxMap,
  GeoJSONSource,
  LngLat,
  MapMouseEvent,
} from "mapbox-gl";
import type {
  FeatureCollection,
  Feature,
  Geometry,
  GeoJsonProperties,
  Position,
} from "geojson";

// ---------- Props ----------
export type MapStyleKey = "hybrid" | "street";

export interface CertisMapProps {
  /** Main (non-kingpin) points; can be clustered */
  mainFc: FeatureCollection;
  /** Kingpins drawn above everything */
  kingpinFc: FeatureCollection;
  /** Home marker (lng,lat) or null */
  home: Position | null;
  /** Street vs Hybrid */
  mapStyle: MapStyleKey;
  /** Click handler used by Trip Builder (legacy signature: (props, LngLat)) */
  onPointClick: (p: GeoJsonProperties, coord: LngLat) => void;
}

// ---------- Style helpers ----------
const styleUrlFor = (key: MapStyleKey) =>
  key === "hybrid"
    ? "mapbox://styles/mapbox/satellite-streets-v12"
    : "mapbox://styles/mapbox/streets-v12";

// ---------- IDs we use repeatedly ----------
const MAIN_SRC = "main-src";
const KING_SRC = "kingpin-src";
const HOME_SRC = "home-src";

const CLUSTERS = "clusters";
const CLUSTER_COUNT = "cluster-count";
const UNCLUSTERED = "unclustered";
const KING_LAYER = "kingpins";
const HOME_LAYER = "home-layer";

// ---------- small utils ----------
const ensureStyle = (m: MapboxMap) =>
  m.isStyleLoaded()
    ? Promise.resolve()
    : new Promise<void>((resolve) => m.once("style.load", () => resolve()));

const toFC = (f: FeatureCollection | null | undefined): FeatureCollection => {
  if (!f) return { type: "FeatureCollection", features: [] };
  return f;
};

const toTuple2 = (pos: Position | null | undefined): [number, number] | null => {
  if (!pos || pos.length < 2) return null;
  return [pos[0], pos[1]];
};

// ---------- Category colors (exported for sidebar legend) ----------
export const CATEGORY_COLOR: Record<string, string> = {
  "Agronomy": "#22d3ee",
  "Office/Service": "#a78bfa",
  "Agronomy/Grain": "#34d399",
  "Grain/Feed": "#f59e0b",
  "Distribution": "#fb7185",
  "": "#38bdf8", // default/fallback
};

// Expression used by the map layer (built from CATEGORY_COLOR)
const categoryColorExpr: any = [
  "match",
  ["coalesce", ["get", "Category"], ""],
  "Agronomy",
  CATEGORY_COLOR["Agronomy"],
  "Office/Service",
  CATEGORY_COLOR["Office/Service"],
  "Agronomy/Grain",
  CATEGORY_COLOR["Agronomy/Grain"],
  "Grain/Feed",
  CATEGORY_COLOR["Grain/Feed"],
  "Distribution",
  CATEGORY_COLOR["Distribution"],
  /* default */ CATEGORY_COLOR[""],
];

// ---------- Component ----------
export default function CertisMap({
  mainFc,
  kingpinFc,
  home,
  mapStyle,
  onPointClick,
}: CertisMapProps) {
  const mapRef = useRef<MapboxMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // Create map once
  useEffect(() => {
    if (!containerRef.current) return;

    // Access token (env first)
    if (!mapboxgl.accessToken) {
      const tokenFromEnv = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
      mapboxgl.accessToken = tokenFromEnv;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUrlFor(mapStyle),
      projection: { name: "mercator" as any },
      center: [-94.0, 41.5],
      zoom: 4.25,
      cooperativeGestures: false,
      attributionControl: true,
    });

    mapRef.current = map;

    // First style load
    map.on("style.load", () => {
      try {
        map.setProjection({ name: "mercator" as any });
      } catch {}
      wireAll(map, toFC(mainFc), toFC(kingpinFc), toTuple2(home));
    });

    return () => {
      try {
        popupRef.current?.remove();
      } catch {}
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // create once

  // Respond to style switch (Street/Hybrid)
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const next = styleUrlFor(mapStyle);
    m.setStyle(next);
    m.once("style.load", () => {
      try {
        m.setProjection({ name: "mercator" as any });
      } catch {}
      wireAll(m, toFC(mainFc), toFC(kingpinFc), toTuple2(home));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle]);

  // Live updates: data changes
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    (async () => {
      await ensureStyle(m);
      // main
      const srcMain = m.getSource(MAIN_SRC) as GeoJSONSource | undefined;
      if (srcMain) srcMain.setData(toFC(mainFc) as any);
      // kingpins
      const srcKing = m.getSource(KING_SRC) as GeoJSONSource | undefined;
      if (srcKing) srcKing.setData(toFC(kingpinFc) as any);
      // home
      const homeTuple = toTuple2(home);
      const srcHome = m.getSource(HOME_SRC) as GeoJSONSource | undefined;
      if (srcHome) {
        srcHome.setData({
          type: "FeatureCollection",
          features: homeTuple
            ? [
                {
                  type: "Feature",
                  geometry: { type: "Point", coordinates: homeTuple },
                  properties: {},
                },
              ]
            : [],
        } as any);
      }
    })();
  }, [mainFc, kingpinFc, home]);

  // Render
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* CERTIS watermark in-map */}
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 10,
          zIndex: 2,
          padding: "2px 6px",
          borderRadius: 6,
          background: "rgba(0,0,0,0.30)",
          backdropFilter: "blur(2px)",
        }}
      >
        <img
          src="/certis-logo.png"
          alt="CERTIS"
          style={{ height: 22, display: "block", opacity: 0.95 }}
        />
      </div>

      {/* Map container */}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 12,
          overflow: "hidden",
        }}
      />
    </div>
  );

  // ---------- wiring (sources, layers, handlers) ----------
  function wireAll(
    map: MapboxMap,
    main: FeatureCollection,
    kingpins: FeatureCollection,
    homeTuple: [number, number] | null
  ) {
    // Remove leftovers from previous style
    safeRemoveLayer(map, CLUSTER_COUNT);
    safeRemoveLayer(map, CLUSTERS);
    safeRemoveLayer(map, UNCLUSTERED);
    safeRemoveLayer(map, KING_LAYER);
    safeRemoveLayer(map, HOME_LAYER);

    safeRemoveSource(map, MAIN_SRC);
    safeRemoveSource(map, KING_SRC);
    safeRemoveSource(map, HOME_SRC);

    // Add clustered main source
    map.addSource(MAIN_SRC, {
      type: "geojson",
      data: main,
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: 14,
    });

    // Kingpin & home sources
    map.addSource(KING_SRC, { type: "geojson", data: kingpins });
    map.addSource(HOME_SRC, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: homeTuple
          ? [
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: homeTuple },
                properties: {},
              } as Feature,
            ]
          : [],
      },
    });

    // Cluster bubbles
    map.addLayer({
      id: CLUSTERS,
      type: "circle",
      source: MAIN_SRC,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#7dd3fc",
          20,
          "#38bdf8",
          50,
          "#0ea5e9",
        ],
        "circle-radius": ["step", ["get", "point_count"], 16, 20, 22, 50, 28],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#0b1220",
      },
    });

    // Cluster counts
    map.addLayer({
      id: CLUSTER_COUNT,
      type: "symbol",
      source: MAIN_SRC,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 12,
        "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "#00131A",
      },
    });

    // Unclustered main points (category-colored)
    map.addLayer({
      id: UNCLUSTERED,
      type: "circle",
      source: MAIN_SRC,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": categoryColorExpr,
        "circle-radius": 7,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#00131A",
      },
    });

    // Kingpins (red w/ yellow ring)
    map.addLayer({
      id: KING_LAYER,
      type: "circle",
      source: KING_SRC,
      paint: {
        "circle-color": "#ef4444",
        "circle-radius": 8,
        "circle-stroke-width": 3,
        "circle-stroke-color": "#fbbf24",
      },
    });

    // Home marker
    map.addLayer({
      id: HOME_LAYER,
      type: "circle",
      source: HOME_SRC,
      paint: {
        "circle-color": "#22c55e",
        "circle-radius": 7,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#00131A",
      },
    });

    // Interactions ------------------------------------------------------------
    if (!popupRef.current) {
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
      });
    }

    const showPopup = (e: MapMouseEvent) => {
      const feats = map.queryRenderedFeatures(e.point, {
        layers: [KING_LAYER, UNCLUSTERED],
      });
      const feat = feats[0] as Feature | undefined;
      if (!feat) {
        popupRef.current?.remove();
        map.getCanvas().style.cursor = "";
        return;
      }
      map.getCanvas().style.cursor = "pointer";

      const p = (feat.properties || {}) as Record<string, any>;
      const coord = (feat.geometry as any)?.coordinates as [number, number];

      // Retailer logo slug (optional)
      const rawName: string = p?.Retailer || p?.retailer || p?.name || "";
      const slug = rawName
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const iconUrl = slug ? `/icons/${slug}.png` : null;

      const lines: string[] = [];
      if (rawName)
        lines.push(`<div style="font-weight:700">${escapeHtml(rawName)}</div>`);
      if (p.Address || p.address)
        lines.push(`<div>${escapeHtml(p.Address || p.address)}</div>`);
      if (p.City || p.city) {
        const city = p.City || p.city;
        const st = p.State || p.state || "";
        const zip = p.Zip || p.zip || "";
        lines.push(
          `<div>${escapeHtml(city)}${
            st ? ", " + escapeHtml(st) : ""
          } ${escapeHtml(zip)}</div>`
        );
      }
      if (p.Category) lines.push(`<div style="opacity:.8">${escapeHtml(p.Category)}</div>`);
      if (p.Suppliers) lines.push(`<div style="opacity:.8">${escapeHtml(p.Suppliers)}</div>`);

      const logoHtml = iconUrl
        ? `<img src="${iconUrl}" alt="" style="height:20px;vertical-align:middle;margin-right:6px" onerror="this.style.display='none'"/>`
        : "";

      popupRef.current!
        .setLngLat(coord as any)
        .setHTML(
          `<div style="display:flex;align-items:center;gap:6px">${logoHtml}<div>${lines.join(
            ""
          )}</div></div>`
        )
        .addTo(map);
    };

    const hidePopup = () => {
      popupRef.current?.remove();
      map.getCanvas().style.cursor = "";
    };

    // Expand cluster on click
    map.on("click", CLUSTERS, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const clusterId = (f.properties as any)?.cluster_id;
      const source = map.getSource(MAIN_SRC) as GeoJSONSource;
      if (!source || clusterId == null) return;
      (source as any).getClusterExpansionZoom(
        clusterId,
        (err: any, zoom: number) => {
          if (err) return;
          const center = (f.geometry as any)?.coordinates as [number, number];
          map.easeTo({ center, zoom });
        }
      );
    });

    // Hover handlers (both unclustered + kingpins)
    map.on("mousemove", UNCLUSTERED, showPopup);
    map.on("mouseleave", UNCLUSTERED, hidePopup);
    map.on("mousemove", KING_LAYER, showPopup);
    map.on("mouseleave", KING_LAYER, hidePopup);

    // Click handler (legacy signature)
    const clickHandler = (e: MapMouseEvent) => {
      const feat = e.features?.[0] as Feature | undefined;
      if (!feat) return;
      const props = (feat.properties || {}) as GeoJsonProperties;
      onPointClick(props, e.lngLat);
    };
    map.on("click", UNCLUSTERED, clickHandler);
    map.on("click", KING_LAYER, clickHandler);
  }
}

// ---------- helpers ----------
function safeRemoveLayer(map: MapboxMap, id: string) {
  try {
    if (map.getLayer(id)) map.removeLayer(id);
  } catch {}
}
function safeRemoveSource(map: MapboxMap, id: string) {
  try {
    if (map.getSource(id)) map.removeSource(id);
  } catch {}
}
function escapeHtml(s: any): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
