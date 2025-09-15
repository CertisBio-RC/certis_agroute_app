// components/CertisMap.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { GeoJSONSource, LngLat } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { withBasePath } from "@/utils/paths";

type Position = [number, number];

type FC = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  GeoJSON.GeoJsonProperties
>;

export type MapStyle = "hybrid" | "street";

export interface CertisMapProps {
  /** Main (non-kingpin) locations */
  main: FC;
  /** Kingpins as a separate FeatureCollection */
  kingpins: FC;
  /** Optional “home” point */
  home?: Position | null;
  /** Hover shows popup; click calls this to add stop (legacy signature) */
  onPointClick?: (properties: any, ll: LngLat) => void;
  /** "hybrid" (default) or "street" */
  mapStyle?: MapStyle;
}

/** Color palette used both on the map and in the sidebar dots */
export const CATEGORY_COLOR: Record<string, string> = {
  Kingpin: "#f43f5e",            // red-500
  Agronomy: "#22c55e",           // green-500
  "Office/Service": "#60a5fa",   // blue-400
  Grain: "#f59e0b",              // amber-500
  "Agronomy/Grain": "#a855f7",   // purple-500
  Distribution: "#14b8a6",       // teal-500
  "Grain/Feed": "#eab308",       // yellow-500
  // default fallback:
  _default: "#2dd4bf",           // cyan/teal-ish (for unknown)
};

const STYLE_HYBRID = "mapbox://styles/mapbox/satellite-streets-v12";
const STYLE_STREET = "mapbox://styles/mapbox/streets-v12";

const MAP_ID = "certis-map";
const MAIN_SRC = "main";
const MAIN_POINTS = "main-points";
const MAIN_CLUSTERS = "main-clusters";
const MAIN_COUNT = "main-count";

const KING_SRC = "kingpins";
const KING_LAYER = "kingpins-layer";

const HOME_SRC = "home";
const HOME_LAYER = "home-layer";

function styleUrlFor(s: MapStyle | undefined) {
  return s === "street" ? STYLE_STREET : STYLE_HYBRID;
}

/** try to fetch the token from /public/mapbox-token using basePath for GH Pages */
async function getToken(): Promise<string> {
  if (typeof window === "undefined") return "";
  try {
    const res = await fetch(withBasePath("/mapbox-token"), { cache: "no-store" });
    const txt = (await res.text()).trim();
    return txt;
  } catch {
    return "";
  }
}

function logoFrom(props: Record<string, any> | null | undefined): string | null {
  if (!props) return null;
  // Try several fields commonly present in your data to infer logo filename.
  const name =
    props.retailer ||
    props.Retailer ||
    props.name ||
    props.Name ||
    props.title ||
    props.Title;

  if (!name || typeof name !== "string") return null;

  // Slugify
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  // Logo files are in /public/icons (as you shared)
  return withBasePath(`/icons/${slug}.png`);
}

function categoryFrom(props: Record<string, any> | null | undefined): string {
  const v =
    props?.category ??
    props?.Category ??
    props?.type ??
    props?.Type ??
    props?.location_type ??
    props?.LocationType;

  return typeof v === "string" ? v : "Unknown";
}

function colorForCategory(cat: string): string {
  return CATEGORY_COLOR[cat] ?? CATEGORY_COLOR._default;
}

const circlePaintForMain = [
  "match",
  ["coalesce", ["get", "category"], ["get", "Category"], ["get", "type"], ["get", "Type"]],
  "Kingpin",
  "#f43f5e",
  "Agronomy",
  "#22c55e",
  "Office/Service",
  "#60a5fa",
  "Grain",
  "#f59e0b",
  "Agronomy/Grain",
  "#a855f7",
  "Distribution",
  "#14b8a6",
  "Grain/Feed",
  "#eab308",
  /* default */ "#2dd4bf",
] as any;

