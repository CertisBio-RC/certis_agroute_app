"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map, LngLat } from "mapbox-gl";
import type { FeatureCollection, Feature, Geometry, Position } from "geojson";
import { withBasePath } from "@/utils/paths";

// -----------------------------
// Types
// -----------------------------
type FC = FeatureCollection<Geometry, Record<string, any>>;

export type CertisMapProps = {
  /** Filtered retailer features (clustered source) */
  data: FC;
  /** KINGPIN features (always visible, non-clustered) */
  kingpins: FC;
  /** Home (lng,lat) or null */
  home: Position | null;
  /** 'hybrid' = satellite+roads (default), 'street' = streets */
  mapStyle?: "hybrid" | "street";
  /**
   * Back-compat: accepts either the new one-arg shape OR the legacy (props, LngLat) shape.
   * - onPointClick({ name, coord:[lng,lat] })
   * - onPointClick(properties, new mapboxgl.LngLat(lng, lat))
   */
  onPointClick?:
    | ((p: { name: string; coord: [number, number] }) => void)
    | ((properties: any, coord: LngLat) => void);
};

// -----------------------------
// Mapbox configuration
// -----------------------------
const TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  (typeof window !== "undefined"
    ? (localStorage.getItem("MAPBOX_TOKEN") || "")
    : "");

const STYLE_URLS = {
  hybrid: "mapbox://styles/mapbox/satellite-streets-v12",
  street: "mapbox://styles/mapbox/streets-v12",
} as const;

function styleUrlFor(mode: "hybrid" | "street") {
  return STYLE_URLS[mode] ?? STYLE_URLS.hybrid;
}

// Safe position coercer for GeoJSON
function toPosition(x: any): Position | null {
  if (!x) return null;
  if (Array.isArray(x) && x.length >= 2 && typeof x[0] === "number" && typeof x[1] === "number") {
    return [x[0], x[1]];
  }
  if (typeof x === "object" && "lng" in x && "lat" in x) {
    const lng = Number((x as any).lng);
    const lat = Number((x as any).lat);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat] as Position;
  }
  return null;
}

const CLUSTER_SRC = "retailers";
const KINGPIN_SRC = "kingpins";
const HOME_SRC = "home";

// Layer ids
const L = {
  cluster: "cluster-circles",
  clusterCount: "cluster-count",
  unclustered: "unclustered-point",
  kingpinCore: "kingpin-core",
  kingpinRing: "kingpin-ring",
  home: "home-point",
};

