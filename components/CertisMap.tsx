// components/CertisMap.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { MapMouseEvent, LngLat } from "mapbox-gl";
import type { FeatureCollection, Position } from "geojson";
import { withBasePath } from "@/utils/paths";

/** -------------------------
 * Category colors + helper
 * ------------------------- */
export const CATEGORY_COLOR: Record<string, string> = {
  Kingpin: "#F59E0B",           // amber
  Agronomy: "#10B981",          // emerald/teal
  Grain: "#F97316",             // orange
  "Office/Service": "#60A5FA",  // blue
  "Agronomy/Grain": "#84CC16",  // lime
  Distribution: "#A78BFA",      // violet
};
export function categoryColor(c?: string) {
  return (c && CATEGORY_COLOR[c]) || "#38BDF8"; // fallback cyan-ish
}

/** -------------------------
 * Props (back-compat: main | data)
 * ------------------------- */
type MapStyleName = "hybrid" | "street";

type CommonProps = {
  kingpins: FeatureCollection;
  home?: Position | null;
  onPointClick: (properties: any, coord: LngLat) => void; // legacy 2-arg signature
  mapStyle: MapStyleName;
};

type CertisMapProps =
  | (CommonProps & { main: FeatureCollection })
  | (CommonProps & { data: FeatureCollection }); // back-compat

/** -------------------------
 * Constants
 * ------------------------- */
const MAIN_SRC = "main";
const KING_SRC = "kingpins";
const HOME_SRC = "home";
const CLUSTER_LAYER = "main-clusters";
const CLUSTER_COUNT = "main-cluster-count";
const MAIN_POINTS = "main-points";
const KING_LAYER = "kingpins-points";

/** Use Mapbox styles; change names here if you switch providers. */
function styleUrlFor(s: MapStyleName) {
  // These are the standard Mapbox v11 URLs:
  // hybrid = satellite-streets, street = streets
  return s === "street"
    ? "mapbox://styles/mapbox/streets-v12"
    : "mapbox://styles/mapbox/satellite-streets-v12";
}

/** Certis logo path (top-left, *inside* the map) */
const CERTIS_LOGO = "/certis-logo.png";

/** Get a logo from /public/icons/<Retailer>.png (spaces -> underscores safe try) */
function retailerLogoPath(name?: string) {
  if (!name) return null;
  const safe = name.replace(/[^\w.-]+/g, "_");
  return `/icons/${safe}.png`;
}

/** Make a tiny HTML color dot */
function dot(color: string) {
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};vertical-align:middle;margin-right:6px;"></span>`;
}

/** Build popup HTML (kept minimal; adjust as desired) */
function popupHtml(p: any) {
  const name = p?.name ?? p?.retailer ?? "Location";
  const addr = p?.address ?? p?.addr ?? "";
  const city = p?.city ?? "";
  const state = p?.state ?? "";
  const category = p?.category ?? p?.type ?? "";
  const suppliers = p?.suppliers ?? p?.supplier ?? "";
  const color = categoryColor(category);
  const logo = retailerLogoPath(p?.retailer);
  const logoImg = logo
    ? `<img src="${logo}" alt="" style="height:24px;max-width:120px;object-fit:contain;display:block;margin-bottom:6px" onerror="this.style.display='none'"/>`
    : "";

  return `
    <div style="font: 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:#eaeef2; line-height:1.25">
      ${logoImg}
      <div style="font-weight:600;margin-bottom:4px">${name}</div>
      <div style="opacity:.9">${addr}${addr && (city || state) ? "<br/>" : ""}${city}${city && state ? ", " : ""}${state}</div>
      <div style="margin-top:6px">${dot(color)}<span style="opacity:.9">${category || "Location"}</span></div>
      ${suppliers ? `<div style="margin-top:6px;opacity:.9"><b>Suppliers:</b> ${suppliers}</div>` : ""}
    </div>
  `;
}

/** -------------------------
 * Map component
 * ------------------------- */
