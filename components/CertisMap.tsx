"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { Map } from "mapbox-gl";

type LngLat = [number, number];

type GJPoint = { type: "Point"; coordinates: LngLat };
type GJFeature = {
  type: "Feature";
  geometry: GJPoint | null;
  properties: {
    Retailer: string;
    Name: string;
    Category: string;
    State: string;
    Address?: string;
    City?: string;
    Zip?: string;
  };
};
type GJFC = { type: "FeatureCollection"; features: GJFeature[] };

// Accept a readonly tuple to avoid the past TS error
type BBox = Readonly<[number, number, number, number]>;

export type CertisMapProps = {
  token: string;
  basemap: "Hybrid" | "Streets";
  markerStyle: "Colored dots" | "Logos";
  data: GJFC;          // already filtered by the page
  bbox: BBox;          // readonly is OK; we convert to Mapbox bounds internally
};

const MAP_STYLES: Record<CertisMapProps["basemap"], string> = {
  Hybrid: "mapbox://styles/mapbox/satellite-streets-v12",
  Streets: "mapbox://styles/mapbox/streets-v12",
};

const CAT_COLOR: Record<string, string> = {
  Kingpin: "#ff4d60",
  Agronomy: "#38bdf8",
  "Office/Service": "#4ade80",
  Warehouse: "#f59e0b",
};

function colorFor(cat: string) {
  return CAT_COLOR[cat] ?? "#94a3b8";
}

export default function CertisMap({
  token,
  basemap,
  markerStyle,
  data,
  bbox,
}: CertisMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: hostRef.current,
      style: MAP_STYLES[basemap],
      center: [-96.8, 39.8],
      zoom: 3.5,
      attributionControl: false,
      projection: "mercator",
      fadeDuration: 0,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "bottom-right");

    map.on("load", () => {
      // Fit once on load
      if (bbox) {
        const [w, s, e, n] = bbox;
        const bounds: mapboxgl.LngLatBoundsLike = [
          [w, s],
          [e, n],
        ];
        map.fitBounds(bounds, { padding: 40, duration: 0 });
      }

      const clustered = markerStyle !== "Logos";

      map.addSource("retailers", {
        type: "geojson",
        data,
        cluster: clustered,
        clusterMaxZoom: 6,
        clusterRadius: 45,
      });

      // Clusters (dots only)
      if (clustered) {
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "retailers",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#60a5fa",
            "circle-opacity": 0.85,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              18,
              25,
              24,
              75,
              32,
              150,
              40,
            ],
            "circle-stroke-color": "#0b1220",
            "circle-stroke-width": 2,
          },
        });

        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "retailers",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          },
          paint: { "text-color": "#0b1220" },
        });
      }

      // Unclustered dots
      map.addLayer({
        id: "unclustered-dots",
        type: "circle",
        source: "retailers",
        filter: clustered ? ["!", ["has", "point_count"]] : true,
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "Category"], "Kingpin"],
            10,
            6,
          ],
          "circle-color": [
            "case",
            ["==", ["get", "Category"], "Kingpin"],
            colorFor("Kingpin"),
            [
              "match",
              ["get", "Category"],
              ["Agronomy"],
              colorFor("Agronomy"),
              ["Office/Service"],
              colorFor("Office/Service"),
              ["Warehouse"],
              colorFor("Warehouse"),
              "#94a3b8",
            ],
          ],
          "circle-stroke-color": "#0b1220",
          "circle-stroke-width": [
            "case",
            ["==", ["get", "Category"], "Kingpin"],
            2.5,
            1.75,
          ],
        },
      });

      // Always-on-top kingpins
      map.addLayer({
        id: "kingpin-circles",
        type: "circle",
        source: "retailers",
        filter: ["==", ["get", "Category"], "Kingpin"],
        paint: {
          "circle-radius": 12,
          "circle-color": colorFor("Kingpin"),
          "circle-opacity": 0.9,
          "circle-stroke-color": "#000",
          "circle-stroke-width": 2.5,
        },
      });

      // Logos (simple text stand-in)
      if (markerStyle === "Logos") {
        map.addLayer({
          id: "retailer-logos",
          type: "symbol",
          source: "retailers",
          layout: {
            "text-field": [
              "coalesce",
              ["slice", ["get", "Retailer"], 0, 4],
              "•",
            ],
            "text-size": [
              "case",
              ["==", ["get", "Category"], "Kingpin"],
              20,
              14,
            ],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#e5e7eb",
            "text-halo-color": "#0b1220",
            "text-halo-width": 1.5,
          },
        });
      }

      // Hover popups on dots/kingpins/logos
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
      });

      const hoverLayers = ["unclustered-dots", "kingpin-circles"];
      if (markerStyle === "Logos") hoverLayers.push("retailer-logos");

      const onMove = (e: mapboxgl.MapMouseEvent) => {
        const f = map.queryRenderedFeatures(e.point, { layers: hoverLayers })[0] as any;
        if (!f) {
          map.getCanvas().style.cursor = "";
          popupRef.current!.remove();
          return;
        }
        map.getCanvas().style.cursor = "pointer";
        const p = f.properties || {};
        const html = `
          <div style="font-weight:700;margin-bottom:4px">${p.Retailer ?? ""}</div>
          <div>${p.Name ?? ""}</div>
          <div style="opacity:.8">${p.Category ?? ""}</div>
          <div style="opacity:.8">${[p.Address, p.City, p.Zip].filter(Boolean).join(", ")}</div>
        `;
        const coords: LngLat =
          f.geometry?.type === "Point"
            ? (f.geometry.coordinates as LngLat)
            : (e.lngLat.toArray() as LngLat);
        popupRef.current!.setLngLat(coords).setHTML(html).addTo(map);
      };

      const onLeave = () => {
        map.getCanvas().style.cursor = "";
        popupRef.current!.remove();
      };

      hoverLayers.forEach((id) => {
        map.on("mousemove", id, onMove);
        map.on("mouseleave", id, onLeave);
      });
    });

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [token, basemap, markerStyle, data, bbox]);

  return <div ref={hostRef} className="h-full w-full" />;
}
