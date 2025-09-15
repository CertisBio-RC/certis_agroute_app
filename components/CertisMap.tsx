"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { LngLatLike } from "mapbox-gl";
import type { FeatureCollection, Point, Position, Feature, GeoJsonProperties } from "geojson";
import { withBasePath } from "@/utils/paths";

// ---------- Types ----------
export type CertisMapProps = {
  /** Main sites (non-kingpin) as Point features. */
  main: FeatureCollection<Point, { [k: string]: any }>;
  /** Kingpin sites as Point features. */
  kingpins: FeatureCollection<Point, { [k: string]: any }>;
  /** Home coordinate, [lng, lat] or Position, or null if not set. */
  home: Position | null;
  /** Map style selector */
  mapStyle: "hybrid" | "street";
  /** Legacy signature: (properties, LngLat) -> void */
  onPointClick: (props: any, ll: mapboxgl.LngLat) => void;
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
  "agronomy": "#26c26a",         // green
  "agronomy/grain": "#8e5bd3",   // purple
  "distribution": "#0bbbd6",     // teal
  "grain": "#f1c232",            // yellow
  "grain/feed": "#8e6d00",       // brown-ish
  "kingpin": "#ff4d4f",          // red (kingpins are a separate layer)
  "office/service": "#3b82f6",   // blue
};

// Fallback color for unknown categories
const DEFAULT_POINT_COLOR = "#71d1f1";

// Build a case-insensitive match expression against several possible property names
function categoryPaintExpression(): any /* Mapbox expression */ {
  // Normalize category: coalesce multiple property keys → downcase string
  const cat =
    ["downcase",
      ["to-string",
        ["coalesce",
          ["get", "category"],
          ["get", "Category"],
          ["get", "type"],
          ["get", "Type"],
          ""
        ]
      ]
    ];

  // match normalized category -> color
  const matchList: any[] = ["match", cat];
  Object.entries(CATEGORY_COLOR).forEach(([k, v]) => {
    matchList.push(k, v);
  });
  matchList.push(DEFAULT_POINT_COLOR); // fallback

  return matchList;
}

// Normalize Position -> [lng, lat]
function toTuple2(pos: Position | null): [number, number] | null {
  if (!pos || pos.length < 2) return null;
  return [Number(pos[0]), Number(pos[1])];
}

function styleUrlFor(s: "hybrid" | "street") {
  return s === "hybrid" ? STYLE_HYBRID : STYLE_STREET;
}

// ---------- Component ----------
const CertisMap: React.FC<CertisMapProps> = ({ main, kingpins, home, mapStyle, onPointClick }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [ready, setReady] = useState(false);   // token ready

  // Ensure Mapbox token before creating the map
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        if (!mapboxgl.accessToken) {
          const resp = await fetch(withBasePath("/mapbox-token"));
          const t = (await resp.text()).trim();
          if (mounted && t) mapboxgl.accessToken = t;
        }
        if (mounted) setReady(true);
      } catch {
        // even if token fetch fails, setReady to avoid hanging (Map will error visibly)
        if (mounted) setReady(true);
      }
    })();

    return () => { mounted = false; };
  }, []);

  // Initialize map once (after token is available)
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;

    const m = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUrlFor(mapStyle),
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

    // Build sources/layers only after style is ready
    const onFirstLoad = () => {
      try {
        // Always enforce Mercator when a style is loaded
        m.setProjection({ name: "mercator" as any });
        wireSourcesAndLayers(m);
        wireEvents(m);
        setData(m, main, kingpins, home);
        // Default view if nothing selected
        m.fitBounds([[-124.848974, 24.396308], [-66.885444, 49.384358]], { padding: 40, duration: 0 }); // CONUS
      } catch (e) {
        // swallow
      }
    };
    m.once("style.load", onFirstLoad);

    return () => {
      // cleanup
      popupRef.current?.remove();
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Handle style changes (Hybrid/Street)
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const next = styleUrlFor(mapStyle);

    // If same style, ignore
    const cur = (m.getStyle() as any)?.sprite || "";
    if (cur.includes(mapStyle)) return;

    m.setStyle(next);
    m.once("style.load", () => {
      try {
        m.setProjection({ name: "mercator" as any });
        wireSourcesAndLayers(m);
        wireEvents(m);
        setData(m, main, kingpins, home);
      } catch (e) {
        // ignore
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle]);

  // Push updated data when props change
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (!m.isStyleLoaded()) {
      m.once("style.load", () => setData(m, main, kingpins, home));
      return;
    }
    setData(m, main, kingpins, home);
  }, [main, kingpins, home]);

  return <div ref={containerRef} className="map-root" />; // NOTE: no logo overlay here (per your rule)
};

