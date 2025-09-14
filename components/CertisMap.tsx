// components/CertisMap.tsx
"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import React, { useEffect, useRef, useState } from "react";
import mapboxgl, {
  Map as MapboxMap,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  GeoJSONSource,
  LngLatLike,
} from "mapbox-gl";
import { withBasePath } from "@/utils/paths";

const MAPBOX_TOKEN =
  (typeof window !== "undefined" ? (window as any).MAPBOX_TOKEN : undefined) ||
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
  "";

type Position = [number, number];
interface FeatureProperties { [key: string]: any }
interface Feature { type: "Feature"; properties: FeatureProperties; geometry: { type: "Point"; coordinates: Position } }
interface FeatureCollection { type: "FeatureCollection"; features: Feature[] }

export interface CertisMapProps {
  data: FeatureCollection;              // clustered
  kingpins?: FeatureCollection | null;  // non-clustered
  home?: Position | null;
  onPointClick?: (f: Feature) => void;
}

const DEFAULT_CENTER: LngLatLike = [-93.5, 41.9];
const DEFAULT_ZOOM = 4.3;

export default function CertisMap({ data, kingpins = null, home = null, onPointClick }: CertisMapProps) {
  const mapRef = useRef<MapboxMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [logoMissing, setLogoMissing] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      cooperativeGestures: false,
      attributionControl: true,
      projection: { name: "mercator" }, // ✅ force mercator
    });
    mapRef.current = map;

    const onLoad = () => {
      try { map.setProjection({ name: "mercator" } as any); } catch {}

      // main clustered source
      map.addSource("retailers", {
        type: "geojson",
        data: data as any,
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 40,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "retailers",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#5eead4", 25, "#34d399", 100, "#10b981"],
          "circle-radius": ["step", ["get", "point_count"], 14, 25, 20, 100, 26],
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1.25,
        },
      } as any);

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "retailers",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 11 },
        paint: { "text-color": "#0b1220" },
      } as any);

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "retailers",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#60a5fa",
          "circle-radius": 5.5,
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1.25,
        },
      } as any);

      // kingpins non-clustered
      if (kingpins) {
        map.addSource("kingpins", { type: "geojson", data: kingpins as any });
        map.addLayer({
          id: "kingpins-layer",
          type: "circle",
          source: "kingpins",
          paint: {
            "circle-color": "#ef4444",
            "circle-radius": 8,
            "circle-stroke-color": "#facc15",
            "circle-stroke-width": 3,
          },
        } as any);
      }

      // home
      if (home) {
        map.addSource("home", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: home } }],
          },
        });
        map.addLayer({
          id: "home-layer",
          type: "circle",
          source: "home",
          paint: { "circle-color": "#22d3ee", "circle-radius": 7, "circle-stroke-color": "#0f172a", "circle-stroke-width": 2 },
        } as any);
      }

      map.on("click", "clusters", (e: MapLayerMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const clusterId = features[0]?.properties?.cluster_id;
        const src = map.getSource("retailers") as GeoJSONSource;
        if (!src || clusterId == null) return;
        src.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          const center = (features[0].geometry as any).coordinates as LngLatLike;
          map.easeTo({ center, zoom });
        });
      });

      ["clusters", "unclustered-point", "kingpins-layer"].forEach((id) => {
        if (!map.getLayer(id)) return;
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
      });

      const showPopup = (e: MapLayerMouseEvent | MapLayerTouchEvent, label: string) => {
        if (!e.features?.length) return;
        const f = e.features[0] as any;
        const p = (f.properties || {}) as FeatureProperties;
        const coords = (f.geometry?.coordinates ?? []) as Position;
        const retailer = String(p.Retailer ?? p.Dealer ?? p["Retailer Name"] ?? "Retailer");
        const city = String(p.City ?? "");
        const state = String(p.State ?? "");
        const html = `
          <div style="font:12px/1.4 system-ui,sans-serif;">
            <div style="font-weight:600;margin-bottom:2px;">${retailer}</div>
            <div style="opacity:.8;">${[city, state].filter(Boolean).join(", ")}</div>
            <div style="margin-top:4px;font-size:11px;opacity:.8;">${label}</div>
          </div>`;
        if (!popupRef.current) popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
        popupRef.current.setLngLat(coords as any).setHTML(html).addTo(map);
        onPointClick?.({ type: "Feature", properties: p, geometry: { type: "Point", coordinates: coords } });
      };
      map.on("click", "unclustered-point", (e) => showPopup(e, "Location"));
      if (map.getLayer("kingpins-layer")) map.on("click", "kingpins-layer", (e) => showPopup(e, "KINGPIN"));
    };

    map.on("load", onLoad);
    map.on("styledata", () => { try { map.setProjection({ name: "mercator" } as any); } catch {} });

    return () => { popupRef.current?.remove(); map.remove(); mapRef.current = null; };
  }, [data, kingpins, home, onPointClick]);

  // live updates
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (map.isStyleLoaded() && map.getSource("retailers")) (map.getSource("retailers") as GeoJSONSource).setData(data as any);
    if (kingpins) {
      if (map.getSource("kingpins")) (map.getSource("kingpins") as GeoJSONSource).setData(kingpins as any);
      else if (map.isStyleLoaded()) {
        map.addSource("kingpins", { type: "geojson", data: kingpins as any });
        map.addLayer({ id: "kingpins-layer", type: "circle", source: "kingpins",
          paint: { "circle-color":"#ef4444","circle-radius":8,"circle-stroke-color":"#facc15","circle-stroke-width":3 } } as any);
      }
    }
    if (home) {
      const d = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: home } }] };
      if (map.getSource("home")) (map.getSource("home") as GeoJSONSource).setData(d as any);
      else if (map.isStyleLoaded()) {
        map.addSource("home", { type: "geojson", data: d as any });
        map.addLayer({ id: "home-layer", type: "circle", source: "home",
          paint: { "circle-color":"#22d3ee","circle-radius":7,"circle-stroke-color":"#0f172a","circle-stroke-width":2 } } as any);
      }
    } else { if (map.getLayer("home-layer")) map.removeLayer("home-layer"); if (map.getSource("home")) map.removeSource("home"); }
  }, [data, kingpins, home]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* in-frame brand */}
      <div className="pointer-events-none absolute left-3 top-3 z-10">
        {!logoMissing ? (
          <img
            src={withBasePath("logo-certis.png")}
            alt="Certis"
            className="h-7 opacity-90 drop-shadow"
            onError={() => setLogoMissing(true)}
            loading="eager"
          />
        ) : (
          <div className="rounded bg-black/40 px-2 py-1 text-xs tracking-wide border border-white/20">CERTIS</div>
        )}
      </div>
    </div>
  );
}
