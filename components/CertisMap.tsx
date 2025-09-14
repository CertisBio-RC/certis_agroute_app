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

  // keep latest props available for reattach after style swaps
  const dataRef = useRef(data);
  const kpRef = useRef(kingpins);
  const homeRef = useRef(home);
  const styleRef = useRef(styleId);
  dataRef.current = data;
  kpRef.current = kingpins;
  homeRef.current = home;
  styleRef.current = styleId;

  const [logoMissing, setLogoMissing] = useState(false);

  /** Add/update all sources & layers safely AFTER style.load */
  const addSourcesLayers = () => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return; // belt & suspenders

    try {
      // enforce mercator on every style
      try { map.setProjection({ name: "mercator" } as any); } catch {}

      // -- Retailers (clustered)
      if (!map.getSource("retailers")) {
        map.addSource("retailers", {
          type: "geojson",
          data: (dataRef.current ?? { type: "FeatureCollection", features: [] }) as any,
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 40,
        });
      } else {
        (map.getSource("retailers") as GeoJSONSource).setData((dataRef.current ?? { type:"FeatureCollection", features:[] }) as any);
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

      // -- KINGPINs (non-clustered, always visible)
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

      // -- HOME pin
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

      // cursors
      ["clusters", "unclustered-point", "kingpins-layer"].forEach((id) => {
        if (!map.hasImage?.(id)) {
          map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
        }
      });
    } catch {
      // If a late event sneaks in before style readiness, swallow and wait for the next 'style.load'
    }
  };

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

    // initial and subsequent style loads
    map.on("load", addSourcesLayers);
    map.on("style.load", addSourcesLayers); // fires after setStyle

    // cluster zoom
    map.on("click", "clusters", (e: MapLayerMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
      const clusterId = features[0]?.properties?.cluster_id;
      const src = map.getSource("retailers") as GeoJSONSource;
      if (!src || clusterId == null) return;
      src.getClusterExpansionZoom(clusterId, (err, z) => {
        if (err) return;
        const center = (features[0].geometry as any).coordinates as LngLatLike;
        map.easeTo({ center, zoom: z });
      });
    });

    // popups + add stop
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

  // live data updates (when style already has the source)
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const src = map.getSource("retailers") as GeoJSONSource | undefined;
    if (src) src.setData(data as any);
  }, [data]);

  // kingpins updates
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (kingpins) {
      const src = map.getSource("kingpins") as GeoJSONSource | undefined;
      if (src) src.setData(kingpins as any);
    } else {
      if (map.getLayer("kingpins-layer")) map.removeLayer("kingpins-layer");
      if (map.getSource("kingpins")) map.removeSource("kingpins");
    }
  }, [kingpins]);

  // home updates
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (!home) {
      if (map.getLayer("home-layer")) map.removeLayer("home-layer");
      if (map.getSource("home")) map.removeSource("home");
      return;
    }
    if (!map.isStyleLoaded()) return; // will be added on next 'style.load'
    const d = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: home } }] };
    if (map.getSource("home")) (map.getSource("home") as GeoJSONSource).setData(d as any);
    else {
      try {
        map.addSource("home", { type: "geojson", data: d as any });
        map.addLayer({
          id: "home-layer", type: "circle", source: "home",
          paint: { "circle-color":"#22d3ee","circle-radius":7,"circle-stroke-color":"#0f172a","circle-stroke-width":2 },
        } as any);
      } catch { /* defer to next style.load */ }
    }
  }, [home]);

  // style changes (Street / Hybrid)
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const nextUri = `mapbox://styles/mapbox/${styleId}`;
    map.setStyle(nextUri);
    // ensure re-attach happens even if earlier listener is removed during style swap
    map.once("style.load", addSourcesLayers);
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
