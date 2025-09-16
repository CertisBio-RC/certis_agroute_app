"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { MapMouseEvent } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Feature, FeatureCollection, Point, Position } from "geojson";

/** Props expected by the map */
export type CertisMapProps = {
  /** Mapbox token (already resolved from env or /public/data/token.txt) */
  token: string;
  /** Non-kingpin points (clustered) */
  main: FeatureCollection<Point, any>;
  /** KINGPIN points (non-clustered, always visible) */
  kingpins: FeatureCollection<Point, any>;
  /** Optional home pin */
  home?: Position | null;
  /** Property key used for category coloring (e.g., "Location Type" / "Type") */
  typeKey: string;
  /** "hybrid" (default) or "street" */
  mapStyle?: "hybrid" | "street";
  /** Called when a user clicks a real point (not a cluster) */
  onPointClick?: (properties: any, ll: mapboxgl.LngLat) => void;
};

const MAP_CONTAINER_ID = "certis-map";
const MAIN_SRC = "main-src";
const KING_SRC = "king-src";
const HOME_SRC = "home-src";
const CLUSTER_LAYER = "main-clusters";
const CLUSTER_COUNT = "main-cluster-count";
const MAIN_POINTS = "main-points";
const KING_LAYER = "king-points";
const HOME_LAYER = "home-point";

function styleUrlFor(mode: "hybrid" | "street" | undefined) {
  return mode === "street"
    ? "mapbox://styles/mapbox/streets-v12"
    : "mapbox://styles/mapbox/satellite-streets-v12";
}

/** Categorical color expression for main points */
function categoryExpression(typeKey: string, categories: string[], colorMap: Record<string, string>) {
  // ['match', ['get', typeKey], 'Retailer','#60a5fa', 'Distributor','#22c55e', ... , '#60a5fa' ]
  const expr: any[] = ["match", ["get", typeKey]];
  for (const c of categories) {
    expr.push(c, colorMap[c] ?? "#60a5fa");
  }
  expr.push("#60a5fa"); // fallback
  return expr as any; // mapbox-gl types are restrictive; safe cast
}

/** Simple palette (map-side; sidebar can have its own) */
function buildColorMap(categories: string[]): Record<string, string> {
  const base: Record<string, string> = {
    Distributor: "#22c55e",
    Retailer: "#60a5fa",
    Dealer: "#a78bfa",
    Branch: "#f59e0b",
    Warehouse: "#f97316",
    Office: "#84cc16",
    Other: "#94a3b8",
    Kingpin: "#ef4444",
  };
  const out: Record<string, string> = { ...base };
  for (const t of categories) if (!out[t]) out[t] = "#60a5fa";
  return out;
}

