"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, {
  Map,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
} from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection, GeoJsonProperties } from "geojson";
import { withBasePath } from "@/utils/paths";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Accept anything, return strict GeoJSON Position or null
type Position = [number, number];
const toPosition = (v: any): Position | null => {
  // mapboxgl.LngLat instance
  if (v && typeof v === "object" && typeof v.lng === "number" && typeof v.lat === "number") {
    return [v.lng, v.lat];
  }
  // [lng, lat] array-like
  if (Array.isArray(v) && v.length >= 2 && isFinite(v[0]) && isFinite(v[1])) {
    return [Number(v[0]), Number(v[1])];
  }
  return null;
};

export type CertisMapProps = {
  data: FeatureCollection;
  kingpins: FeatureCollection;
  home: any; // can be LngLatLike; we coerce to Position
  onPointClick: (props: GeoJsonProperties, coord: Position) => void;
  mapStyle: "hybrid" | "street";
};

/** Helpers to format popup with retailer logo from /public/icons */
const slugify = (s: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const LOGO_OVERRIDES: Record<string, string> = {
  // add mismatches here if needed
};

function logoImgHtml(retailer: string) {
  if (!retailer) return "";
  const baseName = LOGO_OVERRIDES[retailer] ?? slugify(retailer);
  const src = withBasePath(`/icons/${baseName}.png`);
  return `<img class="retailer-logo" src="${src}" alt="" onerror="this.style.display='none'"/>`;
}

function popupHtml(props: Record<string, any>) {
  const retailer: string = props.retailer ?? props.Retailer ?? "";
  const city: string = props.city ?? props.City ?? "";
  const state: string = props.state ?? props.State ?? "";
  const type: string = props.type ?? props.Type ?? "";
  const address: string = props.address ?? props.Address ?? "";
  const supplier: string =
    props.Supplier ?? props.Suppliers ?? props["Supplier(s)"] ?? "";

  const logo = logoImgHtml(retailer);

  return `
    <div class="popup">
      <div class="popup-row">
        ${logo}
        <div class="popup-title">${retailer || "Location"}</div>
      </div>
      <div class="popup-sub">${[city, state].filter(Boolean).join(", ")}</div>
      ${type ? `<div class="popup-tag">${type}</div>` : ""}
      ${supplier ? `<div class="popup-supplier">Suppliers: ${supplier}</div>` : ""}
      ${address ? `<div class="popup-addr">${address}</div>` : ""}
    </div>
  `;
}

const clusterLayerId = "retailers-clusters";
const clusterCountId = "retailers-cluster-count";
const unclusterLayerId = "retailers-unclustered";
const kingpinLayerId = "kingpins-points";
const kingpinHaloLayerId = "kingpins-halo";
const homeLayerId = "home-point";

export default function CertisMap({
  data,
  kingpins,
  home,
  onPointClick,
  mapStyle,
}: CertisMapProps) {
  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const brandRef = useRef<HTMLDivElement | null>(null);

  const styleUri = useMemo(
    () =>
      mapStyle === "hybrid"
        ? "mapbox://styles/mapbox/satellite-streets-v12"
        : "mapbox://styles/mapbox/streets-v12",
    [mapStyle]
  );

  // Create map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const m = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUri,
      center: [-93.5, 41.6],
      zoom: 5,
      dragRotate: false,
      pitchWithRotate: false,
    });

    const resize = () => m.resize();
    m.on("load", resize);
    window.addEventListener("resize", resize);

    // Brand badge (in-map)
    const brand = document.createElement("div");
    brand.style.position = "absolute";
    brand.style.left = "8px";
    brand.style.top = "8px";
    brand.style.zIndex = "5";
    brand.style.background = "rgba(0,0,0,.35)";
    brand.style.borderRadius = "8px";
    brand.style.padding = "6px 8px";
    brand.style.pointerEvents = "none";
    brand.innerHTML = `
      <img src="${withBasePath("/certis-logo.png")}"
           alt=""
           style="height:18px;width:auto;opacity:.95;filter:drop-shadow(0 0 2px rgba(0,0,0,.6));" />
    `;
    m.getContainer().appendChild(brand);
    brandRef.current = brand;

    mapRef.current = m;

    return () => {
      window.removeEventListener("resize", resize);
      popupRef.current?.remove();
      brandRef.current?.remove();
      m.remove();
      mapRef.current = null;
    };
  }, []); // once

  // Toggle style
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.setStyle(styleUri);
  }, [styleUri]);

  // Attach sources/layers after each style load
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const onStyleLoad = () => {
      try {
        // MAIN source (clustered)
        if (!m.getSource("retailers")) {
          m.addSource("retailers", {
            type: "geojson",
            data,
            cluster: true,
            clusterRadius: 50,
            clusterMaxZoom: 14,
            generateId: true,
          });
        } else {
          (m.getSource("retailers") as mapboxgl.GeoJSONSource).setData(data);
        }

        // KINGPINS source (non-clustered)
        if (!m.getSource("kingpins")) {
          m.addSource("kingpins", {
            type: "geojson",
            data: kingpins,
            generateId: true,
          });
        } else {
          (m.getSource("kingpins") as mapboxgl.GeoJSONSource).setData(kingpins);
        }

        // HOME source
        if (!m.getSource("home")) {
          m.addSource("home", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
            generateId: true,
          });
        }
        const homePos = toPosition(home);
        (m.getSource("home") as mapboxgl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: homePos
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: homePos }, // ✅ strict Position
                },
              ]
            : [],
        });

        // Remove old layers before re-adding
        [
          clusterLayerId,
          clusterCountId,
          unclusterLayerId,
          kingpinHaloLayerId,
          kingpinLayerId,
          homeLayerId,
        ].forEach((id) => {
          if (m.getLayer(id)) m.removeLayer(id);
        });

        // Clusters
        m.addLayer({
          id: clusterLayerId,
          type: "circle",
          source: "retailers",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#45dbc8",
            "circle-radius": [
              "step",
              ["get", "point_count"],
              15,
              10,
              18,
              50,
              22,
              100,
              26,
            ],
            "circle-opacity": 0.95,
          },
        });

        // Cluster counts
        m.addLayer({
          id: clusterCountId,
          type: "symbol",
          source: "retailers",
          filter: ["has", "point_count"],
          layout: { "text-field": ["to-string", ["get", "point_count"]], "text-size": 12 },
          paint: { "text-color": "#0b1620" },
        });

        // Unclustered points
        m.addLayer({
          id: unclusterLayerId,
          type: "circle",
          source: "retailers",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#3ed6c1",
            "circle-radius": 5,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#0b1620",
          },
        });

        // KINGPIN halo
        m.addLayer({
          id: kingpinHaloLayerId,
          type: "circle",
          source: "kingpins",
          paint: {
            "circle-radius": 10,
            "circle-color": "#eab308",
            "circle-opacity": 0.8,
          },
        });

        // KINGPIN point (red fill + yellow ring)
        m.addLayer({
          id: kingpinLayerId,
          type: "circle",
          source: "kingpins",
          paint: {
            "circle-color": "#ef4444",
            "circle-radius": 5,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#eab308",
          },
        });

        // HOME pin
        m.addLayer({
          id: homeLayerId,
          type: "circle",
          source: "home",
          paint: {
            "circle-color": "#60a5fa",
            "circle-radius": 5,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#0b1620",
          },
        });

        // Hover popups (unclustered + kingpin)
        const popup =
          popupRef.current ??
          new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
        popupRef.current = popup;

        const showHover = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
          const f = e.features && e.features[0];
          if (!f) return;
          const p = (f.properties || {}) as Record<string, any>;
          const coord = (f.geometry as any)?.coordinates as Position | undefined;
          if (!coord) return;
          const html = popupHtml(p);
          mapRef.current?.getCanvas().style.setProperty("cursor", "pointer");
          popup.setLngLat(coord).setHTML(html).addTo(mapRef.current!);
        };

        const hideHover = () => {
          mapRef.current?.getCanvas().style.setProperty("cursor", "default");
          popup.remove();
        };

        m.on("mousemove", unclusterLayerId, showHover);
        m.on("mouseleave", unclusterLayerId, hideHover);
        m.on("mousemove", kingpinLayerId, showHover);
        m.on("mouseleave", kingpinLayerId, hideHover);

        // Click adds stop
        const clickAdd = (e: MapLayerMouseEvent) => {
          const f = e.features && e.features[0];
          if (!f) return;
          const p = (f.properties || {}) as Record<string, any>;
          const coord = (f.geometry as any)?.coordinates as Position | undefined;
          if (!coord) return;
          onPointClick(p, coord);
        };
        m.on("click", unclusterLayerId, clickAdd);
        m.on("click", kingpinLayerId, clickAdd);

        // Zoom into clusters
        m.on("click", clusterLayerId, (e) => {
          const features = m.queryRenderedFeatures(e.point, { layers: [clusterLayerId] });
          const clusterId = features[0]?.properties?.cluster_id as number;
          const source = m.getSource("retailers") as mapboxgl.GeoJSONSource;
          source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            m.easeTo({ center: (features[0].geometry as any).coordinates, zoom });
          });
        });
      } catch (err) {
        console.warn("Style/load wiring failed", err);
      }
    };

    m.once("style.load", onStyleLoad);
    m.on("style.load", onStyleLoad);
    return () => {
      m.off("style.load", onStyleLoad);
    };
  }, [data, kingpins, home, onPointClick]);

  // Live updates (no restyle required)
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const s = m.getSource("retailers") as mapboxgl.GeoJSONSource | undefined;
    if (s) s.setData(data);

    const k = m.getSource("kingpins") as mapboxgl.GeoJSONSource | undefined;
    if (k) k.setData(kingpins);

    const h = m.getSource("home") as mapboxgl.GeoJSONSource | undefined;
    if (h) {
      const homePos = toPosition(home);
      h.setData({
        type: "FeatureCollection",
        features: homePos
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: homePos }, // ✅ strict Position
              },
            ]
          : [],
      });
    }
  }, [data, kingpins, home]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0 }}
    />
  );
}