// -----------------------------
// Component
// -----------------------------
export default function CertisMap({
  data,
  kingpins,
  home,
  mapStyle = "hybrid",
  onPointClick,
}: CertisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const currentStyleUrl = useMemo(() => styleUrlFor(mapStyle), [mapStyle]);

  // Create map once
  useEffect(() => {
    if (!containerRef.current) return;
    if (!TOKEN) {
      // eslint-disable-next-line no-console
      console.warn("Missing NEXT_PUBLIC_MAPBOX_TOKEN");
    }
    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: currentStyleUrl,
      center: [-96.7, 40.0],
      zoom: 3.5,
      attributionControl: true,
      hash: false,
      // ✅ Hard-lock Mercator on first load
      projection: { name: "mercator" as any },
      cooperativeGestures: false,
      pitchWithRotate: false,
      dragRotate: false,
    });

    mapRef.current = map;

    // Single popup reused for hover
    popupRef.current = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: "340px",
      className: "certis-popup",
    });

    // CERTIS badge overlay (in-map)
    const badge = document.createElement("div");
    badge.style.position = "absolute";
    badge.style.top = "10px";
    badge.style.left = "10px";
    badge.style.zIndex = "2";
    badge.style.pointerEvents = "none";
    badge.innerHTML = `<img alt="CERTIS" src="${withBasePath(
      "/certis-logo.png"
    )}" style="height:24px; opacity:.95; filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))" />`;
    (containerRef.current!.parentElement || containerRef.current!).appendChild(badge);

    const enforceMercator = () => {
      try {
        map.setProjection({ name: "mercator" as any });
      } catch {
        /* no-op */
      }
    };

    const installSourcesAndLayers = () => {
      enforceMercator();

      // --- clustered retailers
      if (!map.getSource(CLUSTER_SRC)) {
        map.addSource(CLUSTER_SRC, {
          type: "geojson",
          data,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 45,
        });
      } else {
        (map.getSource(CLUSTER_SRC) as mapboxgl.GeoJSONSource).setData(data);
      }

      if (!map.getLayer(L.cluster)) {
        map.addLayer({
          id: L.cluster,
          type: "circle",
          source: CLUSTER_SRC,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#26dac3",
            "circle-opacity": 0.88,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16,
              10,
              20,
              25,
              26,
              34,
              51,
              42,
              101,
              50,
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#0c7a6c",
            "circle-stroke-opacity": 0.9,
          },
        });
      }

      if (!map.getLayer(L.clusterCount)) {
        map.addLayer({
          id: L.clusterCount,
          type: "symbol",
          source: CLUSTER_SRC,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          },
          paint: { "text-color": "#0b1e24" },
        });
      }

      if (!map.getLayer(L.unclustered)) {
        map.addLayer({
          id: L.unclustered,
          type: "circle",
          source: CLUSTER_SRC,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#2cd4ff",
            "circle-radius": 5,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#003c61",
          },
        });
      }

      // --- KINGPINs (non-clustered, above clusters)
      if (!map.getSource(KINGPIN_SRC)) {
        map.addSource(KINGPIN_SRC, {
          type: "geojson",
          data: kingpins,
        });
      } else {
        (map.getSource(KINGPIN_SRC) as mapboxgl.GeoJSONSource).setData(kingpins);
      }

      if (!map.getLayer(L.kingpinCore)) {
        map.addLayer(
          {
            id: L.kingpinCore,
            type: "circle",
            source: KINGPIN_SRC,
            paint: {
              "circle-color": "#e02020",
              "circle-opacity": 1,
              "circle-radius": 5.5,
            },
          },
          L.cluster
        );
      }
      if (!map.getLayer(L.kingpinRing)) {
        map.addLayer(
          {
            id: L.kingpinRing,
            type: "circle",
            source: KINGPIN_SRC,
            paint: {
              "circle-color": "transparent",
              "circle-stroke-color": "#ffd600",
              "circle-stroke-width": 2,
              "circle-radius": 7.5,
            },
          },
          L.kingpinCore
        );
      }

      // --- Home
      const homePos = toPosition(home);
      if (!map.getSource(HOME_SRC)) {
        map.addSource(HOME_SRC, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: homePos
              ? [
                  {
                    type: "Feature",
                    properties: {},
                    geometry: { type: "Point", coordinates: homePos },
                  },
                ]
              : [],
          },
        });
      } else {
        (map.getSource(HOME_SRC) as mapboxgl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: homePos
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: homePos },
                },
              ]
            : [],
        });
      }

      if (!map.getLayer(L.home)) {
        map.addLayer({
          id: L.home,
          type: "circle",
          source: HOME_SRC,
          paint: {
            "circle-color": "#ff9f1a",
            "circle-radius": 6,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#2b1700",
          },
        });
      }

      // --- Interactivity wiring
      const hoverables = [L.unclustered, L.kingpinCore, L.kingpinRing, L.cluster];
      hoverables.forEach((lid) => {
        if (!map.getLayer(lid)) return;
        map.on("mouseenter", lid, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", lid, () => (map.getCanvas().style.cursor = ""));
      });

      // hover popup for unclustered + kingpins
      const showPopup = (e: any) => {
        const f: Feature<Geometry, any> | undefined = e?.features?.[0];
        if (!f || !f.geometry || (f.geometry as any).type !== "Point") return;

        const coord = (f.geometry as any).coordinates as Position;
        const props = f.properties || {};
        const retailer =
          props.retailer ?? props.Retailer ?? props.name ?? props.Name ?? "Location";
        const city = props.city ?? props.City ?? "";
        const state = props.state ?? props.State ?? "";
        const category = props.category ?? props.Category ?? "";
        const suppliers = props.suppliers ?? props.Suppliers ?? "";

        // popup logo (best-effort)
        const slug = String(retailer)
          .toLowerCase()
          .replace(/&/g, "and")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        const iconUrl = withBasePath(`/icons/${slug}.png`);

        const html = `
          <div style="display:flex;align-items:center;gap:8px">
            <img src="${iconUrl}" onerror="this.style.display='none'" alt="" style="height:22px;max-width:80px" />
            <div style="font-weight:700">${retailer}</div>
          </div>
          <div style="opacity:.85">${city}${city && state ? ", " : ""}${state}</div>
          ${category ? `<div style="margin-top:4px;opacity:.75">${category}</div>` : ""}
          ${
            suppliers
              ? `<div style="margin-top:4px;font-size:12px;opacity:.7">Suppliers: ${suppliers}</div>`
              : ""
          }
        `;

        popupRef.current!
          .setLngLat(coord as any)
          .setHTML(html)
          .addTo(map);
      };

      map.on("mousemove", L.unclustered, showPopup);
      map.on("mousemove", L.kingpinCore, showPopup);
      map.on("mousemove", L.kingpinRing, showPopup);
      map.on("mouseleave", L.unclustered, () => popupRef.current?.remove());
      map.on("mouseleave", L.kingpinCore, () => popupRef.current?.remove());
      map.on("mouseleave", L.kingpinRing, () => popupRef.current?.remove());

      // click to add stop — **back-compat call**
      const invokeOnPointClick = (properties: any, coord: Position) => {
        if (!onPointClick) return;
        const arity = (onPointClick as any).length;
        if (arity >= 2) {
          // legacy: (props, LngLat)
          (onPointClick as (p: any, ll: LngLat) => void)(properties, new mapboxgl.LngLat(coord[0], coord[1]));
        } else {
          // new shape: ({ name, coord })
          const retailer =
            properties?.retailer ??
            properties?.Retailer ??
            properties?.name ??
            properties?.Name ??
            "Location";
          (onPointClick as (p: { name: string; coord: [number, number] }) => void)({
            name: String(retailer),
            coord: [coord[0], coord[1]],
          });
        }
      };

      const clickToAdd = (e: any) => {
        const f: Feature<Geometry, any> | undefined = e?.features?.[0];
        if (!f || !f.geometry || (f.geometry as any).type !== "Point") return;
        const coord = (f.geometry as any).coordinates as Position;
        const props = f.properties || {};
        invokeOnPointClick(props, coord);
      };
      map.on("click", L.unclustered, clickToAdd);
      map.on("click", L.kingpinCore, clickToAdd);
      map.on("click", L.kingpinRing, clickToAdd);

      // zoom into clusters on click
      map.on("click", L.cluster, (e: any) => {
        const feat = e?.features?.[0];
        if (!feat) return;
        const clusterId = feat.properties?.cluster_id;
        const source = map.getSource(CLUSTER_SRC) as mapboxgl.Cluster;
        if (!source || clusterId == null) return;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          const coord = (feat.geometry as any).coordinates as Position;
          map.easeTo({ center: coord as any, zoom });
        });
      });
    };

    // Initial style load
    map.once("style.load", () => {
      installSourcesAndLayers();
      map.resize();
    });

    // keep map sized
    const onResize = () => map.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // create map once

  // React to data / kingpins / home updates
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded()) return;
    if (m.getSource(CLUSTER_SRC)) {
      (m.getSource(CLUSTER_SRC) as mapboxgl.GeoJSONSource).setData(data);
    }
    if (m.getSource(KINGPIN_SRC)) {
      (m.getSource(KINGPIN_SRC) as mapboxgl.GeoJSONSource).setData(kingpins);
    }
    if (m.getSource(HOME_SRC)) {
      const homePos = toPosition(home);
      (m.getSource(HOME_SRC) as mapboxgl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: homePos
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: homePos },
              },
            ]
          : [],
      });
    }
  }, [data, kingpins, home]);

  // React to style changes (Hybrid / Street), re-attach layers, and re-enforce Mercator
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const next = styleUrlFor(mapStyle);
    m.setStyle(next, { diff: false });
    m.once("style.load", () => {
      // Force Mercator again
      try {
        m.setProjection({ name: "mercator" as any });
      } catch {}

      // Recreate sources/layers with latest props
      if (!m.getSource(CLUSTER_SRC)) {
        m.addSource(CLUSTER_SRC, {
          type: "geojson",
          data,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 45,
        });
      } else {
        (m.getSource(CLUSTER_SRC) as mapboxgl.GeoJSONSource).setData(data);
      }

      if (!m.getLayer(L.cluster)) {
        m.addLayer({
          id: L.cluster,
          type: "circle",
          source: CLUSTER_SRC,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#26dac3",
            "circle-opacity": 0.88,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16,
              10,
              20,
              25,
              26,
              34,
              51,
              42,
              101,
              50,
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#0c7a6c",
            "circle-stroke-opacity": 0.9,
          },
        });
      }

      if (!m.getLayer(L.clusterCount)) {
        m.addLayer({
          id: L.clusterCount,
          type: "symbol",
          source: CLUSTER_SRC,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          },
          paint: { "text-color": "#0b1e24" },
        });
      }

      if (!m.getLayer(L.unclustered)) {
        m.addLayer({
          id: L.unclustered,
          type: "circle",
          source: CLUSTER_SRC,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#2cd4ff",
            "circle-radius": 5,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#003c61",
          },
        });
      }

      if (!m.getSource(KINGPIN_SRC)) {
        m.addSource(KINGPIN_SRC, { type: "geojson", data: kingpins });
      } else {
        (m.getSource(KINGPIN_SRC) as mapboxgl.GeoJSONSource).setData(kingpins);
      }
      if (!m.getLayer(L.kingpinCore)) {
        m.addLayer(
          {
            id: L.kingpinCore,
            type: "circle",
            source: KINGPIN_SRC,
            paint: {
              "circle-color": "#e02020",
              "circle-opacity": 1,
              "circle-radius": 5.5,
            },
          },
          L.cluster
        );
      }
      if (!m.getLayer(L.kingpinRing)) {
        m.addLayer(
          {
            id: L.kingpinRing,
            type: "circle",
            source: KINGPIN_SRC,
            paint: {
              "circle-color": "transparent",
              "circle-stroke-color": "#ffd600",
              "circle-stroke-width": 2,
              "circle-radius": 7.5,
            },
          },
          L.kingpinCore
        );
      }

      const homePos = toPosition(home);
      if (!m.getSource(HOME_SRC)) {
        m.addSource(HOME_SRC, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: homePos
              ? [
                  {
                    type: "Feature",
                    properties: {},
                    geometry: { type: "Point", coordinates: homePos },
                  },
                ]
              : [],
          },
        });
      } else {
        (m.getSource(HOME_SRC) as mapboxgl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: homePos
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: homePos },
                },
              ]
            : [],
        });
      }
      if (!m.getLayer(L.home)) {
        m.addLayer({
          id: L.home,
          type: "circle",
          source: HOME_SRC,
          paint: {
            "circle-color": "#ff9f1a",
            "circle-radius": 6,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#2b1700",
          },
        });
      }

      // cursors
      const hoverables = [L.unclustered, L.kingpinCore, L.kingpinRing, L.cluster];
      hoverables.forEach((lid) => {
        if (!m.getLayer(lid)) return;
        m.on("mouseenter", lid, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", lid, () => (m.getCanvas().style.cursor = ""));
      });

      // rewire hover popup
      const showPopup = (e: any) => {
        const f: Feature<Geometry, any> | undefined = e?.features?.[0];
        if (!f || (f.geometry as any).type !== "Point") return;
        const coord = (f.geometry as any).coordinates as Position;
        const props = f.properties || {};
        const retailer =
          props.retailer ?? props.Retailer ?? props.name ?? props.Name ?? "Location";
        const city = props.city ?? props.City ?? "";
        const state = props.state ?? props.State ?? "";
        const category = props.category ?? props.Category ?? "";
        const suppliers = props.suppliers ?? props.Suppliers ?? "";
        const slug = String(retailer)
          .toLowerCase()
          .replace(/&/g, "and")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        const iconUrl = withBasePath(`/icons/${slug}.png`);
        const html = `
          <div style="display:flex;align-items:center;gap:8px">
            <img src="${iconUrl}" onerror="this.style.display='none'" alt="" style="height:22px;max-width:80px" />
            <div style="font-weight:700">${retailer}</div>
          </div>
          <div style="opacity:.85">${city}${city && state ? ", " : ""}${state}</div>
          ${category ? `<div style="margin-top:4px;opacity:.75">${category}</div>` : ""}
          ${
            suppliers
              ? `<div style="margin-top:4px;font-size:12px;opacity:.7">Suppliers: ${suppliers}</div>`
              : ""
          }
        `;
        popupRef.current!.setLngLat(coord as any).setHTML(html).addTo(m);
      };
      m.on("mousemove", L.unclustered, showPopup);
      m.on("mousemove", L.kingpinCore, showPopup);
      m.on("mousemove", L.kingpinRing, showPopup);
      m.on("mouseleave", L.unclustered, () => popupRef.current?.remove());
      m.on("mouseleave", L.kingpinCore, () => popupRef.current?.remove());
      m.on("mouseleave", L.kingpinRing, () => popupRef.current?.remove());

      // click to add stop — **back-compat call**
      const invokeOnPointClick = (properties: any, coord: Position) => {
        if (!onPointClick) return;
        const arity = (onPointClick as any).length;
        if (arity >= 2) {
          (onPointClick as (p: any, ll: LngLat) => void)(properties, new mapboxgl.LngLat(coord[0], coord[1]));
        } else {
          const retailer =
            properties?.retailer ??
            properties?.Retailer ??
            properties?.name ??
            properties?.Name ??
            "Location";
          (onPointClick as (p: { name: string; coord: [number, number] }) => void)({
            name: String(retailer),
            coord: [coord[0], coord[1]],
          });
        }
      };

      const clickToAdd = (e: any) => {
        const f: Feature<Geometry, any> | undefined = e?.features?.[0];
        if (!f || (f.geometry as any).type !== "Point") return;
        const coord = (f.geometry as any).coordinates as Position;
        const props = f.properties || {};
        invokeOnPointClick(props, coord);
      };
      m.on("click", L.unclustered, clickToAdd);
      m.on("click", L.kingpinCore, clickToAdd);
      m.on("click", L.kingpinRing, clickToAdd);

      // expand clusters on click
      m.on("click", L.cluster, (e: any) => {
        const feat = e?.features?.[0];
        if (!feat) return;
        const clusterId = feat.properties?.cluster_id;
        const source = m.getSource(CLUSTER_SRC) as mapboxgl.Cluster;
        if (!source || clusterId == null) return;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          const coord = (feat.geometry as any).coordinates as Position;
          m.easeTo({ center: coord as any, zoom });
        });
      });

      m.resize();
    });
  }, [mapStyle, data, kingpins, home, onPointClick]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "600px",
        position: "relative",
        borderRadius: 8,
        overflow: "hidden",
      }}
    />
  );
}