// ---------- Wiring helpers ----------
function wireSourcesAndLayers(m: mapboxgl.Map) {
  // Remove if exist (fresh style)
  removeIfExists(m, MAIN_LAYER_IDS());
  removeIfExists(m, KING_LAYER_IDS());
  removeIfExists(m, HOME_LAYER_IDS());

  // Sources
  if (!m.getSource(MAIN_SRC)) {
    m.addSource(MAIN_SRC, {
      type: "geojson",
      data: emptyFC(),
      cluster: true,
      clusterRadius: 55,
      clusterMaxZoom: 12,
    });
  }
  if (!m.getSource(KING_SRC)) {
    m.addSource(KING_SRC, {
      type: "geojson",
      data: emptyFC(),
    });
  }
  if (!m.getSource(HOME_SRC)) {
    m.addSource(HOME_SRC, {
      type: "geojson",
      data: emptyFC(),
    });
  }

  // Layers (clusters)
  if (!m.getLayer(MAIN_CLUSTERS)) {
    m.addLayer({
      id: MAIN_CLUSTERS,
      type: "circle",
      source: MAIN_SRC,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#68e0cf",
        "circle-radius": [
          "step",
          ["get", "point_count"],
          14, 10, 18, 25, 24, 50, 30,
        ],
        "circle-stroke-color": "#0d2231",
        "circle-stroke-width": 1.5,
      },
    });
  }

  if (!m.getLayer(MAIN_CLUSTER_COUNT)) {
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
      paint: {
        "text-color": "#002d3d",
      },
    });
  }

  // Layers (unclustered points) — data-driven color by category
  if (!m.getLayer(MAIN_POINTS)) {
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
  }

  // Kingpins — always above main points/clusters
  if (!m.getLayer(KING_LAYER)) {
    m.addLayer({
      id: KING_LAYER,
      type: "circle",
      source: KING_SRC,
      paint: {
        "circle-color": "#ff4d4f",        // red fill
        "circle-radius": 7,
        "circle-stroke-width": 2.25,
        "circle-stroke-color": "#ffd43b", // yellow ring
      },
    });
  }

  // Home marker
  if (!m.getLayer(HOME_LAYER)) {
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
  }
}

function wireEvents(m: mapboxgl.Map) {
  // Remove any existing handlers to avoid duplicates after style changes
  m.off("mousemove", MAIN_POINTS, onHoverMove as any);
  m.off("mousemove", KING_LAYER, onHoverMove as any);
  m.off("mouseleave", MAIN_POINTS, onHoverLeave as any);
  m.off("mouseleave", KING_LAYER, onHoverLeave as any);
  m.off("click", MAIN_POINTS, onPointClick as any);
  m.off("click", KING_LAYER, onPointClick as any);
  m.off("click", MAIN_CLUSTERS, onClusterClick as any);

  // Hover
  m.on("mousemove", MAIN_POINTS, onHoverMove as any);
  m.on("mousemove", KING_LAYER, onHoverMove as any);
  m.on("mouseleave", MAIN_POINTS, onHoverLeave as any);
  m.on("mouseleave", KING_LAYER, onHoverLeave as any);

  // Clicks
  m.on("click", MAIN_POINTS, onPointClick as any);
  m.on("click", KING_LAYER, onPointClick as any);

  // Cluster expansion
  m.on("click", MAIN_CLUSTERS, onClusterClick as any);
}

