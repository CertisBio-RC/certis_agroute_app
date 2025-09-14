"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { GeoJSONSource, LngLat, Map as MbMap } from "mapbox-gl";

type Position = [number, number];

export type CertisMapProps = {
  /** Filtered, non-kingpin features */
  data: GeoJSON.FeatureCollection<GeoJSON.Geometry, any>;
  /** Kingpin features only (unfiltered) */
  kingpins: GeoJSON.FeatureCollection<GeoJSON.Geometry, any>;
  /** Optional home point [lng, lat] */
  home?: Position | null;
  /** Hover/see popup on move; click adds a stop */
  onPointClick: (props: any, coord: LngLat) => void;
  /** "hybrid" | "street" */
  mapStyle: "hybrid" | "street";
};

const STYLE_HYBRID =
  "mapbox://styles/mapbox/satellite-streets-v12"; // default
const STYLE_STREET = "mapbox://styles/mapbox/streets-v12";

const styleUrlFor = (style: "hybrid" | "street") =>
  style === "street" ? STYLE_STREET : STYLE_HYBRID;

const ROOT_ID = "certis-map-root";
const MAIN_SRC = "main-src";
const CLUSTER_SRC = "main-clusters";
const MAIN_POINTS = "main-points";
const MAIN_CLUSTER_CIRCLES = "main-cluster-circles";
const MAIN_CLUSTER_COUNT = "main-cluster-count";
const KING_SRC = "king-src";
const KING_LAYER = "king-layer";
const HOME_SRC = "home-src";
const HOME_LAYER = "home-layer";

// ---- Category colors (keep in sync with page.tsx legend colors)
export const CATEGORY_COLOR = (raw: string | undefined): string => {
  const key = (raw || "").toLowerCase();
  if (key.includes("kingpin")) return "#EF4444"; // handled separately
  if (key.includes("agronomy/grain")) return "#60A5FA"; // blue
  if (key.includes("agronomy")) return "#2DD4BF"; // teal
  if (key.includes("office") || key.includes("service")) return "#A78BFA"; // purple
  if (key.includes("grain")) return "#F59E0B"; // amber
  if (key.includes("distribution")) return "#F472B6"; // pink
  return "#22C55E"; // default green
};

const CATEGORY_MATCH_EXPR: mapboxgl.Expression =
  [
    "match",
    ["downcase", ["coalesce", ["get", "category"], ""]],
    "agronomy/grain", "#60A5FA",
    "agronomy", "#2DD4BF",
    "office/service", "#A78BFA",
    "grain", "#F59E0B",
    "distribution", "#F472B6",
    /* other */ "#22C55E",
  ] as any;

function toFC(
  fc: GeoJSON.FeatureCollection<GeoJSON.Geometry, any>
): GeoJSON.FeatureCollection<GeoJSON.Geometry, any> {
  // defensive literal cast for TS
  return JSON.parse(JSON.stringify(fc));
}

function asPosition(p?: Position | null): Position | null {
  if (!p) return null;
  const [lng, lat] = p;
  return [lng, lat];
}

const useOnce = (fn: () => void) => {
  const did = useRef(false);
  useEffect(() => {
    if (!did.current) {
      did.current = true;
      fn();
    }
  }, [fn]);
};