export default function CertisMap({
  main,
  kingpins,
  home = null,
  onPointClick,
  mapStyle = "hybrid",
}: CertisMapProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // Prepare constant token + style URL
  const styleUrl = useMemo(() => styleUrlFor(mapStyle), [mapStyle]);

  useEffect(() => {
    let disposed = false;
    let m: mapboxgl.Map | null = null;

    (async () => {
      const token = await getToken();

      // Hard fail if token missing (shows controlled message in UI)
      if (!token) {
        // Let this throw so the error boundary surfaces it
        throw new Error(
          "An API access token is required to use Mapbox GL. See https://docs.mapbox.com/api/overview/#access-tokens-and-token-scopes",
        );
      }

      // set both global and constructor token (helps some bundlers)
      mapboxgl.accessToken = token;

      if (disposed || !mapDivRef.current) return;

      m = new mapboxgl.Map({
        accessToken: token, // ALSO pass here
        container: mapDivRef.current,
        style: styleUrl,
        center: [-93.5, 41.8],
        zoom: 4,
        projection: { name: "mercator" as any }, // lock mercator
        dragRotate: false,
        touchPitch: false,
      });

      mapRef.current = m;

      // standard controls
      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

      // Keep Mercator if style is changed later
      m.on("style.load", () => {
        try {
          m!.setProjection({ name: "mercator" as any });
        } catch {
          /* ignore */
        }
        wireAll(m!);
      });

      // Initial wire once the style first loads
      m.once("style.load", () => {
        wireAll(m!);
      });

      // Cursor
      m.getCanvas().style.cursor = "default";

      // Resize on window size change
      const onRz = () => m && m.resize();
      window.addEventListener("resize", onRz);

      // Cleanup
      return () => {
        window.removeEventListener("resize", onRz);
        popupRef.current?.remove();
        m?.remove();
      };
    })();

    return () => {
      disposed = true;
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // create map once

  // Update map style when the radio changes (re-wire on style.load)
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (m.getStyle().sprite?.startsWith(styleUrl)) return; // already on desired style
    m.setStyle(styleUrl);
  }, [styleUrl]);

  // Push new data to sources whenever it changes
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const put = (id: string, fc: FC) => {
      const s = m.getSource(id) as GeoJSONSource | undefined;
      if (!s) return;
      s.setData(fc as any);
    };

    put(MAIN_SRC, main);
    put(KING_SRC, kingpins);

    if (home) {
      const homeSource = m.getSource(HOME_SRC) as GeoJSONSource | undefined;
      if (homeSource) {
        homeSource.setData({
          type: "FeatureCollection",
          features: [
            { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: home } },
          ],
        } as any);
      }
    }
  }, [main, kingpins, home]);

  /** Add sources, layers and events. Called on every style.load */
  function wireAll(map: mapboxgl.Map) {
    // ---- Sources ----
    if (!map.getSource(MAIN_SRC)) {
      map.addSource(MAIN_SRC, {
        type: "geojson",
        data: main as any,
        cluster: true,
        clusterRadius: 55,
        clusterMaxZoom: 14,
      });
    }

    if (!map.getSource(KING_SRC)) {
      map.addSource(KING_SRC, {
        type: "geojson",
        data: kingpins as any,
      });
    }

    if (!map.getSource(HOME_SRC)) {
      map.addSource(HOME_SRC, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: home
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: home },
                },
              ]
            : [],
        } as any,
      });
    }

    // ---- Layers: clusters, counts, unclustered main points ----
    if (!map.getLayer(MAIN_CLUSTERS)) {
      map.addLayer({
        id: MAIN_CLUSTERS,
        type: "circle",
        source: MAIN_SRC,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#4ade80", // greenish
          "circle-opacity": 0.85,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            16,
            10,
            20,
            25,
            26,
            28,
            64,
            32,
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#0f172a",
        },
      });
    }

    if (!map.getLayer(MAIN_COUNT)) {
      map.addLayer({
        id: MAIN_COUNT,
        type: "symbol",
        source: MAIN_SRC,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        },
        paint: {
          "text-color": "#0f172a",
        },
      });
    }

    if (!map.getLayer(MAIN_POINTS)) {
      map.addLayer({
        id: MAIN_POINTS,
        type: "circle",
        source: MAIN_SRC,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3, 5,
            6, 6.5,
            9, 7.5,
          ],
          "circle-color": circlePaintForMain,
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1.25,
        },
      });
    }

    // ---- Kingpins above clusters ----
    if (!map.getLayer(KING_LAYER)) {
      map.addLayer({
        id: KING_LAYER,
        type: "circle",
        source: KING_SRC,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3, 6,
            6, 7.5,
            9, 9,
          ],
          "circle-color": "#ef4444", // red fill
          "circle-stroke-color": "#fde047", // yellow ring
          "circle-stroke-width": 2.5,
        },
      });
    }

    // ---- Home marker (small white dot) ----
    if (!map.getLayer(HOME_LAYER)) {
      map.addLayer({
        id: HOME_LAYER,
        type: "circle",
        source: HOME_SRC,
        paint: {
          "circle-radius": 5,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#0ea5e9",
          "circle-stroke-width": 2,
        },
      });
    }

    // ---- Certis watermark in-map (simple corner div) ----
    injectLogoOverlay(map);

    // ---- Interactions: hover popup + click-to-add ----
    bindInteractions(map);
  }

  function bindInteractions(map: mapboxgl.Map) {
    // Hover
    const showPopup = (e: mapboxgl.MapMouseEvent) => {
      const feats = map.queryRenderedFeatures(e.point, {
        layers: [KING_LAYER, MAIN_POINTS],
      });
      const feat = feats[0];
      if (!feat) {
        popupRef.current?.remove();
        popupRef.current = null;
        map.getCanvas().style.cursor = "default";
        return;
      }

      map.getCanvas().style.cursor = "pointer";

      const props = feat.properties || {};
      const cat = categoryFrom(props as any);
      const title =
        (props?.name || props?.Name || props?.title || props?.Title || "Location") as string;

      const coords = (
        feat.geometry.type === "Point"
          ? (feat.geometry.coordinates as Position)
          : (e.lngLat.toArray() as Position)
      ) as Position;

      const logo = logoFrom(props as any);

      const html = `
        <div style="display:flex; gap:.5rem; align-items:flex-start;">
          ${
            logo
              ? `<img src="${logo}" alt="" style="width:36px;height:36px;object-fit:contain;"/>`
              : ""
          }
          <div>
            <div style="font-weight:700;margin:0 0 2px">${escapeHtml(title)}</div>
            <div style="font-size:12px;opacity:.9">${escapeHtml(cat)}</div>
          </div>
        </div>
      `;

      if (!popupRef.current) {
        popupRef.current = new mapboxgl.Popup({
          closeButton: false,
          closeOnMove: true,
          offset: 10,
        })
          .setLngLat(coords as any)
          .setHTML(html)
          .addTo(map);
      } else {
        popupRef.current.setLngLat(coords as any).setHTML(html);
      }
    };

    const clickHandler = (e: mapboxgl.MapMouseEvent) => {
      if (!onPointClick) return;

      // kingpin first, then main
      const feats = map.queryRenderedFeatures(e.point, {
        layers: [KING_LAYER, MAIN_POINTS],
      });
      const feat = feats[0];
      if (!feat) return;

      const ll =
        feat.geometry.type === "Point"
          ? new LngLat(
              (feat.geometry.coordinates as Position)[0],
              (feat.geometry.coordinates as Position)[1],
            )
          : e.lngLat;

      onPointClick(feat.properties || {}, ll);
    };

    map.on("mousemove", showPopup);
    map.on("mouseleave", MAIN_POINTS, () => {
      popupRef.current?.remove();
      popupRef.current = null;
      map.getCanvas().style.cursor = "default";
    });
    map.on("mouseleave", KING_LAYER, () => {
      popupRef.current?.remove();
      popupRef.current = null;
      map.getCanvas().style.cursor = "default";
    });
    map.on("click", clickHandler);
  }

  return (
    <div
      ref={mapDivRef}
      id={MAP_ID}
      style={{
        width: "100%",
        height: "70vh",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 0 0 1px rgba(15,23,42,.5), 0 8px 30px rgba(0,0,0,.35)",
      }}
    />
  );
}

/* --------------------------- helpers --------------------------- */

function injectLogoOverlay(map: mapboxgl.Map) {
  // Add a static corner logo (simple HTML overlay)
  const id = "__certis_logo_overlay";
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.id = id;
  el.style.position = "absolute";
  el.style.top = "6px";
  el.style.left = "8px";
  el.style.zIndex = "3";
  el.style.pointerEvents = "none";
  el.innerHTML = `<img src="${withBasePath(
    "/certis-logo.png",
  )}" alt="Certis" style="height:20px;opacity:.9;"/>`;

  const container = map.getContainer();
  container.appendChild(el);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
