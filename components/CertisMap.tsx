"use client";

import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

type AnyProps = Record<string, any>;
type GJFC = GeoJSON.FeatureCollection<GeoJSON.Geometry, AnyProps>;

export type CertisMapProps = {
  token: string;
  basemap: "Hybrid" | "Streets";
  data: GJFC;
  /** Optional bounding box to fit [minLng, minLat, maxLng, maxLat] */
  bbox?: readonly [number, number, number, number];
};

const HYBRID = "mapbox://styles/mapbox/satellite-streets-v12";
const STREETS = "mapbox://styles/mapbox/streets-v12";

/** Category -> dot color (non-kingpin) */
const CATEGORY_COLORS: Record<string, string> = {
  Agronomy: "#31c48d",
  "Office/Service": "#60a5fa",
  Office: "#60a5fa",
  Warehouse: "#f59e0b",
  Distribution: "#f59e0b",
  Seed: "#a78bfa",
  Retail: "#93c5fd",
  // default
  "*": "#9ca3af",
};

function colorForCategory(cat?: string) {
  if (!cat) return CATEGORY_COLORS["*"];
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS["*"];
}

export default function CertisMap({ token, basemap, data, bbox }: CertisMapProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const divRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  useEffect(() => {
    if (!divRef.current) return;

    mapboxgl.accessToken = token;

    const style = basemap === "Hybrid" ? HYBRID : STREETS;

    // Create map
    const map = new mapboxgl.Map({
      container: divRef.current,
      style,
      center: [-96.7, 40.5],
      zoom: 3.5,
      projection: "mercator",
      attributionControl: false,
      locale: {},
    });
    mapRef.current = map;

    // Controls
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    // Add data source + layers
    map.on("load", () => {
      if (bbox && bbox.length === 4) {
        try {
          map.fitBounds(bbox as mapboxgl.LngLatBoundsLike, { padding: 24, duration: 0 });
        } catch {
          /* ignore */
        }
      }

      // 1) Source (clustered)
      if (map.getSource("retailers")) map.removeSource("retailers");
      map.addSource("retailers", {
        type: "geojson",
        data,
        cluster: true,
        clusterRadius: 50,
        clusterMinPoints: 3,
      });

      // 2) Cluster bubbles
      if (!map.getLayer("clusters")) {
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "retailers",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#3b82f6",
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16, // < step1
              10,
              24, // < step2
              25,
              32, // >= step2
            ],
            "circle-opacity": 0.9,
          },
        });
      }

      if (!map.getLayer("cluster-count")) {
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "retailers",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["to-string", ["get", "point_count"]],
            "text-size": 12,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          },
          paint: {
            "text-color": "#ffffff",
          },
        });
      }

      // 3) Unclustered non-kingpin points
      if (!map.getLayer("unclustered-dots")) {
        map.addLayer({
          id: "unclustered-dots",
          type: "circle",
          source: "retailers",
          filter: ["all", ["!", ["has", "point_count"]], ["!=", ["get", "Category"], "Kingpin"]],
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              3, 4,
              6, 6,
              10, 8,
              13, 10,
            ],
            "circle-color": [
              "case",
              ["has", "Category"],
              [
                "match",
                ["get", "Category"],
                "Agronomy", "#31c48d",
                "Office/Service", "#60a5fa",
                "Office", "#60a5fa",
                "Warehouse", "#f59e0b",
                "Distribution", "#f59e0b",
                "Seed", "#a78bfa",
                "Retail", "#93c5fd",
                /* default */ "#9ca3af",
              ],
              "#9ca3af",
            ],
            "circle-stroke-color": "#0b1220",
            "circle-stroke-width": 1.5,
          },
        });
      }

      // 4) Kingpins – bright red with yellow stroke, always on top
      if (!map.getLayer("kingpin-circles")) {
        map.addLayer({
          id: "kingpin-circles",
          type: "circle",
          source: "retailers",
          filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "Category"], "Kingpin"]],
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              3, 7,
              6, 9,
              10, 12,
              13, 14,
            ],
            "circle-color": "#ff3344",
            "circle-stroke-color": "#ffd400",
            "circle-stroke-width": 3,
            "circle-opacity": 0.98,
          },
        });
      }

      // Keep kingpins visually above everything else
      try {
        map.moveLayer("kingpin-circles");
      } catch {
        /* ignore */
      }

      // 5) Interactions
      // Clicking a cluster: zoom into it
      map.on("click", "clusters", (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0] as any;
        if (!f) return;
        const clusterId = f.properties?.cluster_id;
        const src = map.getSource("retailers") as mapboxgl.GeoJSONSource;
        if (!src) return;
        src.getClusterExpansionZoom(clusterId, (err, z) => {
          if (err) return;
          map.easeTo({ center: f.geometry.coordinates as [number, number], zoom: z });
        });
      });

      // Create a single popup instance we reuse
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: "320px",
        offset: 12,
      });

      const isTouch = typeof window !== "undefined" && matchMedia("(pointer: coarse)").matches;
      const hoverLayers = ["unclustered-dots", "kingpin-circles"];

      const showPopup = (e: mapboxgl.MapMouseEvent) => {
        const f = map.queryRenderedFeatures(e.point, { layers: hoverLayers })[0] as mapboxgl.MapboxGeoJSONFeature | undefined;
        if (!f) {
          popupRef.current?.remove();
          return;
        }
        const p = (f.properties || {}) as AnyProps;

        const title = (p.Name || p.Retailer || "Location") as string;
        const addr = [p.Address, p.City, p.State, p.Zip].filter(Boolean).join(", ");
        const category = (p.Category || "").toString();
        const logoUrl = p.logo || p.Logo || "";

        const html = `
          <div class="popup">
            ${logoUrl ? `<div class="popup-logo-wrap"><img class="popup-logo" src="${logoUrl}" alt="${p.Retailer ?? ""} logo"/></div>` : ""}
            <div class="popup-title">${escapeHtml(title)}</div>
            ${category ? `<div class="popup-sub">${escapeHtml(category)}</div>` : ""}
            ${addr ? `<div class="popup-body">${escapeHtml(addr)}</div>` : ""}
          </div>
        `;

        popupRef.current!
          .setLngLat((f.geometry as any).coordinates as [number, number])
          .setHTML(html)
          .addTo(map);
      };

      const hidePopup = () => popupRef.current?.remove();

      if (isTouch) {
        // mobile/tablet: tap to show, second tap elsewhere hides
        hoverLayers.forEach((ly) => {
          map.on("click", ly, showPopup);
        });
        map.on("click", (e) => {
          const hit = map.queryRenderedFeatures(e.point, { layers: hoverLayers })[0];
          if (!hit) hidePopup();
        });
      } else {
        // desktop: hover
        map.on("mousemove", (e) => showPopup(e));
        map.on("mouseleave", "unclustered-dots", hidePopup);
        map.on("mouseleave", "kingpin-circles", hidePopup);
        map.on("mouseout", hidePopup);
      }
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [token, basemap, data, JSON.stringify(bbox)]); // bbox serialize to retrigger fit

  return (
    <div
      ref={divRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    />
  );
}

/** Very small helper to avoid HTML injection in popups */
function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
