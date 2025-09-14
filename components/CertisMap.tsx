// components/CertisMap.tsx
"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import React, { useEffect, useRef, useState } from "react";
import mapboxgl, {
  Map as MapboxMap,
  GeoJSONSource,
  LngLatLike,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
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
  data: FeatureCollection;             // clustered
  kingpins?: FeatureCollection | null; // non-clustered
  home?: Position | null;
  onPointClick?: (f: Feature) => void;
  /** Mapbox style id (e.g. "satellite-streets-v12" or "streets-v12") */
  styleId?: string;
}

const DEFAULT_CENTER: LngLatLike = [-93.5, 41.9];
const DEFAULT_ZOOM = 4.3;

export default function CertisMap({
  data,
  kingpins = null,
  home = null,
  onPointClick,
  styleId = "satellite-streets-v12", // default = Hybrid
}: CertisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // latest props via refs so style swaps reuse fresh data
  const dataRef = useRef(data);
  const kpRef = useRef(kingpins);
  const homeRef = useRef(home);
  const styleRef = useRef(styleId);
  dataRef.current = data;
  kpRef.current = kingpins;
  homeRef.current = home;
  styleRef.current = styleId;

  const [logoMissing, setLogoMissing] = useState(false);

  // init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: `mapbox://styles/mapbox/${styleRef.current}`,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      cooperativeGestures: false,
      attributionControl: true,
      projection: { name: "mercator" },
    });
    mapRef.current = map;

    const addSourcesLayers = () => {
      if (!map.isStyleLoaded()) return;
      try { map.setProjection({ name: "mercator" } as any); } catch {}

      // retailers (clustered)
      if (!map.getSource("retailers")) {
        map.addSource("retailers", {
          type: "geojson",
          data: (dataRef.current ?? { type: "FeatureCollection", features: [] }) as any,
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 40,
        });
      }

      if (!map.getLayer("clusters")) {
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
      }

      if (!map.getLayer("cluster-count")) {
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "retailers",
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 11 },
          paint: { "text-color": "#0b1220" },
        } as any);
      }

      if (!map.getLayer("unclustered-point")) {
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
      }

      // KINGPINs (non-clustered)
      if (kpRef.current) {
        if (!map.getSource("kingpins")) {
          map.addSource("kingpins", { type: "geojson", data: kpRef.current as any });
        } else {
          (map.getSource("kingpins") as GeoJSONSource).setData(kpRef.current as any);
        }
        if (!map.getLayer("kingpins-layer")) {
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
      }

      // HOME
      if (homeRef.current) {
        const d = {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: homeRef.current } }],
        };
        if (!map.getSource("home")) map.addSource("home", { type: "geojson", data: d as any });
        else (map.getSource("home") as GeoJSONSource).setData(d as any);

        if (!map.getLayer("home-layer")) {
          map.addLayer({
            id: "home-layer",
            type: "circle",
            source: "home",
            paint: { "circle-color": "#22d3ee", "circle-radius": 7, "circle-stroke-color": "#0f172a", "circle-stroke-width": 2 },
          } as any);
        }
      }
    };

    map.on("load", addSourcesLayers);
    map.on("styledata", () => { try { map.setProjection({ name: "mercator" } as any); } catch {} });

    // cluster click zoom
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
    map.on("click", "kingpins-layer", (e) => showPopup(e, "KINGPIN"));

    return () => { popupRef.current?.remove(); map.remove(); mapRef.current = null; };
  }, [onPointClick]);

  // live data updates without style swap
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (map.getSource("retailers")) (map.getSource("retailers") as GeoJSONSource).setData(data as any);
  }, [data]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (kingpins) {
      if (map.getSource("kingpins")) (map.getSource("kingpins") as GeoJSONSource).setData(kingpins as any);
      // layer added on load if missing
    } else {
      if (map.getLayer("kingpins-layer")) map.removeLayer("kingpins-layer");
      if (map.getSource("kingpins")) map.removeSource("kingpins");
    }
  }, [kingpins]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (home) {
      const d = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: home } }] };
      if (map.getSource("home")) (map.getSource("home") as GeoJSONSource).setData(d as any);
      else if (map.isStyleLoaded()) {
        map.addSource("home", { type: "geojson", data: d as any });
        map.addLayer({
          id: "home-layer", type: "circle", source: "home",
          paint: { "circle-color":"#22d3ee","circle-radius":7,"circle-stroke-color":"#0f172a","circle-stroke-width":2 },
        } as any);
      }
    } else { if (map.getLayer("home-layer")) map.removeLayer("home-layer"); if (map.getSource("home")) map.removeSource("home"); }
  }, [home]);

  // style changes (Street / Hybrid)
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const nextUri = `mapbox://styles/mapbox/${styleId}`;
    if ((map as any).getStyle()?.sprite?.includes(styleId)) return; // already set
    map.setStyle(nextUri); // on "load", sources/layers are re-added using refs
  }, [styleId]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* in-frame brand (fallback to pill if image missing) */}
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
