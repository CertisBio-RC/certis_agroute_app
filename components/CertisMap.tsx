// components/CertisMap.tsx
"use client";

import React, { useEffect, useRef } from "react";
import mapboxgl, {
  Map as MapboxMap,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  LngLatLike,
  GeoJSONSource,
} from "mapbox-gl";
import { withBasePath } from "@/utils/paths";

// Token via NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN or window.MAPBOX_TOKEN
const MAPBOX_TOKEN =
  (typeof window !== "undefined" ? (window as any).MAPBOX_TOKEN : undefined) ||
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
  "";

// ---- Minimal GeoJSON typings
type Position = [number, number];
interface FeatureProperties {
  Retailer?: string;
  City?: string;
  State?: string;
  Type?: string;
  KINGPIN?: boolean;
  [key: string]: any;
}
interface Feature {
  type: "Feature";
  id?: string | number;
  properties: FeatureProperties;
  geometry: { type: "Point"; coordinates: Position };
}
interface FeatureCollection {
  type: "FeatureCollection";
  features: Feature[];
}

// ---- Props
export interface CertisMapProps {
  /** Main dataset (clustered) */
  data: FeatureCollection;
  /** Separate KINGPIN dataset (not clustered). Optional. */
  kingpins?: FeatureCollection | null;
  /** Optional 'home' pin [lng,lat] */
  home?: Position | null;
  /** Called when a user clicks an individual point (either main or KINGPIN) */
  onPointClick?: (feature: Feature) => void;
}

const DEFAULT_CENTER: LngLatLike = [-93.5, 41.9]; // Midwest-ish
const DEFAULT_ZOOM = 4.3;

export default function CertisMap({
  data,
  kingpins = null,
  home = null,
  onPointClick,
}: CertisMapProps) {
  const mapRef = useRef<MapboxMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: true,
      cooperativeGestures: false,        // no overlay banner
      projection: { name: "mercator" },  // force mercator
    });
    mapRef.current = map;

    const onLoad = () => {
      // Re-assert mercator in case style flips to globe
      try { map.setProjection({ name: "mercator" } as any); } catch {}

      // MAIN clustered source
      if (!map.getSource("retailers")) {
        map.addSource("retailers", {
          type: "geojson",
          data: data as any,
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 40,
        });
      }

      // Cluster circles
      if (!map.getLayer("clusters")) {
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "retailers",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#5eead4",
              25,
              "#34d399",
              100,
              "#10b981",
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16,
              25,
              22,
              100,
              28,
            ],
            "circle-stroke-color": "#0f172a",
            "circle-stroke-width": 1.5,
          },
        } as any);
      }

      // Cluster labels
      if (!map.getLayer("cluster-count")) {
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "retailers",
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
          paint: { "text-color": "#0b1220" },
        } as any);
      }

      // Unclustered points
      if (!map.getLayer("unclustered-point")) {
        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "retailers",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#60a5fa",
            "circle-radius": 6,
            "circle-stroke-color": "#0f172a",
            "circle-stroke-width": 1.5,
          },
        } as any);
      }

      // KINGPIN separate (non-clustered)
      if (kingpins && !map.getSource("kingpins")) {
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

      // HOME pin
      if (home && !map.getSource("home")) {
        map.addSource("home", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: home } },
            ],
          },
        });
        map.addLayer({
          id: "home-layer",
          type: "circle",
          source: "home",
          paint: {
            "circle-color": "#22d3ee",
            "circle-radius": 7,
            "circle-stroke-color": "#0f172a",
            "circle-stroke-width": 2,
          },
        } as any);
      }

      // Cluster click to expand
      map.on("click", "clusters", async (e: MapLayerMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const clusterId = features[0]?.properties?.cluster_id;
        const src = map.getSource("retailers") as GeoJSONSource;
        if (!src || clusterId == null) return;
        src.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: (features[0].geometry as any).coordinates as LngLatLike, zoom });
        });
      });

      // Cursor affordances
      ["clusters", "unclustered-point", "kingpins-layer"].forEach((id) => {
        if (!map.getLayer(id)) return;
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
      });

      // Popups & click-to-add
      const showPopup = (e: MapLayerMouseEvent | MapLayerTouchEvent, label: string) => {
        if (!e.features?.length) return;
        const f = e.features[0] as any;
        const p = (f.properties || {}) as FeatureProperties;
        the_popup(p, (f.geometry?.coordinates ?? []) as Position, label);
      };

      const the_popup = (p: FeatureProperties, coords: Position, label: string) => {
        const html = `
          <div style="font: 12px/1.4 system-ui, sans-serif;">
            <div style="font-weight:600;margin-bottom:2px;">${p.Retailer ?? "Retailer"}</div>
            <div style="opacity:.8;">${[p.City, p.State].filter(Boolean).join(", ")}</div>
            <div style="margin-top:4px;font-size:11px;opacity:.8;">${label}</div>
          </div>
        `;
        if (!popupRef.current) {
          popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
        }
        popupRef.current.setLngLat(coords as any).setHTML(html).addTo(map);

        if (onPointClick) {
          onPointClick({
            type: "Feature",
            properties: p,
            geometry: { type: "Point", coordinates: coords },
          });
        }
      };

      map.on("click", "unclustered-point", (e: MapLayerMouseEvent) => showPopup(e, "Location"));
      if (map.getLayer("kingpins-layer")) {
        map.on("click", "kingpins-layer", (e: MapLayerMouseEvent) => showPopup(e, "KINGPIN"));
      }
    };

    map.on("load", onLoad);
    // Re-assert mercator if style ever changes dynamically
    map.on("styledata", () => {
      try { map.setProjection({ name: "mercator" } as any); } catch {}
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [data, kingpins, home, onPointClick]);

  // Update sources when props change (after map ready)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.isStyleLoaded() && map.getSource("retailers")) {
      (map.getSource("retailers") as GeoJSONSource).setData(data as any);
    }

    if (kingpins) {
      if (map.getSource("kingpins")) {
        (map.getSource("kingpins") as GeoJSONSource).setData(kingpins as any);
      } else if (map.isStyleLoaded()) {
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
    }

    // Update / create home source
    if (home) {
      const homeData = {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: home } }],
      };
      if (map.getSource("home")) {
        (map.getSource("home") as GeoJSONSource).setData(homeData as any);
      } else if (map.isStyleLoaded()) {
        map.addSource("home", { type: "geojson", data: homeData as any });
        map.addLayer({
          id: "home-layer",
          type: "circle",
          source: "home",
          paint: {
            "circle-color": "#22d3ee",
            "circle-radius": 7,
            "circle-stroke-color": "#0f172a",
            "circle-stroke-width": 2,
          },
        } as any);
      }
    } else {
      if (map.getLayer("home-layer")) map.removeLayer("home-layer");
      if (map.getSource("home")) map.removeSource("home");
    }
  }, [data, kingpins, home]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* Brand inside the frame */}
      <div className="pointer-events-none absolute left-3 top-3 z-10">
        <img
          src={withBasePath("logo-certis.png")}
          alt="Certis"
          className="h-8 opacity-90"
          loading="eager"
        />
      </div>
    </div>
  );
}
