"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { LngLat } from "mapbox-gl";
import type { FeatureCollection, Feature, Point, Position, GeoJsonProperties } from "geojson";

/** Category colors used for legend dots and layers */
export const CATEGORY_COLOR: Record<string, string> = {
  Kingpin: "#ff3b3b",           // red
  Agronomy: "#19c37d",
  "Agronomy/Grain": "#9b59ff",
  Distribution: "#09d3ff",
  Grain: "#ffb020",
  "Grain/Feed": "#ffd43b",
  "Office/Service": "#5aa2ff",
};

type MapStyleKey = "hybrid" | "street";

export type CertisMapProps = {
  /** main retailers (clustered) */
  main: FeatureCollection<Point, GeoJsonProperties>;
  /** kingpins (red/yellow) drawn above clusters */
  kingpins: FeatureCollection<Point, GeoJsonProperties>;
  /** optional home point */
  home: Position | null;
  /** legacy signature we’ve been using throughout the app */
  onPointClick: (properties: any, ll: LngLat) => void;
  /** map style selector */
  mapStyle: MapStyleKey;
};

/* Style URLs */
const STYLE_HYBRID = "mapbox://styles/mapbox/satellite-streets-v12";
const STYLE_STREET = "mapbox://styles/mapbox/streets-v12";

/* Source & layer ids */
const MAIN_SRC = "main-src";
const KING_SRC = "king-src";
const HOME_SRC = "home-src";
const MAIN_POINTS = "main-points";
const MAIN_CLUSTER = "main-cluster";
const MAIN_CLUSTER_COUNT = "main-cluster-count";
const KING_LAYER = "king-layer";
const HOME_LAYER = "home-layer";

/* Get token from env or from /mapbox-token under basePath */
async function resolveToken(): Promise<string> {
  // 1) env
  if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string;
  }
  // 2) basePath-aware fetch (/certis_agroute_app/mapbox-token on GH Pages)
  const base = (globalThis as any).__NEXT_DATA__?.assetPrefix || ""; // Next injects this on static export
  const url = `${base || ""}/mapbox-token`.replace(/\/+/, "/");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
  const txt = (await res.text()).trim();
  if (!txt) throw new Error("Empty token file");
  return txt;
}

function styleForKey(k: MapStyleKey) {
  return k === "hybrid" ? STYLE_HYBRID : STYLE_STREET;
}

