"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map } from "mapbox-gl";
import type { Point as GJPointGeom } from "geojson";

/** Adjust if your dataset uses different property names */
export type RetailerProps = {
  id?: string | number;
  name?: string;
  Retailer?: string;
  retailer?: string;
  Category?: string;
  category?: string;
  Type?: string;
  type?: string;
  Address?: string;
  address?: string;
  City?: string;
  city?: string;
  State?: string;
  state?: string;
  ZIP?: string | number;
  zip?: string | number;
  Kingpin?: string | boolean;
  kingpin?: boolean;
  logoUrl?: string;
};

type GJPoint = GeoJSON.Feature<GeoJSON.Point, RetailerProps>;
type GJFC = GeoJSON.FeatureCollection<GeoJSON.Point, RetailerProps>;

export type CertisMapProps = {
  token: string;
  basemap: "Hybrid" | "Streets";
  data: GJFC;
  bbox: [number, number, number, number];
  onPointClick?: (lngLat: [number, number], title: string, feature: GJPoint) => void;
};

mapboxgl.accessToken = ""; // set per-instance below

const STYLE_STREETS = "mapbox://styles/mapbox/streets-v12";
const STYLE_HYBRID = "mapbox://styles/mapbox/satellite-streets-v12";

const KINGPIN_FILL = "#ff2d2d";
const KINGPIN_STROKE = "#ffd500";

function coerceKingpinBoolean(p: RetailerProps): boolean {
  if (typeof p.kingpin === "boolean") return p.kingpin;
  if (typeof p.Kingpin === "boolean") return p.Kingpin;
  const raw = String(p.Kingpin ?? "").trim().toLowerCase();
  return ["y", "yes", "true", "1"].includes(raw);
}

function featureTitle(p: RetailerProps): string {
  const retailer = p.retailer ?? p.Retailer ?? "";
  const name = p.name ?? "";
  const cat = p.category ?? p.Category ?? "";
  if (retailer && name) return `${retailer} — ${name}`;
  if (name) return name;
  if (retailer) return retailer;
  return "Location";
}

function featureAddress(p: RetailerProps): string {
  const a = p.address ?? p.Address ?? "";
  const c = p.city ?? p.City ?? "";
  const s = p.state ?? p.State ?? "";
  const z = p.zip ?? p.ZIP ?? "";
  const parts = [a, [c, s].filter(Boolean).join(", "), z].filter(Boolean);
  return parts.join("<br>");
}

