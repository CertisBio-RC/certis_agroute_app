"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type {
  Geometry,
  Feature as GFeature,
  FeatureCollection as GFC,
} from "geojson";

// ---------- Shared GeoJSON types (ALIGN WITH page.tsx) ----------
type Feature = GFeature<Geometry, any>;
type FC = GFC<Geometry, any>;
// ---------------------------------------------------------------

export type Basemap = "Hybrid" | "Satellite" | "Streets";
export type MarkerStyle = "Colored dots" | "Retailer logos";

export type Stop = { coord: [number, number]; title?: string };

export interface CertisMapProps {
  data: FC;
  bbox?: [number, number, number, number] | null;
  basemap: Basemap;
  markerStyle: MarkerStyle;
  projection?: "mercator" | "globe";
  home?: [number, number] | null;
  stops?: Stop[];
  onAddStop?: (f: Feature) => void;
}

const TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
  process.env.MAPBOX_PUBLIC_TOKEN ||
  "";

if (TOKEN) mapboxgl.accessToken = TOKEN;

const BASE_PATH =
  (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "") || "";

const LAYER_IDS = {
  srcRetailers: "src-retailers",
  srcKings: "src-kings",
  clusters: "lyr-clusters",
  clusterCount: "lyr-cluster-count",
  points: "lyr-points",
  logos: "lyr-logos",
  kings: "lyr-kings",
  kingsHalo: "lyr-kings-halo",
};

function getStyleFromBasemap(b: Basemap) {
  if (!TOKEN) return null; // use OSM fallback in code below
  switch (b) {
    case "Hybrid":
      return "mapbox://styles/mapbox/satellite-streets-v12";
    case "Satellite":
      return "mapbox://styles/mapbox/satellite-v9";
    default:
      return "mapbox://styles/mapbox/streets-v12";
  }
}

