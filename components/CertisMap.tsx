"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, {
  Map,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  LngLatLike,
} from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection, Feature, GeoJsonProperties } from "geojson";
import { withBasePath } from "@/utils/paths";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

type LngLat = [number, number];

export type CertisMapProps = {
  data: FeatureCollection;
  kingpins: FeatureCollection;
  home: LngLat | null;
  onPointClick: (props: GeoJsonProperties, coord: LngLat) => void;
  mapStyle: "hybrid" | "street";
};

/** Helpers to format popup with retailer logo from /public/icons */
const slugify = (s: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// For rare retailer name → filename mismatches, list here:
// "Dataset Retailer Name": "actual-file-name-without-extension"
const LOGO_OVERRIDES: Record<string, string> = {
  // "CHS West Central": "chs-west-central",
};

function logoImgHtml(retailer: string) {
  if (!retailer) return "";
  const baseName = LOGO_OVERRIDES[retailer] ?? slugify(retailer);
  const src = withBasePath(`/icons/${baseName}.png`);
  // hide <img> if file missing to avoid broken-icon
  return `<img class="retailer-logo" src="${src}" alt="" onerror="this.style.display='none'"/>`;
}

function popupHtml(props: Record<string, any>) {
  const retailer: string = props.retailer ?? props.Retailer ?? "";
  const city: string = props.city ?? props.City ?? "";
  const state: string = props.state ?? props.State ?? "";
  const type: string = props.type ?? props.Type ?? "";
  const address: string = props.address ?? props.Address ?? "";
  const supplier: string = props.Supplier ?? props.Suppliers ?? props["Supplier(s)"] ?? "";

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

  const styleUri = useMemo(() => {
    return mapStyle === "hybrid"
      ? "mapbox://styles/mapbox/satellite-streets-v12"
      : "mapbox://styles/mapbox/streets-v12";
  }, [mapStyle]);

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

    // full size + resize guards
    const resize = () => m.resize();
    m.on("load", resize);
    window.addEventListener("resize", resize);

    // Cursor feedback
    m.getCanvas().style.cursor = "default";

    // Brand badge (using certis-logo.png)
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
  }, []); // run once

  // Re-apply style if toggled
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    // Changing style triggers style.load later
    m.setStyle(styleUri);
  }, [styleUri]);

  // When style finishes loading, (re-)add sources & layers
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
            data: {
              type: "FeatureCollection",
              features: [],
            },
            generateId: true,
          });
        }
        (m.getSource("home") as mapboxgl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: home
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: home as LngLatLike },
                },
              ]
            : [],
        });

        // LAYERS — remove if they already exist (style changed)
        [clusterLayerId, clusterCountId, unclusterLayerId, kingpinHaloLayerId, kingpinLayerId, homeLayerId].forEach(
          (id) => {
            if (m.getLayer(id)) m.removeLayer(id);
          }
        );

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
            "circle-stroke-width": 0,
          },
        });

        // Cluster counts
        m.addLayer({
          id: clusterCountId,
          type: "symbol",
          source: "retailers",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["to-string", ["get", "point_count"]],
            "text-size": 12,
          },
          paint: {
            "text-color": "#0b1620",
          },
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

        // KINGPIN halo (under ring)
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

        // KINGPIN inner point (red) with yellow ring (stroke)
        m.addLayer({
          id: kingpinLayerId,
          type: "circle",
          source: "kingpins",
          paint: {
            "circle-color": "#ef4444", // red fill
            "circle-radius": 5,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#eab308", // yellow ring
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

        // Hover popups for unclustered + kingpins
        const popup =
          popupRef.current ??
          new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
        popupRef.current = popup;

        const showHover = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
          const f = e.features && e.features[0];
          if (!f) return;
          const p = (f.properties || {}) as Record<string, any>;
          const coord = (f.geometry as any)?.coordinates as [number, number];
          if (!coord) return;

          const html = popupHtml(p);
          // change cursor
          mapRef.current?.getCanvas().style.setProperty("cursor", "pointer");
          popup.setLngLat(coord).setHTML(html).addTo(mapRef.current!);
        };

        const hideHover = () => {
          mapRef.current?.getCanvas().style.setProperty("cursor", "default");
          popup.remove();
        };

        // Unclustered hover
        m.on("mousemove", unclusterLayerId, showHover);
        m.on("mouseleave", unclusterLayerId, hideHover);
        // Kingpin hover
        m.on("mousemove", kingpinLayerId, showHover);
        m.on("mouseleave", kingpinLayerId, hideHover);

        // Click to add stop
        const clickAdd = (e: MapLayerMouseEvent) => {
          const f = e.features && e.features[0];
          if (!f) return;
          const p = (f.properties || {}) as Record<string, any>;
          const coord = (f.geometry as any)?.coordinates as [number, number];
          if (!coord) return;
          onPointClick(p, coord);
        };
        m.on("click", unclusterLayerId, clickAdd);
        m.on("click", kingpinLayerId, clickAdd);

        // Cluster click to zoom
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

    // Ensure re-attach each style load
    m.once("style.load", onStyleLoad);
    m.on("style.load", onStyleLoad);

    return () => {
      m.off("style.load", onStyleLoad);
    };
  }, [data, kingpins, home, onPointClick]);

  // Live data updates without full re-style
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const s = m.getSource("retailers") as mapboxgl.GeoJSONSource | undefined;
    if (s) s.setData(data);
    const k = m.getSource("kingpins") as mapboxgl.GeoJSONSource | undefined;
    if (k) k.setData(kingpins);
    const h = m.getSource("home") as mapboxgl.GeoJSONSource | undefined;
    if (h)
      h.setData({
        type: "FeatureCollection",
        features: home
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: home as LngLatLike },
              },
            ]
          : [],
      });
  }, [data, kingpins, home]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
      }}
    />
  );
}
