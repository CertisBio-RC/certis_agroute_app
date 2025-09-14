// components/CertisMap.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { LngLatLike, Map } from "mapbox-gl";

type GJPoint = GeoJSON.Point;
type GJFeature = GeoJSON.Feature<GJPoint, any>;
type GJFC = GeoJSON.FeatureCollection<GJPoint, any>;

export type CertisMapProps = {
  token: string;
  basemap: "Hybrid" | "Streets";
  data: GJFC;
  bbox: [number, number, number, number];
};

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

const styleForBasemap = (b: CertisMapProps["basemap"]) =>
  b === "Hybrid"
    ? "mapbox://styles/mapbox/satellite-streets-v12"
    : "mapbox://styles/mapbox/streets-v12";

function isKingpin(p: any): boolean {
  if (!p) return false;
  const v =
    p.kingpin ??
    p.Kingpin ??
    p.isKingpin ??
    p.LocationType ??
    p.locationType ??
    p.Type ??
    p.type ??
    p.Category ??
    p.category;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return /king\s*pin/i.test(v) || /kingpin/i.test(v);
  return false;
}

function popupHtml(p: any) {
  const title =
    p?.name || p?.Name || p?.locationName || p?.Retailer || "Location";
  const sub =
    p?.retailer ||
    p?.Retailer ||
    p?.company ||
    p?.Company ||
    p?.division ||
    "";
  const line1 = p?.address || p?.Address || "";
  const line2Parts = [
    p?.city || p?.City,
    p?.state || p?.State,
    p?.zip || p?.ZIP || p?.Zip,
  ].filter(Boolean);
  const line2 = line2Parts.join(", ");
  const isKP = isKingpin(p);
  return `
    <div class="popup">
      <div class="popup-title">${title}</div>
      ${
        sub
          ? `<div class="popup-sub">${sub}${
              isKP ? ` &nbsp;<span class="pill pill-warn">KINGPIN</span>` : ""
            }</div>`
          : isKP
          ? `<div class="popup-sub"><span class="pill pill-warn">KINGPIN</span></div>`
          : ""
      }
      ${
        line1 || line2
          ? `<div class="popup-body">${
              line1 ? `${line1}<br/>` : ""
            }${line2}</div>`
          : ""
      }
    </div>
  `;
}

export default function CertisMap({
  token,
  basemap,
  data,
  bbox,
}: CertisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // ensure access token
  useEffect(() => {
    if (token) mapboxgl.accessToken = token;
  }, [token]);

  const styleUrl = useMemo(() => styleForBasemap(basemap), [basemap]);

  // initialize map
  useEffect(() => {
    if (!containerRef.current) return;

    // destroy any existing
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUrl,
      bounds: bbox as unknown as mapboxgl.LngLatBoundsLike,
      fitBoundsOptions: { padding: 20 },
      attributionControl: false,
      cooperativeGestures: false, // normal wheel zoom
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "bottom-right");

    const onLoad = () => {
      // --- Source
      const sourceId = "retailers";
      if (map.getSource(sourceId)) map.removeSource(sourceId);

      map.addSource(sourceId, {
        type: "geojson",
        data,
        cluster: true,
        clusterRadius: 60,
        clusterMaxZoom: 14,
      });

      // --- Cluster circles
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: sourceId,
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            20,
            24,
            50,
            32,
            100,
            40,
          ],
          "circle-color": "#5aa1ff",
          "circle-opacity": 0.85,
          "circle-stroke-color": "#0b1220",
          "circle-stroke-width": 2,
        },
      });

      // --- Cluster count labels
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: sourceId,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: {
          "text-color": "#0b1220",
        },
      });

      // --- Unclustered points (non-kingpin)
      map.addLayer({
        id: "unclustered-dots",
        type: "circle",
        source: sourceId,
        filter: ["all", ["!", ["has", "point_count"]], ["!", ["case", ["to-boolean", ["coalesce", ["get", "kingpin"], ["get", "Kingpin"], ["get", "isKingpin"]]], true, false]]],
        paint: {
          "circle-radius": 6,
          "circle-color": "#43d3a6",
          "circle-stroke-color": "#0b1220",
          "circle-stroke-width": 1.5,
        },
      });

      // --- Kingpins: bright red fill with yellow border (always visible)
      map.addLayer({
        id: "kingpin-dots",
        type: "circle",
        source: sourceId,
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          [
            "case",
            ["to-boolean", ["coalesce", ["get", "kingpin"], ["get", "Kingpin"], ["get", "isKingpin"]]],
            true,
            false,
          ],
        ],
        paint: {
          "circle-radius": 9,
          "circle-color": "#ff3b30", // bright red
          "circle-stroke-color": "#ffd400", // yellow ring
          "circle-stroke-width": 3,
        },
      });

      // --- Cluster click => zoom into cluster
      map.on("click", "clusters", (e) => {
        const src = map.getSource(sourceId) as mapboxgl.GeoJSONSource & {
          getClusterExpansionZoom?: (
            clusterId: number,
            callback: (err?: any, zoom?: number) => void
          ) => void;
        };
        const f = (e.features || [])[0] as any;
        const clusterId = f?.properties?.cluster_id as number | undefined;
        if (!src || clusterId == null) return;

        // center: centroid of geometry bounds
        let center: LngLatLike | undefined;
        if (f?.geometry?.type === "Point" && Array.isArray(f.geometry.coordinates)) {
          center = f.geometry.coordinates as [number, number];
        } else if (Array.isArray((e as any).lngLat)) {
          center = (e as any).lngLat;
        }

        src.getClusterExpansionZoom?.(clusterId, (_, zoom) => {
          if (zoom == null) return;
          map.easeTo({ center, zoom });
        });
      });

      // ========= Hover / Tap popups (unclustered + kingpins) =========
      const hoverLayers = ["unclustered-dots", "kingpin-dots"];

      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
      });

      const showFromEvent = (evt: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent) => {
        const f = map
          .queryRenderedFeatures(evt.point, { layers: hoverLayers })
          .find(Boolean) as GJFeature | undefined;
        const p = f?.properties as any;
        if (!f || !p) {
          popupRef.current?.remove();
          map.getCanvas().style.cursor = "";
          return;
        }
        const coords = (f.geometry as GJPoint).coordinates as [number, number];
        popupRef.current!
          .setLngLat(coords)
          .setHTML(popupHtml(p))
          .addTo(map);
        map.getCanvas().style.cursor = "pointer";
      };

      const clearPopup = () => {
        popupRef.current?.remove();
        map.getCanvas().style.cursor = "";
      };

      map.on("mousemove", (e) => showFromEvent(e));
      map.on("mouseleave", "unclustered-dots", clearPopup);
      map.on("mouseleave", "kingpin-dots", clearPopup);

      // Tap (mobile)
      map.on("click", (e) => showFromEvent(e));
    };

    map.on("load", onLoad);

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [data, bbox, styleUrl]);

  return <div ref={containerRef} className="map-card" />;
}