const CertisMap: React.FC<CertisMapProps> = (props) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const mainFC: FeatureCollection = useMemo(
    () => ("main" in props ? props.main : (props as any).data),
    [props]
  );
  const kingpinFC: FeatureCollection = props.kingpins;
  const home = props.home ?? null;

  /** Build/ensure sources + layers (idempotent) */
  const wireSourcesAndLayers = (m: mapboxgl.Map) => {
    const addOrUpdateSource = (id: string, fc: FeatureCollection, cluster: boolean) => {
      const src = m.getSource(id) as mapboxgl.GeoJSONSource | undefined;
      if (!src) {
        m.addSource(id, {
          type: "geojson",
          data: fc as any,
          cluster,
          clusterRadius: cluster ? 60 : undefined,
          clusterMaxZoom: cluster ? 12 : undefined,
        } as mapboxgl.GeoJSONSourceSpecification);
      } else {
        src.setData(fc as any);
      }
    };

    // main + clusters
    addOrUpdateSource(MAIN_SRC, mainFC, true);

    if (!m.getLayer(CLUSTER_LAYER)) {
      m.addLayer({
        id: CLUSTER_LAYER,
        type: "circle",
        source: MAIN_SRC,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#22D3EE",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            16,
            20,
            20,
            50,
            26,
          ],
          "circle-opacity": 0.8,
          "circle-stroke-color": "#0E7490",
          "circle-stroke-width": 1.5,
        },
      } as mapboxgl.CircleLayer);
    }
    if (!m.getLayer(CLUSTER_COUNT)) {
      m.addLayer({
        id: CLUSTER_COUNT,
        type: "symbol",
        source: MAIN_SRC,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: { "text-color": "#00131a" },
      } as mapboxgl.SymbolLayer);
    }
    if (!m.getLayer(MAIN_POINTS)) {
      m.addLayer({
        id: MAIN_POINTS,
        type: "circle",
        source: MAIN_SRC,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "type"], "Kingpin"],
            "#EF4444", // red (won't show here—kingpins come from separate src)
            [
              "match",
              ["get", "category"],
              "Agronomy",
              CATEGORY_COLOR["Agronomy"],
              "Grain",
              CATEGORY_COLOR["Grain"],
              "Office/Service",
              CATEGORY_COLOR["Office/Service"],
              "Agronomy/Grain",
              CATEGORY_COLOR["Agronomy/Grain"],
              "Distribution",
              CATEGORY_COLOR["Distribution"],
              "#38BDF8",
            ],
          ],
          "circle-radius": 6,
          "circle-stroke-color": "#0B2530",
          "circle-stroke-width": 1.5,
        },
      } as mapboxgl.CircleLayer);
    }

    // kingpins (separate source, ABOVE clusters & main points)
    addOrUpdateSource(KING_SRC, kingpinFC, false);
    if (!m.getLayer(KING_LAYER)) {
      m.addLayer({
        id: KING_LAYER,
        type: "circle",
        source: KING_SRC,
        paint: {
          "circle-color": "#EF4444", // inner red
          "circle-radius": 7,
          "circle-stroke-color": "#F59E0B", // yellow ring
          "circle-stroke-width": 3,
        },
      } as mapboxgl.CircleLayer);
      m.moveLayer(KING_LAYER); // ensures it's on top
    }

    // home marker (tiny blue dot)
    const homeSrc = m.getSource(HOME_SRC) as mapboxgl.GeoJSONSource | undefined;
    const homeFC: FeatureCollection =
      home && Array.isArray(home) && home.length >= 2
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: [home[0], home[1]] },
              },
            ],
          }
        : { type: "FeatureCollection", features: [] };
    if (!homeSrc) {
      m.addSource(HOME_SRC, { type: "geojson", data: homeFC } as mapboxgl.GeoJSONSourceSpecification);
      m.addLayer({
        id: HOME_SRC,
        type: "circle",
        source: HOME_SRC,
        paint: {
          "circle-color": "#60A5FA",
          "circle-radius": 5,
          "circle-stroke-color": "#0B2530",
          "circle-stroke-width": 1.5,
        },
      } as mapboxgl.CircleLayer);
    } else {
      homeSrc.setData(homeFC as any);
    }
  };

  /** Build map once */
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const m = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUrlFor(props.mapStyle),
      cooperativeGestures: true,
      projection: "mercator" as any,
      center: [-93.5, 41.8],
      zoom: 4,
      attributionControl: true,
    });
    mapRef.current = m;

    // Enforce Mercator on every style load
    const onStyleLoad = () => {
      try {
        m.setProjection({ name: "mercator" as any });
      } catch {}
      wireSourcesAndLayers(m);

      // Add in-map Certis logo
      const id = "certis-logo-control";
      if (!document.getElementById(id)) {
        const el = document.createElement("div");
        el.id = id;
        el.style.position = "absolute";
        el.style.top = "6px";
        el.style.left = "8px";
        el.style.zIndex = "3";
        el.style.pointerEvents = "none";
        el.innerHTML = `<img src="${withBasePath(CERTIS_LOGO)}" style="height:26px;opacity:.9;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))" alt="CERTIS"/>`;
        m.getContainer().appendChild(el);
      }
    };
    m.on("style.load", onStyleLoad);

    // Hover popup over kingpins or points
    const showPopup = (e: MapMouseEvent) => {
      const feats = m.queryRenderedFeatures(e.point, { layers: [KING_LAYER, MAIN_POINTS] });
      const feat = feats[0];
      if (!feat) {
        popupRef.current?.remove();
        m.getCanvas().style.cursor = "";
        return;
      }
      const p = feat.properties || {};
      m.getCanvas().style.cursor = "pointer";
      const html = popupHtml(p);
      if (!popupRef.current) {
        popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnMove: true, offset: 8 });
      }
      popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(m);
    };
    const clickPoint = (e: MapMouseEvent) => {
      const feats = m.queryRenderedFeatures(e.point, { layers: [KING_LAYER, MAIN_POINTS] });
      const f = feats[0];
      if (!f) return;
      props.onPointClick(f.properties, e.lngLat);
    };
    const clickCluster = (e: MapMouseEvent) => {
      const feats = m.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] });
      const f = feats[0];
      if (!f) return;
      const clusterId = (f.properties as any)?.cluster_id;
      const src = m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
      if (!src || clusterId == null) return;
      // @ts-expect-error v3: getClusterExpansionZoom exists on GeoJSONSource
      src.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
        if (err) return;
        m.easeTo({ center: (f.geometry as any).coordinates as [number, number], zoom });
      });
    };

    m.on("mousemove", showPopup);
    m.on("click", clickPoint);
    m.on("click", clickCluster);

    const onResize = () => m.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      popupRef.current?.remove();
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** React to data changes */
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const apply = () => wireSourcesAndLayers(m);
    if ((m as any).isStyleLoaded?.()) apply();
    else m.once("style.load", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainFC, kingpinFC, home]);

  /** React to style toggle */
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const next = styleUrlFor(props.mapStyle);
    m.setStyle(next); // re-add wiring on style.load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mapStyle]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "70vh",
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,.08)",
      }}
    />
  );
};

export default CertisMap;