export default function CertisMap({
  data,
  kingpins,
  home,
  onPointClick,
  mapStyle,
}: CertisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MbMap | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const styleUrl = useMemo(() => styleUrlFor(mapStyle), [mapStyle]);

  // --- init map once
  useOnce(() => {
    // Mapbox token expected in window.__MAPBOX_TOKEN__ or from public/mapbox-token
    // (you already have this wired in your project)
    const token = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
      (globalThis as any).__MAPBOX_TOKEN__) as string | undefined;
    if (token) mapboxgl.accessToken = token;

    const m = new mapboxgl.Map({
      container: containerRef.current!,
      style: styleUrlFor("hybrid"),
      center: [-94.0, 41.5],
      zoom: 4.1,
      attributionControl: true,
      cooperativeGestures: false,
      dragRotate: false,
      touchPitch: false,
    });
    mapRef.current = m;

    // lock Mercator, always
    m.once("load", () => {
      try {
        (m as any).setProjection({ name: "mercator" });
      } catch {}
      wireLayersAndEvents();
      refreshData();
    });

    // resize guards
    const onResize = () => m.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      m.remove();
    };
  });

  // --- reapply style switch while keeping all layers/sources
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if ((m.getStyle().sprite || "").includes(styleUrl)) return;
    m.setStyle(styleUrl); // options caused TS friction; default is fine

    m.once("style.load", () => {
      try {
        (m as any).setProjection({ name: "mercator" });
      } catch {}
      wireLayersAndEvents();
      refreshData();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  // --- when props data/home change, refresh sources
  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, kingpins, home]);

  // ---------- helpers

  function ensureSource(id: string, def: mapboxgl.AnySourceData) {
    const m = mapRef.current!;
    if (!m.getSource(id)) m.addSource(id, def);
  }

  function ensureLayer(def: mapboxgl.AnyLayer) {
    const m = mapRef.current!;
    if (!m.getLayer(def.id)) m.addLayer(def);
  }

  function wireLayersAndEvents() {
    const m = mapRef.current!;
    // SOURCES
    ensureSource(MAIN_SRC, {
      type: "geojson",
      data: toFC({ type: "FeatureCollection", features: [] }),
      cluster: true,
      clusterMaxZoom: 12,
      clusterRadius: 60,
    });
    ensureSource(KING_SRC, {
      type: "geojson",
      data: toFC({ type: "FeatureCollection", features: [] }),
    });
    ensureSource(HOME_SRC, {
      type: "geojson",
      data: toFC({ type: "FeatureCollection", features: [] }),
    });

    // LAYERS: clusters and unclustered points
    ensureLayer({
      id: MAIN_CLUSTER_CIRCLES,
      type: "circle",
      source: MAIN_SRC,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#22C55E",
        "circle-stroke-color": "#083344",
        "circle-stroke-width": 2,
        "circle-radius": [
          "step",
          ["get", "point_count"],
          16,
          25,
          22,
          50,
          28,
          100,
          34,
        ],
      },
    });

    ensureLayer({
      id: MAIN_CLUSTER_COUNT,
      type: "symbol",
      source: MAIN_SRC,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 12,
      },
      paint: {
        "text-color": "#083344",
      },
    });

    ensureLayer({
      id: MAIN_POINTS,
      type: "circle",
      source: MAIN_SRC,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": CATEGORY_MATCH_EXPR,
        "circle-radius": 7,
        "circle-stroke-color": "#0B1220",
        "circle-stroke-width": 2,
      },
    });

    // KINGPINS sit above clusters & points
    ensureLayer({
      id: KING_LAYER,
      type: "circle",
      source: KING_SRC,
      paint: {
        "circle-color": "#EF4444", // red
        "circle-radius": 8,
        "circle-stroke-color": "#FDE047", // yellow ring
        "circle-stroke-width": 3,
      },
    });

    // HOME (small white dot with blue ring)
    ensureLayer({
      id: HOME_LAYER,
      type: "circle",
      source: HOME_SRC,
      paint: {
        "circle-color": "#FFFFFF",
        "circle-radius": 5,
        "circle-stroke-color": "#3B82F6",
        "circle-stroke-width": 3,
      },
    });

    // ---------------- interactions

    // cursor change
    const hoverables = [MAIN_POINTS, KING_LAYER];
    hoverables.forEach((lid) => {
      m.on("mouseenter", lid, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", lid, () => (m.getCanvas().style.cursor = ""));
    });

    // hover popup
    popupRef.current?.remove();
    popupRef.current = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: [0, -12],
    });

    const showPopup = (e: mapboxgl.MapMouseEvent & mapboxgl.EventData) => {
      const feats = m.queryRenderedFeatures(e.point, {
        layers: [KING_LAYER, MAIN_POINTS],
      });
      if (!feats.length) {
        popupRef.current?.remove();
        return;
      }
      const f = feats[0];
      const p = f.properties || {};
      const coord = (f.geometry as any).coordinates as Position;
      const lngLat = new LngLat(coord[0], coord[1]);

      const name = p.name || p.Name || p.retailer || "Location";
      const addr =
        p.address ||
        p.Address ||
        [p.city, p.state, p.zip].filter(Boolean).join(", ") ||
        "";
      const category = p.category || p.Category || "";
      const retailer = p.retailer || p.Retailer || "";
      const slug =
        (retailer as string)
          .toLowerCase()
          .replace(/&/g, "and")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "";
      const logoUrl = slug ? `/icons/${slug}.png` : "";

      const html = `
        <div style="min-width:220px;display:flex;gap:.5rem;align-items:flex-start">
          ${
            logoUrl
              ? `<img src="${logoUrl}" alt="${retailer}" style="width:34px;height:34px;object-fit:contain;flex:0 0 auto;border-radius:.25rem;background:#fff;padding:2px;border:1px solid #11182720;" />`
              : ""
          }
          <div style="line-height:1.2">
            <div style="font-weight:600;margin-bottom:2px">${name}</div>
            <div style="font-size:.82rem;opacity:.8">${addr}</div>
            <div style="font-size:.8rem;margin-top:.4rem">
              <span style="display:inline-block;width:.6rem;height:.6rem;border-radius:50%;background:${CATEGORY_COLOR(
                category
              )};margin-right:.4rem;vertical-align:middle"></span>
              ${category || "Location"}
            </div>
          </div>
        </div>
      `;
      popupRef.current!.setLngLat(lngLat).setHTML(html).addTo(m);
    };

    m.on("mousemove", showPopup);
    m.on("mouseleave", MAIN_POINTS, () => popupRef.current?.remove());
    m.on("mouseleave", KING_LAYER, () => popupRef.current?.remove());

    // click to add a stop
    const onClick = (
      e: mapboxgl.MapMouseEvent & mapboxgl.EventData,
      lid: string
    ) => {
      const feats = m.queryRenderedFeatures(e.point, { layers: [lid] });
      if (!feats.length) return;
      const f = feats[0];
      const coord = (f.geometry as any).coordinates as Position;
      onPointClick(f.properties || {}, new LngLat(coord[0], coord[1]));
    };
    m.on("click", MAIN_POINTS, (e) => onClick(e, MAIN_POINTS));
    m.on("click", KING_LAYER, (e) => onClick(e, KING_LAYER));

    // click to expand cluster
    m.on("click", MAIN_CLUSTER_CIRCLES, (e) => {
      const features = m.queryRenderedFeatures(e.point, {
        layers: [MAIN_CLUSTER_CIRCLES],
      });
      const clusterId = features[0]?.properties?.cluster_id;
      const src = m.getSource(MAIN_SRC) as GeoJSONSource | undefined;
      if (!src || clusterId == null) return;
      src.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        const coords = (features[0].geometry as any).coordinates as Position;
        m.easeTo({ center: coords, zoom });
      });
    });
  }

  function refreshData() {
    const m = mapRef.current;
    if (!m) return;

    // main points
    const main = m.getSource(MAIN_SRC) as GeoJSONSource | undefined;
    if (main) {
      main.setData(toFC(data));
    }

    // kingpins (always visible)
    const ksrc = m.getSource(KING_SRC) as GeoJSONSource | undefined;
    if (ksrc) {
      ksrc.setData(toFC(kingpins));
    }

    // home
    const hsrc = m.getSource(HOME_SRC) as GeoJSONSource | undefined;
    if (hsrc) {
      const pos = asPosition(home);
      hsrc.setData(
        toFC({
          type: "FeatureCollection",
          features: pos
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: pos },
                },
              ]
            : [],
        })
      );
    }
  }

  return (
    <div
      id={ROOT_ID}
      ref={containerRef}
      style={{
        width: "100%",
        height: "72vh",
        borderRadius: "12px",
        overflow: "hidden",
        boxShadow: "0 0 0 1px #00000040, 0 10px 30px #00000030",
      }}
    />
  );
}