/** Create a tiny solid-circle ImageData as a symbol fallback */
function makeDot(rgba: [number, number, number, number], size = 28): ImageData {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const [r, g, b, a] = rgba;
  ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

/** True if feature is a kingpin (always emphasize + never cluster) */
function isKingpin(f: Feature) {
  const p: any = f.properties || {};
  return String(p.Category || "").toLowerCase() === "kingpin";
}

export default function CertisMap({
  data,
  bbox,
  basemap,
  markerStyle,
  projection = "mercator",
  home,
  stops = [],
  onAddStop,
}: CertisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // Split data once so kingpins can be rendered above other content
  const { kingsFC, othersFC } = useMemo(() => {
    const kings: Feature[] = [];
    const others: Feature[] = [];
    for (const f of data.features || []) {
      (isKingpin(f) ? kings : others).push(f);
    }
    return {
      kingsFC: { type: "FeatureCollection", features: kings } as FC,
      othersFC: { type: "FeatureCollection", features: others } as FC,
    };
  }, [data]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current) return;

    // Dispose old map if any
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const style = getStyleFromBasemap(basemap);

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style:
        style ||
        // OSM fallback when no Mapbox token
        {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: [
                "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        } as any,
      center: [-96.5, 41.2],
      zoom: 4.3,
      projection,
      cooperativeGestures: true,
      dragRotate: false,
    });

    mapRef.current = map;

    map.on("load", () => {
      // Sources
      if (map.getSource(LAYER_IDS.srcRetailers))
        map.removeSource(LAYER_IDS.srcRetailers);
      if (map.getSource(LAYER_IDS.srcKings))
        map.removeSource(LAYER_IDS.srcKings);

      map.addSource(LAYER_IDS.srcRetailers, {
        type: "geojson",
        data: othersFC,
        cluster: true,
        clusterRadius: 42,
        clusterMaxZoom: 12,
        promoteId: "id",
      });

      map.addSource(LAYER_IDS.srcKings, {
        type: "geojson",
        data: kingsFC,
        promoteId: "id",
      });

      // Cluster circles
      map.addLayer({
        id: LAYER_IDS.clusters,
        type: "circle",
        source: LAYER_IDS.srcRetailers,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#3b82f6", // blue
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            25,
            24,
            75,
            32,
          ],
          "circle-stroke-color": "#0b1220",
          "circle-stroke-width": 2,
        },
      });

      // Cluster label
      map.addLayer({
        id: LAYER_IDS.clusterCount,
        type: "symbol",
        source: LAYER_IDS.srcRetailers,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });

      // Colored dots for non-kingpin points (unclustered)
      map.addLayer({
        id: LAYER_IDS.points,
        type: "circle",
        source: LAYER_IDS.srcRetailers,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "match",
            ["downcase", ["get", "Category"]],
            "kingpin",
            "#ef4444",
            "agronomy",
            "#22c55e",
            "office/service",
            "#eab308",
            /* default */ "#60a5fa",
          ],
          "circle-stroke-color": "#0b1220",
          "circle-stroke-width": 2,
        },
      });

      // KINGPINS — always-on top, never clustered
      map.addLayer({
        id: LAYER_IDS.kingsHalo,
        type: "circle",
        source: LAYER_IDS.srcKings,
        paint: {
          "circle-radius": 12,
          "circle-color": "#fff",
          "circle-opacity": 0.9,
        },
      });

      map.addLayer({
        id: LAYER_IDS.kings,
        type: "circle",
        source: LAYER_IDS.srcKings,
        paint: {
          "circle-radius": 9,
          "circle-color": "#f43f5e", // bright red/pink
          "circle-stroke-color": "#111827",
          "circle-stroke-width": 3,
        },
      });

      // Hover popup (works on clusters + points + kingpins)
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 14,
      });

      const showPopup = (e: mapboxgl.MapMouseEvent) => {
        const f = (e.features && e.features[0]) as any;
        if (!f) return;
        const p = f.properties || {};
        const html = `
          <div style="min-width:220px">
            <div style="font-weight:700">${p.Retailer || ""}</div>
            <div>${p.Name || ""}</div>
            <div style="opacity:.8">${p.Category || ""}</div>
            ${
              p.Address || p.City || p.Zip
                ? `<div style="margin-top:4px">${[
                    p.Address,
                    p.City,
                    p.Zip,
                  ]
                    .filter(Boolean)
                    .join(", ")}</div>`
                : ""
            }
          </div>`;
        popupRef.current!
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);
        map.getCanvas().style.cursor = "pointer";
      };

      const hidePopup = () => {
        popupRef.current?.remove();
        map.getCanvas().style.cursor = "";
      };

      // Events
      for (const id of [
        LAYER_IDS.clusters,
        LAYER_IDS.points,
        LAYER_IDS.kings,
        LAYER_IDS.kingsHalo,
      ]) {
        map.on("mousemove", id, showPopup);
        map.on("mouseleave", id, hidePopup);
        map.on("click", id, (ev) => {
          const f = (ev.features && ev.features[0]) as Feature | undefined;
          if (f && onAddStop) onAddStop(f);
        });
      }

      // Clicking clusters zooms in
      map.on("click", LAYER_IDS.clusters, (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [LAYER_IDS.clusters],
        });
        const clusterId = (features[0] as any).properties.cluster_id;
        const src = map.getSource(
          LAYER_IDS.srcRetailers
        ) as mapboxgl.GeoJSONSource;
        src.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: (features[0] as any).geometry.coordinates, zoom });
        });
      });

      // Home pin + Stops pin overlay
      if (home) {
        new mapboxgl.Marker({ color: "#16a34a" })
          .setLngLat(home)
          .setPopup(new mapboxgl.Popup({ offset: 10 }).setText("Home"))
          .addTo(map);
      }
      for (const [i, s] of (stops || []).entries()) {
        new mapboxgl.Marker({ color: "#f59e0b" })
          .setLngLat(s.coord)
          .setPopup(
            new mapboxgl.Popup({ offset: 10 }).setText(
              s.title || `Stop ${i + 1}`
            )
          )
          .addTo(map);
      }

      // Zoom to bbox
      if (bbox && bbox[0] !== bbox[2] && bbox[1] !== bbox[3]) {
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 40, duration: 500 }
        );
      }
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [
    othersFC,
    kingsFC,
    basemap,
    projection,
    home,
    stops,
    bbox?.join(","),
    markerStyle, // reserved for future logo layer switch
    data, // keep in deps so source refreshes on filter
  ]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", borderRadius: 12, overflow: "hidden" }}
      aria-label="Retailers map"
    />
  );
}
