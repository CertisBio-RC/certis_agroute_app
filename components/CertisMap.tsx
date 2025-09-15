"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map as MapboxMap } from "mapbox-gl";
import type { FeatureCollection, Feature, Point, Position } from "geojson";
import { withBasePath } from "@/utils/paths";

/** Public color map used elsewhere for legend dots */
export const CATEGORY_COLOR: Record<string, string> = {
  Agronomy: "#26c281",
  "Agronomy/Grain": "#9457ff",
  Distribution: "#20bfd6",
  Grain: "#f1b70e",
  "Grain/Feed": "#7a5a23",
  Kingpin: "#ea3a42",
  "Office/Service": "#4484ff",
};

type CertisMapProps = {
  main: FeatureCollection<Point, { [k: string]: any }>;
  kingpins: FeatureCollection<Point, { [k: string]: any }>;
  home?: Position;
  onPointClick: (props: any, ll: mapboxgl.LngLat) => void;
  mapStyle: "hybrid" | "street";
};

const CONTAINER_ID = "certis-map";
const MAIN_SRC = "main-src";
const KING_SRC = "king-src";
const HOME_SRC = "home-src";
const CLUSTER_LAYER = "main-clusters";
const CLUSTER_COUNT_LAYER = "main-cluster-count";
const MAIN_POINTS = "main-unclustered";
const KING_LAYER = "kingpins";
const HOME_LAYER = "home-layer";

function styleUrlFor(style: "hybrid" | "street") {
  return style === "hybrid"
    ? "mapbox://styles/mapbox/satellite-streets-v12"
    : "mapbox://styles/mapbox/streets-v12";
}

/** Token at runtime: env first, else /public/mapbox-token via basePath */
async function ensureAccessToken(): Promise<string> {
  const current = (mapboxgl as any).accessToken as string | undefined;
  if (current && current.trim()) return current;

  const env = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
  if (env) {
    mapboxgl.accessToken = env;
    return env;
  }

  try {
    const res = await fetch(withBasePath("/mapbox-token"), { cache: "no-store" });
    if (!res.ok) throw new Error("no token file");
    const txt = (await res.text()).trim();
    if (txt) mapboxgl.accessToken = txt;
    return txt;
  } catch (e) {
    console.error(
      "Mapbox token missing. Put your token in .env.local as NEXT_PUBLIC_MAPBOX_TOKEN or in /public/mapbox-token"
    );
    return "";
  }
}

function retailerLogoPath(retailer?: string): string | null {
  if (!retailer) return null;
  const fileName = retailer
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]/g, "");
  return withBasePath(`/icons/${fileName}.png`);
}

function toTuple2(pos?: Position): [number, number] | null {
  if (!pos) return null;
  if (Array.isArray(pos) && pos.length >= 2) {
    return [Number(pos[0]), Number(pos[1])];
  }
  return null;
}

function categoryPaintExpression(): any {
  return [
    "case",
    ["==", ["get", "type"], "Kingpin"],
    CATEGORY_COLOR["Kingpin"],
    ["==", ["get", "type"], "Agronomy"],
    CATEGORY_COLOR["Agronomy"],
    ["==", ["get", "type"], "Agronomy/Grain"],
    CATEGORY_COLOR["Agronomy/Grain"],
    ["==", ["get", "type"], "Distribution"],
    CATEGORY_COLOR["Distribution"],
    ["==", ["get", "type"], "Grain"],
    CATEGORY_COLOR["Grain"],
    ["==", ["get", "type"], "Grain/Feed"],
    CATEGORY_COLOR["Grain/Feed"],
    ["==", ["get", "type"], "Office/Service"],
    CATEGORY_COLOR["Office/Service"],
    "#1fb6c9",
  ];
}

const clusterCountLayout: any = {
  "text-field": ["to-string", ["get", "point_count"]],
  "text-size": 11,
  "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
};

const clusterPaint: any = {
  "circle-color": "#42d8e6",
  "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 25, 26, 50, 32],
  "circle-stroke-width": 1.2,
  "circle-stroke-color": "#0d2231",
};

const countPaint: any = {
  "text-color": "#0e2332",
  "text-halo-color": "#eaffff",
  "text-halo-width": 1,
};