export default function CertisMap({
  token,
  basemap,
  data,
  bbox,
  onPointClick,
}: CertisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // clone + enrich data so we can filter kingpins quickly
  const enriched = useMemo<GJFC>(() => {
    return {
      type: "FeatureCollection",
      features: (data?.features ?? []).map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          kingpin: coerceKingpinBoolean(f.properties ?? {}),
        },
      })),
    };
  }, [data]);

  // initialize map once
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: basemap === "Hybrid" ? STYLE_HYBRID : STYLE_STREETS,
      cooperativeGestures: false, // allow normal wheel zoom
      dragRotate: false,
      attributionControl: true,
    });

    mapRef.current = map;

    // Normal wheel/touch zoom
    map.scrollZoom.enable();
    map.boxZoom.enable();
    map.touchZoomRotate.enable();

    map.on("load", () => {
      // Fit to bbox once on first load (unless URL hash present)
      if (!location.hash) {
        try {
          map.fitBounds(bbox, { padding: 28, duration: 0 });
        } catch {}
      }

      // Source
      if (!map.getSource("retailers")) {
        map.addSource("retailers", {
          type: "geojson",
          data: enriched,
          cluster: true,
          clusterRadius: 55,
          clusterMaxZoom: 12,
          generateId: true,
        });
      }

      // Clusters
      if (!map.getLayer("clusters")) {
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "retailers",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#4aa3ff",
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16,
              25,
              22,
              100,
              28,
            ],
            "circle-stroke-color": "#0b1b2b",
            "circle-stroke-width": 2,
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
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          },
          paint: {
            "text-color": "#fff",
          },
        });
      }

      // Kingpins on top (bright red w/ yellow stroke)
      if (!map.getLayer("unclustered-kingpins")) {
        map.addLayer({
          id: "unclustered-kingpins",
          type: "circle",
          source: "retailers",
          filter: ["all", ["!has", "point_count"], ["==", ["get", "kingpin"], true]],
          paint: {
            "circle-color": KINGPIN_FILL,
            "circle-radius": 10,
            "circle-stroke-color": KINGPIN_STROKE,
            "circle-stroke-width": 3,
          },
        });
      }

      // Regular (non-kingpin) points
      if (!map.getLayer("unclustered-dots")) {
        map.addLayer({
          id: "unclustered-dots",
          type: "circle",
          source: "retailers",
          filter: ["all", ["!has", "point_count"], ["!=", ["get", "kingpin"], true]],
          paint: {
            "circle-color": [
              "match",
              ["downcase", ["to-string", ["coalesce", ["get", "category"], ["get", "Category"], ""]]],
              "agronomy",
              "#1dd1a1",
              "distribution",
              "#feca57",
              "grain",
              "#54a0ff",
              "office/service",
              "#9b59b6",
              /* default */ "#48dbfb",
            ],
            "circle-radius": 6,
            "circle-stroke-color": "#0b1b2b",
            "circle-stroke-width": 2,
          },
        });
      }

      // click clusters to zoom in (TS-safe center extraction)
      map.on("click", "clusters", (e: any) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const clusterId = features[0]?.properties?.cluster_id;
        const src: any = map.getSource("retailers");
        if (!src || clusterId == null) return;
        src.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          const center = ((features[0].geometry as GJPointGeom).coordinates ??
            [e.lngLat.lng, e.lngLat.lat]) as [number, number];
          map.easeTo({ center, zoom });
        });
      });

      const openPopup = (f: any, lngLat: mapboxgl.LngLatLike) => {
        const p: RetailerProps = f.properties || {};
        const title = featureTitle(p);
        const addr = featureAddress(p);
        const cat = p.category ?? p.Category ?? "";
        const retailer = p.retailer ?? p.Retailer ?? "";
        const logo = p.logoUrl ? `<img class="popup-logo" src="${p.logoUrl}" alt="" />` : "";

        const html = `
          <div class="pop-card">
            ${logo}
            <div class="pop-title">${title}</div>
            ${retailer ? `<div class="pop-sub">${retailer}${cat ? " • " + cat : ""}</div>` : cat ? `<div class="pop-sub">${cat}</div>` : ""}
            ${addr ? `<div class="pop-addr">${addr}</div>` : ""}
            <div class="pop-hint">Click to add as stop</div>
          </div>`;

        if (!popupRef.current) {
          popupRef.current = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            anchor: "top",
            offset: 18,
          });
        }
        popupRef.current.setLngLat(lngLat).setHTML(html).addTo(map);
      };

      const hoverTargets = ["unclustered-kingpins", "unclustered-dots"];
      map.on("mousemove", (e) => {
        const feat = map.queryRenderedFeatures(e.point, { layers: hoverTargets })[0] as any;
        if (feat) {
          map.getCanvas().style.cursor = "pointer";
          openPopup(feat, e.lngLat);
        } else {
          map.getCanvas().style.cursor = "";
          popupRef.current?.remove();
        }
      });
      map.on("mouseleave", "unclustered-dots", () => popupRef.current?.remove());
      map.on("mouseleave", "unclustered-kingpins", () => popupRef.current?.remove());

      // Click/tap a point => show popup and bubble up to add stop
      const clickPoint = (e: any) => {
        const feat: GJPoint | undefined = e.features?.[0];
        if (!feat) return;
        openPopup(feat, e.lngLat);
        const p = feat.properties || {};
        const title = featureTitle(p);
        onPointClick?.(feat.geometry.coordinates as [number, number], title, feat);
      };
      map.on("click", "unclustered-kingpins", clickPoint);
      map.on("click", "unclustered-dots", clickPoint);
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // swap basemap style (re-add layers)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const targetStyle = basemap === "Hybrid" ? STYLE_HYBRID : STYLE_STREETS;

    const doSwap = async () => {
      if (map.getStyle()?.sprite?.startsWith(targetStyle)) return;
      map.setStyle(targetStyle);
      map.once("styledata", () => {
        if (!map.getSource("retailers")) {
          map.addSource("retailers", {
            type: "geojson",
            data: enriched,
            cluster: true,
            clusterRadius: 55,
            clusterMaxZoom: 12,
            generateId: true,
          });
        }
        const ensure = (id: string) => map.getLayer(id) && map.removeLayer(id);
        ["clusters", "cluster-count", "unclustered-kingpins", "unclustered-dots"].forEach(ensure);

        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "retailers",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#4aa3ff",
            "circle-radius": ["step", ["get", "point_count"], 16, 25, 22, 100, 28],
            "circle-stroke-color": "#0b1b2b",
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
          paint: { "text-color": "#fff" },
        });
        map.addLayer({
          id: "unclustered-kingpins",
          type: "circle",
          source: "retailers",
          filter: ["all", ["!has", "point_count"], ["==", ["get", "kingpin"], true]],
          paint: {
            "circle-color": KINGPIN_FILL,
            "circle-radius": 10,
            "circle-stroke-color": KINGPIN_STROKE,
            "circle-stroke-width": 3,
          },
        });
        map.addLayer({
          id: "unclustered-dots",
          type: "circle",
          source: "retailers",
          filter: ["all", ["!has", "point_count"], ["!=", ["get", "kingpin"], true]],
          paint: {
            "circle-color": [
              "match",
              ["downcase", ["to-string", ["coalesce", ["get", "category"], ["get", "Category"], ""]]],
              "agronomy",
              "#1dd1a1",
              "distribution",
              "#feca57",
              "grain",
              "#54a0ff",
              "office/service",
              "#9b59b6",
              "#48dbfb",
            ],
            "circle-radius": 6,
            "circle-stroke-color": "#0b1b2b",
            "circle-stroke-width": 2,
          },
        });
      });
    };
    doSwap();
  }, [basemap, enriched]);

  // push fresh data into the source
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src: any = map.getSource("retailers");
    if (src && enriched) {
      src.setData(enriched);
    }
  }, [enriched]);

  // zoom/fit to bbox on data/filter change (but respect URL hash)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bbox || location.hash) return;
    try {
      map.fitBounds(bbox, { padding: 28, duration: 250 });
    } catch {}
  }, [bbox]);

  return <div ref={containerRef} className="map-card" />;
}