export default function CertisMap({ main, kingpins, home, onPointClick, mapStyle }: CertisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const styleUrl = useMemo(() => styleForKey(mapStyle), [mapStyle]);

  // Build a small HTML for hover popup (with optional logo)
  const buildPopupHTML = (props: any) => {
    const name = props?.name || props?.Name || "Location";
    const address = [props?.Address, props?.City, props?.State, props?.Zip]
      .filter(Boolean)
      .join(", ");
    const category = props?.category || props?.Category || props?.type || "";
    const retailer = props?.retailer || props?.Retailer || "";
    const logoKey = (retailer || name).toLowerCase().replace(/\W+/g, "-");
    const base = (globalThis as any).__NEXT_DATA__?.assetPrefix || "";
    const logoSrc = `${base || ""}/icons/${logoKey}.png`;

    // Try an <img> but don’t rely on it existing
    return `
      <div style="min-width:260px;max-width:320px;font:500 14px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#e8f4fa">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <img src="${logoSrc}" onerror="this.style.display='none'" style="height:22px;max-width:120px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))" />
          <strong style="font-weight:700">${name}</strong>
        </div>
        <div style="opacity:.9;margin-bottom:6px">${address || ""}</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${CATEGORY_COLOR[category] || "#5aa2ff"};border:1px solid rgba(255,255,255,.5)"></span>
          <span>${category || "Location"}</span>
        </div>
      </div>
    `;
  };

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        const token = await resolveToken();
        if (disposed) return;
        mapboxgl.accessToken = token;

        // container element must exist and have non-zero size (CSS handles size)
        const el = containerRef.current!;
        if (!el) return;

        // Create map once
        const map = new mapboxgl.Map({
          container: el,
          style: styleUrl,
          projection: { name: "mercator" as any },
          attributionControl: true,
          cooperativeGestures: true,
        });
        mapRef.current = map;

        // Assure resize after first render & whenever container changes
        const doResize = () => {
          try { map.resize(); } catch {}
        };
        map.on("load", () => {
          doResize();
          // Projection lock (Mapbox can revert projection across setStyle)
          try { map.setProjection({ name: "mercator" as any }); } catch {}

          // Sources
          map.addSource(MAIN_SRC, {
            type: "geojson",
            data: main,
            cluster: true,
            clusterMaxZoom: 12,
            clusterRadius: 40,
            generateId: true,
          });

          map.addSource(KING_SRC, {
            type: "geojson",
            data: kingpins,
            generateId: true,
          });

          map.addSource(HOME_SRC, {
            type: "geojson",
            data: home
              ? {
                  type: "FeatureCollection",
                  features: [
                    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: home } },
                  ],
                }
              : { type: "FeatureCollection", features: [] },
          });

          // Layers: clusters
          map.addLayer({
            id: MAIN_CLUSTER,
            type: "circle",
            source: MAIN_SRC,
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#3cc7b7",
              "circle-stroke-width": 2,
              "circle-stroke-color": "#0b141a",
              "circle-radius": [
                "step",
                ["get", "point_count"],
                16,
                50, 20,
                100, 26,
                200, 32
              ],
            },
          });

          map.addLayer({
            id: MAIN_CLUSTER_COUNT,
            type: "symbol",
            source: MAIN_SRC,
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["to-string", ["get", "point_count"]],
              "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
              "text-size": 12,
            },
            paint: {
              "text-color": "#0b141a",
            },
          });

          // Individual main points
          map.addLayer({
            id: MAIN_POINTS,
            type: "circle",
            source: MAIN_SRC,
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": [
                "coalesce",
                ["get", "color"],
                "#5aa2ff"
              ],
              "circle-stroke-width": 2,
              "circle-stroke-color": "#001018",
              "circle-radius": 7,
            },
          });

          // Kingpins above everything
          map.addLayer({
            id: KING_LAYER,
            type: "circle",
            source: KING_SRC,
            paint: {
              "circle-color": "#ff3b3b",
              "circle-stroke-color": "#ffd43b",
              "circle-stroke-width": 3,
              "circle-radius": 7.5,
            },
          });

          // Home marker (subtle)
          map.addLayer({
            id: HOME_LAYER,
            type: "circle",
            source: HOME_SRC,
            paint: {
              "circle-color": "#ffffff",
              "circle-stroke-color": "#3cc7b7",
              "circle-stroke-width": 3,
              "circle-radius": 6,
            },
          });

          // Fit bounds to data if present
          try {
            const fc: FeatureCollection<Point> = {
              type: "FeatureCollection",
              features: [
                ...(main?.features || []),
                ...(kingpins?.features || []),
              ],
            };
            if (fc.features.length > 0) {
              const xs = fc.features.map(f => f.geometry.coordinates[0]);
              const ys = fc.features.map(f => f.geometry.coordinates[1]);
              const minx = Math.min(...xs), maxx = Math.max(...xs);
              const miny = Math.min(...ys), maxy = Math.max(...ys);
              map.fitBounds([[minx, miny], [maxx, maxy]], { padding: 48, duration: 600 });
            }
          } catch {}

          // Hover popup
          popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 18 });

          const showPopup = (e: mapboxgl.MapMouseEvent) => {
            const feats = map.queryRenderedFeatures(e.point, { layers: [KING_LAYER, MAIN_POINTS] });
            const f = feats[0] as Feature<Point, any> | undefined;
            if (!f) { popupRef.current?.remove(); return; }
            const html = buildPopupHTML(f.properties || {});
            popupRef.current!
              .setLngLat(f.geometry.coordinates as [number, number])
              .setHTML(html)
              .addTo(map);
            map.getCanvas().style.cursor = "pointer";
          };
          const hidePopup = () => {
            popupRef.current?.remove();
            map.getCanvas().style.cursor = "";
          };

          map.on("mousemove", KING_LAYER, showPopup);
          map.on("mousemove", MAIN_POINTS, showPopup);
          map.on("mouseleave", KING_LAYER, hidePopup);
          map.on("mouseleave", MAIN_POINTS, hidePopup);

          // Click to add stop / expand clusters
          map.on("click", (ev) => {
            // cluster?
            const clusterFeats = map.queryRenderedFeatures(ev.point, { layers: [MAIN_CLUSTER] });
            if (clusterFeats.length) {
              const f = clusterFeats[0] as any;
              const src = map.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
              const clusterId = f.properties?.cluster_id;
              if (src && clusterId != null) {
                // @ts-ignore – present at runtime
                src.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
                  if (err) return;
                  map.easeTo({ center: (f.geometry as any).coordinates, zoom });
                });
              }
              return;
            }

            // direct feature?
            const pick = map.queryRenderedFeatures(ev.point, { layers: [KING_LAYER, MAIN_POINTS] });
            const feat = pick[0] as Feature<Point, any> | undefined;
            if (!feat) return;
            onPointClick(feat.properties || {}, new LngLat(feat.geometry.coordinates[0], feat.geometry.coordinates[1]));
          });

          // handle container/viewport changes
          const ro = new ResizeObserver(() => doResize());
          ro.observe(el as Element);
          window.addEventListener("resize", doResize);

          // also ensure projection after style reloads (e.g., style switch)
          map.on("style.load", () => {
            try { map.setProjection({ name: "mercator" as any }); } catch {}
            doResize();
          });
        });
      } catch (err) {
        console.error(err);
      }
    })();

    return () => {
      disposed = true;
      popupRef.current?.remove();
      popupRef.current = null;
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch {}
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  // Live data updates without rebuilding the map
  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    try {
      const s = m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
      if (s) s.setData(main);
    } catch {}
  }, [main]);

  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    try {
      const s = m.getSource(KING_SRC) as mapboxgl.GeoJSONSource | undefined;
      if (s) s.setData(kingpins);
    } catch {}
  }, [kingpins]);

  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    try {
      const s = m.getSource(HOME_SRC) as mapboxgl.GeoJSONSource | undefined;
      if (s) s.setData(home
        ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: home } }] }
        : { type: "FeatureCollection", features: [] }
      );
    } catch {}
  }, [home]);

  return (
    <div className="map-frame">
      {/* Optional logo overlay inside the map */}
      <img className="certis-logo-on-map" src={(typeof window !== "undefined" && (window as any).__NEXT_DATA__?.assetPrefix ? (window as any).__NEXT_DATA__.assetPrefix : "") + "/certis-logo.png"} alt="CERTIS" />
      <div ref={containerRef} className="map-wrap" />
    </div>
  );
}