const MAIN_POINT_PAINT: any = {
  "circle-color": categoryPaintExpression(),
  "circle-radius": 6,
  "circle-stroke-width": 1.25,
  "circle-stroke-color": "#0d2231",
};

const KING_PAINT: any = {
  "circle-color": CATEGORY_COLOR["Kingpin"],
  "circle-radius": 7.5,
  "circle-stroke-width": 2.25,
  "circle-stroke-color": "#ffd84d",
};

const HOME_PAINT: any = {
  "circle-color": "#ffffff",
  "circle-radius": 6.5,
  "circle-stroke-width": 2,
  "circle-stroke-color": "#68e1ff",
};

const hoverPopupHtml = (p: any) => {
  const name = p?.name || p?.Retailer || "Location";
  const addr = [p?.address, p?.city, p?.state, p?.zip].filter(Boolean).join(" — ");
  const cat = p?.type || p?.category || "";
  const logo = retailerLogoPath(p?.Retailer);
  return `
    <div style="min-width:220px;display:flex;gap:10px;align-items:flex-start;">
      ${logo ? `<img src="${logo}" alt="" style="width:36px;height:36px;object-fit:contain;margin-top:2px" onerror="this.style.display='none'">` : ""}
      <div>
        <div style="font-weight:700;margin-bottom:2px;">${name}</div>
        ${cat ? `<div style="font-size:12px;margin-bottom:2px;">${cat}</div>` : ""}
        ${addr ? `<div style="font-size:12px;opacity:.85;">${addr}</div>` : ""}
      </div>
    </div>
  `;
};