const CertisMap: React.FC<CertisMapProps> = ({
  token,
  main,
  kingpins,
  home,
  typeKey,
  mapStyle = "hybrid",
  onPointClick,
}) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  /** All categories present in current main data */
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const f of main.features) {
      const v = (f.properties ?? {})[typeKey];
      if (v != null) {
        const s = String(v).trim();
        if (s) set.add(s);
      }
    }
    return Array.from(set);
  }, [main, typeKey]);

  const colorMap = useMemo(() => buildColorMap(categories), [categories]);

  /** Init map */
  useEffect(() => {
    if (!containerRef.current) return;
    if (!token) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUrlFor(mapStyle),
      projection: { name: "mercator" as any }, // lock Mercator
      center: [-96.0, 38.5],
      zoom: 3.4,
      attributionControl: true,
      cooperativeGestures: false,
      pitchWithRotate: false,
      dragRotate: false,
    });

    mapRef.current = map;

    map.once("load", () => {
      try {
        // Ensure mercator on load too (style protects it, but re-assert)
        map.setProjection({ name: "mercator" as any });

        // MAIN clustered source
        map.addSource(MAIN_SRC, {
          type: "geojson",
          data: main,
          cluster: true,
          clusterRadius: 50,
          clusterMaxZoom: 14,
        });

        // clusters
        map.addLayer({
          id: CLUSTER_LAYER,
          type: "circle",
          source: MAIN_SRC,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#1f7a39",
            "circle-radius": [
              "step",
              ["get", "point_count"],
              14,
              50,
              20,
              150,
              28,
            ] as any,
            "circle-stroke-color": "#0d2231",
            "circle-stroke-width": 1.5,
          },
        });

        map.addLayer({
          id: CLUSTER_COUNT,
          type: "symbol",
          source: MAIN_SRC,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count"] as any,
            "text-size": 12,
          },
          paint: {
            "text-color": "#d1e7ff",
          },
        });

        // unclustered main points with category colors
        map.addLayer({
          id: MAIN_POINTS,
          type: "circle",
          source: MAIN_SRC,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": categoryExpression(typeKey, categories, colorMap),
            "circle-radius": 6,
            "circle-stroke-width": 1.25,
            "circle-stroke-color": "#0d2231",
          } as any,
        });

        // KINGPINS (always visible, non-clustered)
        map.addSource(KING_SRC, {
          type: "geojson",
          data: kingpins,
        });
        map.addLayer({
          id: KING_LAYER,
          type: "circle",
          source: KING_SRC,
          paint: {
            "circle-color": "#ef4444", // red fill
            "circle-radius": 8,
            "circle-stroke-color": "#fde047", // yellow ring
            "circle-stroke-width": 2.0,
          },
        });

        // HOME
        map.addSource(HOME_SRC, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
        map.addLayer({
          id: HOME_LAYER,
          type: "circle",
          source: HOME_SRC,
          paint: {
            "circle-color": "#38bdf8",
            "circle-radius": 7.5,
            "circle-stroke-color": "#0d2231",
            "circle-stroke-width": 2,
          },
        });

        // Interactivity
        map.getCanvas().style.cursor = "default";

        // Hover popup (kingpins + unclustered)
        const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
        const showPopup = (e: MapMouseEvent) => {
          const feats = map.queryRenderedFeatures(e.point, {
            layers: [KING_LAYER, MAIN_POINTS],
          });
          const f = feats.find(Boolean) as any;
          if (!f) {
            popup.remove();
            map.getCanvas().style.cursor = "default";
            return;
          }
          const p = f.properties ?? {};
          const lngLat = e.lngLat;
          map.getCanvas().style.cursor = "pointer";

          // Build popup HTML (Retailer • City, ST, plus type)
          const name =
            (p.Retailer ?? p.retailer ?? p.Name ?? p.name ?? "Location").toString();
          const city = (p.City ?? "").toString();
          const st = (p.State ?? p.ST ?? "").toString();
          const t = (p[typeKey] ?? p.Type ?? p.type ?? "").toString();

          const html = `
            <div style="min-width:200px;max-width:280px;">
              <div style="font-weight:600;margin-bottom:2px;">${name}</div>
              <div style="opacity:.75">${[city, st].filter(Boolean).join(", ")}</div>
              <div style="opacity:.75;margin-top:6px;">${t || ""}</div>
            </div>
          `;
          popup.setLngLat(lngLat).setHTML(html).addTo(map);
        };

        map.on("mousemove", KING_LAYER, showPopup);
        map.on("mousemove", MAIN_POINTS, showPopup);
        map.on("mouseleave", KING_LAYER, () => {
          popup.remove();
          map.getCanvas().style.cursor = "default";
        });
        map.on("mouseleave", MAIN_POINTS, () => {
          popup.remove();
          map.getCanvas().style.cursor = "default";
        });

        // Click: expand cluster or add stop
        map.on("click", CLUSTER_LAYER, (e) => {
          const f = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] })[0] as any;
          if (!f) return;
          const clusterId = f.properties?.cluster_id;
          const src = map.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
          if (!src || clusterId == null) return;
          // @ts-ignore - exists at runtime in mapbox-gl v3
          src.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
            if (err) return;
            map.easeTo({ center: (f.geometry?.coordinates as [number, number]) ?? e.lngLat, zoom });
          });
        });

        map.on("click", MAIN_POINTS, (e) => {
          const f = map.queryRenderedFeatures(e.point, { layers: [MAIN_POINTS] })[0] as any;
          if (!f) return;
          if (onPointClick) onPointClick(f.properties ?? {}, e.lngLat);
        });
        map.on("click", KING_LAYER, (e) => {
          const f = map.queryRenderedFeatures(e.point, { layers: [KING_LAYER] })[0] as any;
          if (!f) return;
          if (onPointClick) onPointClick(f.properties ?? {}, e.lngLat);
        });
      } catch (err) {
        console.error(err);
      }
    });

    // Resize handling
    const handleResize = () => map.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      try {
        map.remove();
      } catch {}
      mapRef.current = null;
    };
  }, [token]); // init once when token ready

  /** Style switch (keep Mercator & rewire layers) */
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const next = styleUrlFor(mapStyle);
    if (m.getStyle()?.sprite?.includes(next)) return; // naive guard
    m.setStyle(next);
    m.once("style.load", () => {
      try {
        m.setProjection({ name: "mercator" as any });

        // Re-add everything against the new style
        // MAIN source & layers
        if (!m.getSource(MAIN_SRC)) {
          m.addSource(MAIN_SRC, {
            type: "geojson",
            data: main,
            cluster: true,
            clusterRadius: 50,
            clusterMaxZoom: 14,
          });
        } else {
          (m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource).setData(main);
        }

        if (!m.getLayer(CLUSTER_LAYER)) {
          m.addLayer({
            id: CLUSTER_LAYER,
            type: "circle",
            source: MAIN_SRC,
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#1f7a39",
              "circle-radius": [
                "step",
                ["get", "point_count"],
                14,
                50,
                20,
                150,
                28,
              ] as any,
              "circle-stroke-color": "#0d2231",
              "circle-stroke-width": 1.5,
            },
          });
        }

        if (!m.getLayer(CLUSTER_COUNT)) {
          m.addLayer({
            id: CLUSTER_COUNT,
            type: "symbol",
            source: MAIN_SRC,
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count"] as any,
              "text-size": 12,
            },
            paint: { "text-color": "#d1e7ff" },
          });
        }

        if (!m.getLayer(MAIN_POINTS)) {
          const cats = Array.from(
            new Set(
              main.features
                .map((f) => (f.properties ?? {})[typeKey])
                .filter((x) => x != null)
                .map((x) => String(x).trim())
            )
          );
          const colors = buildColorMap(cats);
          m.addLayer({
            id: MAIN_POINTS,
            type: "circle",
            source: MAIN_SRC,
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": categoryExpression(typeKey, cats, colors),
              "circle-radius": 6,
              "circle-stroke-width": 1.25,
              "circle-stroke-color": "#0d2231",
            } as any,
          });
        }

        // KING source & layer
        if (!m.getSource(KING_SRC)) {
          m.addSource(KING_SRC, { type: "geojson", data: kingpins });
        } else {
          (m.getSource(KING_SRC) as mapboxgl.GeoJSONSource).setData(kingpins);
        }
        if (!m.getLayer(KING_LAYER)) {
          m.addLayer({
            id: KING_LAYER,
            type: "circle",
            source: KING_SRC,
            paint: {
              "circle-color": "#ef4444",
              "circle-radius": 8,
              "circle-stroke-color": "#fde047",
              "circle-stroke-width": 2.0,
            },
          });
        }

        // HOME
        if (!m.getSource(HOME_SRC)) {
          m.addSource(HOME_SRC, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
        }
        if (!m.getLayer(HOME_LAYER)) {
          m.addLayer({
            id: HOME_LAYER,
            type: "circle",
            source: HOME_SRC,
            paint: {
              "circle-color": "#38bdf8",
              "circle-radius": 7.5,
              "circle-stroke-color": "#0d2231",
              "circle-stroke-width": 2,
            },
          });
        }
      } catch (err) {
        console.error(err);
      }
    });
  }, [mapStyle, main, kingpins, typeKey]);

  /** Live updates for sources when props change */
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const s = m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
    if (s) s.setData(main);
  }, [main]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const s = m.getSource(KING_SRC) as mapboxgl.GeoJSONSource | undefined;
    if (s) s.setData(kingpins);
  }, [kingpins]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const s = m.getSource(HOME_SRC) as mapboxgl.GeoJSONSource | undefined;
    if (!s) return;
    const features: Feature<Point, any>[] = home
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [home[0], home[1]] },
          },
        ]
      : [];
    s.setData({ type: "FeatureCollection", features });
  }, [home]);

  return (
    <div
      id={MAP_CONTAINER_ID}
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 600 }}
    />
  );
};

export default CertisMap;