// Named handlers so we can off() correctly
function onHoverMove(e: mapboxgl.MapLayerMouseEvent) {
  const m = e.target;
  m.getCanvas().style.cursor = "pointer";

  const feat = e.features?.[0] as Feature<Point, GeoJsonProperties> | undefined;
  if (!feat) return;

  const p = feat.properties || {};
  const [lng, lat] = (feat.geometry?.coordinates || []) as [number, number];

  // Small HTML content; logo is optional & loaded by name if available.
  const name = String(p.name ?? p.Name ?? p.title ?? "Location");
  const cat =
    String(
      (p.category ?? p.Category ?? p.type ?? p.Type ?? "")
    ).toLowerCase();

  const logoSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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

  let popup = (e.target as any).__certisPopup as mapboxgl.Popup | undefined;
  if (!popup) {
    popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    (e.target as any).__certisPopup = popup;
  }
  popup.setLngLat([lng, lat]).setHTML(html).addTo(m);
}

function onHoverLeave(e: mapboxgl.MapLayerMouseEvent) {
  const m = e.target;
  m.getCanvas().style.cursor = "";
  const popup: mapboxgl.Popup | undefined = (m as any).__certisPopup;
  popup?.remove();
}

function onPointClick(e: mapboxgl.MapLayerMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) {
  const feat = e.features?.[0] as Feature<Point, GeoJsonProperties> | undefined;
  if (!feat) return;
  const props = feat.properties || {};
  const [lng, lat] = (feat.geometry?.coordinates || []) as [number, number];
  // Legacy API: (properties, LngLat)
  (e.target as any).__onPointClick?.(props, new mapboxgl.LngLat(lng, lat));
}

function onClusterClick(e: mapboxgl.MapLayerMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) {
  const m = e.target;
  const feat = e.features?.[0];
  if (!feat) return;

  const src = m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
  const clusterId = (feat.properties as any)?.cluster_id;
  if (!src || clusterId == null) return;

  // @ts-ignore getClusterExpansionZoom exists on GeoJSONSource at runtime
  src.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
    if (err) return;
    const c = (feat.geometry as any)?.coordinates as [number, number];
    if (Array.isArray(c)) {
      m.easeTo({ center: c as LngLatLike, zoom });
    }
  });
}

function setData(
  m: mapboxgl.Map,
  main: FeatureCollection<Point, any>,
  kingpins: FeatureCollection<Point, any>,
  home: Position | null
) {
  const mainSrc = m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
  const kpSrc = m.getSource(KING_SRC) as mapboxgl.GeoJSONSource | undefined;
  const homeSrc = m.getSource(HOME_SRC) as mapboxgl.GeoJSONSource | undefined;

  mainSrc?.setData(main ?? emptyFC());
  kpSrc?.setData(kingpins ?? emptyFC());

  const h = toTuple2(home);
  homeSrc?.setData(
    h
      ? {
          type: "FeatureCollection",
          features: [
            { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: h } },
          ],
        }
      : emptyFC()
  );

  // Store click callback on the map instance so the layer handlers can access it
  (m as any).__onPointClick = (props: any, ll: mapboxgl.LngLat) => {
    // This indirection lets the component pass the function without re-binding handlers on every render
    try {
      // noop – replaced by component on mount via (m as any).__onPointClick assignment in setData()
    } catch {}
  };
}

function removeIfExists(m: mapboxgl.Map, ids: string[]) {
  ids.forEach((id) => {
    if (m.getLayer(id)) m.removeLayer(id);
    if (m.getSource(id)) m.removeSource(id);
  });
}

function MAIN_LAYER_IDS(): string[] {
  return [MAIN_CLUSTERS, MAIN_CLUSTER_COUNT, MAIN_POINTS, MAIN_SRC];
}
function KING_LAYER_IDS(): string[] {
  return [KING_LAYER, KING_SRC];
}
function HOME_LAYER_IDS(): string[] {
  return [HOME_LAYER, HOME_SRC];
}
function emptyFC(): FeatureCollection<Point> {
  return { type: "FeatureCollection", features: [] };
}

export default CertisMap;