const CertisMap: React.FC<CertisMapProps> = ({
  main,
  kingpins,
  home,
  onPointClick,
  mapStyle,
}) => {
  const mapRef = useRef<MapboxMap | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const homeTuple = useMemo(() => toTuple2(home), [home]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;

    (async () => {
      const token = await ensureAccessToken();
      if (cancelled || !token) return;

      const map = new mapboxgl.Map({
        container: containerRef.current!,
        style: styleUrlFor(mapStyle),
        projection: { name: "mercator" as any },
        center: [-94.5, 41.5],
        zoom: 4,
        pitchWithRotate: false,
        dragRotate: false,
      });

      mapRef.current = map;

      const wire = () => {
        if (!map.isStyleLoaded()) return;
        try {
          map.setProjection({ name: "mercator" as any });
        } catch {}

        if (!map.getSource(MAIN_SRC)) {
          map.addSource(MAIN_SRC, {
            type: "geojson",
            data: main,
            cluster: true,
            clusterMaxZoom: 12,
            clusterRadius: 55,
          });
        } else {
          (map.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource).setData(main);
        }

        if (!map.getSource(KING_SRC)) {
          map.addSource(KING_SRC, { type: "geojson", data: kingpins });
        } else {
          (map.getSource(KING_SRC) as mapboxgl.GeoJSONSource).setData(kingpins);
        }

        const homeFC: FeatureCollection<Point> = homeTuple
          ? {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: homeTuple },
                },
              ],
            }
          : { type: "FeatureCollection", features: [] };

        if (!map.getSource(HOME_SRC)) {
          map.addSource(HOME_SRC, { type: "geojson", data: homeFC });
        } else {
          (map.getSource(HOME_SRC) as mapboxgl.GeoJSONSource).setData(homeFC);
        }

        [CLUSTER_LAYER, CLUSTER_COUNT_LAYER, MAIN_POINTS, KING_LAYER, HOME_LAYER].forEach(
          (id) => {
            if (map.getLayer(id)) map.removeLayer(id);
          }
        );

        map.addLayer({
          id: CLUSTER_LAYER,
          type: "circle",
          source: MAIN_SRC,
          filter: [">", ["get", "point_count"], 0],
          paint: {
            "circle-color": "#42d8e6",
            "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 25, 26, 50, 32],
            "circle-stroke-width": 1.2,
            "circle-stroke-color": "#0d2231",
          },
        });

        map.addLayer({
          id: CLUSTER_COUNT_LAYER,
          type: "symbol",
          source: MAIN_SRC,
          filter: [">", ["get", "point_count"], 0],
          layout: {
            "text-field": ["to-string", ["get", "point_count"]],
            "text-size": 11,
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          } as any,
          paint: {
            "text-color": "#0e2332",
            "text-halo-color": "#eaffff",
            "text-halo-width": 1,
          } as any,
        });

        map.addLayer({
          id: MAIN_POINTS,
          type: "circle",
          source: MAIN_SRC,
          filter: ["!", ["has", "point_count"]],
          paint: {
            ...(categoryPaintExpression() ? {} : {}),
            "circle-color": categoryPaintExpression() as any,
            "circle-radius": 6,
            "circle-stroke-width": 1.25,
            "circle-stroke-color": "#0d2231",
          },
        });

        map.addLayer({
          id: KING_LAYER,
          type: "circle",
          source: KING_SRC,
          paint: {
            "circle-color": "#ea3a42",
            "circle-radius": 7.5,
            "circle-stroke-width": 2.25,
            "circle-stroke-color": "#ffd84d",
          } as any,
        });

        map.addLayer({
          id: HOME_LAYER,
          type: "circle",
          source: HOME_SRC,
          paint: {
            "circle-color": "#ffffff",
            "circle-radius": 6.5,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#68e1ff",
          } as any,
        });

        map.on("mouseenter", MAIN_POINTS, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", MAIN_POINTS, () => (map.getCanvas().style.cursor = ""));
        map.on("mouseenter", KING_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", KING_LAYER, () => (map.getCanvas().style.cursor = ""));

        const ensurePopup = () => {
          if (!popupRef.current) {
            popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
          }
          return popupRef.current;
        };

        const showPopup = (e: mapboxgl.MapMouseEvent) => {
          const feats = map.queryRenderedFeatures(e.point, { layers: [KING_LAYER, MAIN_POINTS] });
          const f = feats[0];
          if (!f) return;
          const p = f.properties || {};
          const coords = (f.geometry as any).coordinates as [number, number];
          ensurePopup().setLngLat(coords).setHTML(hoverPopupHtml(p)).addTo(map);
        };
        const hidePopup = () => popupRef.current?.remove();

        map.on("mousemove", MAIN_POINTS, showPopup);
        map.on("mouseleave", MAIN_POINTS, hidePopup);
        map.on("mousemove", KING_LAYER, showPopup);
        map.on("mouseleave", KING_LAYER, hidePopup);

        map.on("click", MAIN_POINTS, (e) => {
          const f = e.features?.[0] as Feature<Point> | undefined;
          if (!f) return;
          const p = f.properties || {};
          const [lng, lat] = f.geometry.coordinates as [number, number];
          onPointClick(p, new mapboxgl.LngLat(lng, lat));
        });

        map.on("click", KING_LAYER, (e) => {
          const f = e.features?.[0] as Feature<Point> | undefined;
          if (!f) return;
          const p = f.properties || {};
          const [lng, lat] = f.geometry.coordinates as [number, number];
          onPointClick(p, new mapboxgl.LngLat(lng, lat));
        });

        map.on("click", CLUSTER_LAYER, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const clusterId = f.properties && (f.properties as any).cluster_id;
          const src = map.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
          if (!src || clusterId == null) return;
          // @ts-ignore — available at runtime on GeoJSONSource
          src.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
            if (err) return;
            const center = (f.geometry as any).coordinates as [number, number];
            map.easeTo({ center, zoom });
          });
        });
      };

      map.on("style.load", wire);
      map.once("load", wire);

      return () => {
        popupRef.current?.remove();
        map.remove();
        mapRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
    };
  }, [mapStyle, main, kingpins, home]);

  // Style toggle
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.setStyle(styleUrlFor(mapStyle));
    m.once("style.load", () => {
      try {
        m.setProjection({ name: "mercator" as any });
      } catch {}
    });
  }, [mapStyle]);

  // Data updates
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const src = m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(main);
  }, [main]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const src = m.getSource(KING_SRC) as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(kingpins);
  }, [kingpins]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const src = m.getSource(HOME_SRC) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    const fc: FeatureCollection<Point> = toTuple2(home)
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: toTuple2(home)! },
            },
          ],
        }
      : { type: "FeatureCollection", features: [] };
    src.setData(fc);
  }, [home]);

  return (
    <div
      id={CONTAINER_ID}
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 560,
        borderRadius: 12,
        overflow: "hidden",
      }}
    />
  );
};

export default CertisMap;
