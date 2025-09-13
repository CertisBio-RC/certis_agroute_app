"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map as MbMap, MapLayerMouseEvent } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type Feature = {
  type: "Feature";
  geometry: { type: string; coordinates?: [number, number] } | null;
  properties: Record<string, any>;
};
type FC = { type: "FeatureCollection"; features: Feature[] };

type Stop = { coord: [number, number]; title?: string };

type MapProps = {
  basePath: string;            // "/certis_agroute_app" or ""
  token?: string;              // NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN (optional)
  basemap: "hybrid" | "streets";
  markerStyle: "dots" | "logos";
  data: FC;
  bbox: [number, number, number, number] | null;
  home: [number, number] | null;
  stops: Stop[];
  routeGeoJSON: any | null;
  onMapDblClick?: (lnglat: [number, number]) => void;
  onPointClick?: (lnglat: [number, number], title: string) => void;
};

// ---- helpers ---------------------------------------------------------------

const isLngLat = (c: any): c is [number, number] =>
  Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]);

const RETAILER_KEYS = ["__retailerName", "Retailer", "retailer", "RETAILER"];
const NAME_KEYS     = ["Name", "name", "NAME"];
const CAT_KEYS      = ["Category", "category", "CATEGORY"];
const STATE_KEYS    = ["State", "state", "STATE"];
const ADDR_KEYS     = ["Address", "address", "ADDRESS"];
const CITY_KEYS     = ["City", "city", "CITY"];
const ZIP_KEYS      = ["Zip", "zip", "ZIP"];

function gp(obj: any, keys: string[], fallback = ""): string {
  for (const k of keys) if (obj && obj[k] != null) return String(obj[k]);
  return fallback;
}

/** category colors for dots mode */
const CAT_COLOR: Record<string, string> = {
  Kingpin:         "#ff2d55", // neon red/pink
  Agronomy:        "#22c55e", // green
  "Office/Service":"#f59e0b", // amber
  Specialty:       "#a855f7", // purple
  Warehouse:       "#06b6d4", // cyan
};

function retailerNameToCandidates(r: string): string[] {
  const raw = r.trim();
  const collapsed = raw.replace(/\s+/g, " ");
  const noSpaces = collapsed.replace(/\s+/g, "");
  const safe = collapsed.replace(/[^\w\- ]+/g, "");
  const dashed = collapsed.replace(/\s+/g, "-");
  const withLogo = `${collapsed} Logo`;
  return [...new Set([collapsed, withLogo, safe, dashed, noSpaces].filter(Boolean))];
}

/** download -> scale into centered transparent square (maxPx×maxPx) */
async function fetchScaledBitmap(url: string, maxPx = 64): Promise<ImageBitmap> {
  const r = await fetch(url, { cache: "force-cache" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const blob = await r.blob();
  const bmp = await createImageBitmap(blob);

  const k = Math.min(maxPx / bmp.width, maxPx / bmp.height, 1);
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));

  if (typeof OffscreenCanvas !== "undefined") {
    const oc = new OffscreenCanvas(maxPx, maxPx);
    const ctx = oc.getContext("2d")!;
    ctx.clearRect(0, 0, maxPx, maxPx);
    ctx.drawImage(bmp, Math.floor((maxPx - w) / 2), Math.floor((maxPx - h) / 2), w, h);
    // @ts-ignore
    return oc.transferToImageBitmap ? oc.transferToImageBitmap() : await createImageBitmap(oc as any);
  } else {
    const c = document.createElement("canvas");
    c.width = maxPx; c.height = maxPx;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, maxPx, maxPx);
    ctx.drawImage(bmp, Math.floor((maxPx - w) / 2), Math.floor((maxPx - h) / 2), w, h);
    return await createImageBitmap(c);
  }
}

/** small colored dot as image fallback for logos */
function makeDot(color: string): ImageData {
  const size = 24;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  let canvas: any;
  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(size, size);
    ctx = canvas.getContext("2d");
  } else {
    canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    ctx = canvas.getContext("2d");
  }
  if (!ctx) return new ImageData(1, 1);
  ctx.clearRect(0, 0, size, size);
  // @ts-ignore
  ctx.beginPath(); ctx.arc(size/2, size/2, size/2-1, 0, Math.PI*2);
  // @ts-ignore
  ctx.fillStyle = color; ctx.fill();
  // @ts-ignore
  return ctx.getImageData(0, 0, size, size);
}

// ---- component -------------------------------------------------------------

export default function Map({
  basePath,
  token,
  basemap,
  markerStyle,
  data,
  bbox,
  home,
  stops,
  routeGeoJSON,
  onMapDblClick,
  onPointClick,
}: MapProps) {
  const mapRef = useRef<MbMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const loadedLogos = useRef<Set<string>>(new Set());

  const retailersInData = useMemo(() => {
    const s = new Set<string>();
    for (const f of data.features) {
      const r = gp(f.properties, RETAILER_KEYS).trim();
      if (r) s.add(r);
    }
    return [...s];
  }, [data]);

  // init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    if (token) mapboxgl.accessToken = token;

    const m = new mapboxgl.Map({
      container: containerRef.current,
      style: token
        ? (basemap === "hybrid"
            ? "mapbox://styles/mapbox/satellite-streets-v12"
            : "mapbox://styles/mapbox/streets-v12")
        : {
            version: 8,
            sources: {
              "osm-tiles": {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              }
            },
            layers: [{ id: "osm-tiles", type: "raster", source: "osm-tiles" }],
          } as any,
      center: [-97.2, 40.8],
      zoom: 4,
      cooperativeGestures: true,
      attributionControl: true,
      pitchWithRotate: false,
      dragRotate: false,
    });

    // Flat/Globe toggle if token present
    if (token) {
      try { m.addControl(new (mapboxgl as any).ProjectionControl({ default: "mercator" }), "top-right"); } catch {}
    }

    m.doubleClickZoom.disable();

    m.on("load", () => {
      if (!m.getSource("retailers")) {
        m.addSource("retailers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });
      }

      if (!m.getLayer("clusters")) {
        m.addLayer({
          id: "clusters",
          type: "circle",
          source: "retailers",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#60a5fa", 10, "#3b82f6", 30, "#1d4ed8",
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16, 10, 22, 30, 28,
            ],
            "circle-stroke-color": "#0f172a",
            "circle-stroke-width": 1.5,
          },
        });
      }
      if (!m.getLayer("cluster-count")) {
        m.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "retailers",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": 12,
          },
          paint: { "text-color": "#ffffff" },
        });
      }

      // soft halo under logos
      if (!m.getLayer("kingpin-ring")) {
        m.addLayer({
          id: "kingpin-ring",
          type: "circle",
          source: "retailers",
          filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "Category"], "Kingpin"]],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 7, 10, 11, 14, 14],
            "circle-color": "rgba(255,45,85,0.22)",
            "circle-stroke-color": "#ff2d55",
            "circle-stroke-width": 2,
          },
        }, "clusters");
      }

      // standard dots (non-kingpin)
      if (!m.getLayer("unclustered")) {
        m.addLayer({
          id: "unclustered",
          type: "circle",
          source: "retailers",
          filter: ["all", ["!", ["has", "point_count"]], ["!=", ["get", "Category"], "Kingpin"]],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 10, 6, 14, 8],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#0f172a",
            "circle-color": [
              "match",
              ["get", "Category"],
              "Agronomy",        CAT_COLOR["Agronomy"],
              "Office/Service",  CAT_COLOR["Office/Service"],
              "Specialty",       CAT_COLOR["Specialty"],
              "Warehouse",       CAT_COLOR["Warehouse"],
              /* default */       "#3b82f6"
            ],
          },
        });
      }

      // always-on top, bright Kingpin points (clickable)
      if (!m.getLayer("kingpin-points")) {
        m.addLayer({
          id: "kingpin-points",
          type: "circle",
          source: "retailers",
          filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "Category"], "Kingpin"]],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 6.5, 10, 10, 14, 14],
            "circle-color": CAT_COLOR["Kingpin"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
      }

      // logos layer (uses per-feature __iconId)
      if (!m.getLayer("retailer-logos")) {
        m.addLayer({
          id: "retailer-logos",
          type: "symbol",
          source: "retailers",
          filter: ["!", ["has", "point_count"]],
          layout: {
            "icon-image": ["get", "__iconId"],
            "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.35, 10, 0.45, 14, 0.55],
            "icon-allow-overlap": true,
            "icon-optional": true,
          },
          paint: {
            "icon-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.95, 16, 0.85, 19, 0.70],
          },
        });
        try { m.moveLayer("kingpin-points"); } catch {}
      }

      // Home / Stops / Route sources+layers
      if (!m.getSource("home-pt")) {
        m.addSource("home-pt", { type: "geojson", data: { type: "FeatureCollection", features: [] }});
      }
      if (!m.getLayer("home-pt")) {
        m.addLayer({
          id: "home-pt", type: "circle", source: "home-pt",
          paint: { "circle-radius": 7, "circle-color": "#22c55e", "circle-stroke-color": "#052e16", "circle-stroke-width": 2 }
        });
      }

      if (!m.getSource("stops-pt")) {
        m.addSource("stops-pt", { type: "geojson", data: { type: "FeatureCollection", features: [] }});
      }
      if (!m.getLayer("stops-pt")) {
        m.addLayer({
          id: "stops-pt", type: "circle", source: "stops-pt",
          paint: { "circle-radius": 6, "circle-color": "#eab308", "circle-stroke-color": "#713f12", "circle-stroke-width": 2 }
        });
      }

      if (!m.getSource("route")) {
        m.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] }});
      }
      if (!m.getLayer("route")) {
        m.addLayer({
          id: "route", type: "line", source: "route",
          paint: { "line-color": "#22c55e", "line-width": 4, "line-opacity": 0.9 }
        });
      }

      // ---------- Robust hover & click via queryRenderedFeatures ----------
      const hitLayers = ["unclustered", "retailer-logos", "kingpin-points"];

      const hidePopup = () => popupRef.current?.remove();

      m.on("mousemove", (e) => {
        const feats = m.queryRenderedFeatures(e.point, { layers: hitLayers });
        if (!feats.length) {
          m.getCanvas().style.cursor = "";
          hidePopup();
          return;
        }
        m.getCanvas().style.cursor = "pointer";
        const f: any = feats[0];
        const p = f.properties || {};
        const html = `
          <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto; font-size:12px">
            <div style="font-weight:700; margin-bottom:4px">${gp(p, RETAILER_KEYS) || "Retailer"}</div>
            ${gp(p, NAME_KEYS) ? `<div>${gp(p, NAME_KEYS)}</div>` : ""}
            ${gp(p, CAT_KEYS) ? `<div><b>${gp(p, CAT_KEYS)}</b></div>` : ""}
            ${[gp(p, ADDR_KEYS), gp(p, CITY_KEYS), gp(p, ZIP_KEYS)].filter(Boolean).join(", ")}
          </div>`;
        if (!popupRef.current) popupRef.current = new mapboxgl.Popup({ closeButton:false, closeOnClick:false, offset: 10 });
        popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(m);
      });

      m.on("click", (e) => {
        const feats = m.queryRenderedFeatures(e.point, { layers: hitLayers });
        if (!feats.length) return;
        hidePopup();
        const f: any = feats[0];
        const c: any = f?.geometry?.coordinates;
        if (isLngLat(c)) {
          const title = gp(f.properties || {}, NAME_KEYS) || gp(f.properties || {}, RETAILER_KEYS);
          onPointClick?.([c[0], c[1]], title);
        }
      });

      // cluster expand on click
      m.on("click", "clusters", (e) => {
        const features = m.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const clusterId = features[0].properties?.cluster_id;
        const source: any = m.getSource("retailers");
        source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          m.easeTo({ center: (features[0].geometry as any).coordinates, zoom });
        });
      });

      // dbl-click to set Home
      m.on("dblclick", (e) => onMapDblClick?.([e.lngLat.lng, e.lngLat.lat]));

      mapRef.current = m;
    });

    return () => { mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // toggle dots vs logos; kingpin-points always visible
  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    const setVis = (id: string, v: "visible" | "none") => { if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", v); };
    const dotsOn = markerStyle === "dots";
    setVis("unclustered",    dotsOn ? "visible" : "none");
    setVis("retailer-logos", dotsOn ? "none"    : "visible");
    setVis("kingpin-ring",   dotsOn ? "none"    : "visible");
  }, [markerStyle]);

  // feed data, preload logos, fit bounds
  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    const src = m.getSource("retailers") as mapboxgl.GeoJSONSource; if (!src) return;

    const fc: FC = {
      type: "FeatureCollection",
      features: data.features.map((f) => {
        const r = gp(f.properties, RETAILER_KEYS).trim();
        const iconId = r ? `logo-${r.toLowerCase().replace(/\s+/g, "_")}` : "";
        return { type: "Feature", geometry: f.geometry, properties: { ...f.properties, __iconId: iconId } };
      }),
    };
    src.setData(fc as any);

    if (bbox && isFinite(bbox[0])) {
      try { m.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 60, duration: 600 }); } catch {}
    }

    (async () => {
      for (const r of retailersInData) {
        const id = `logo-${r.toLowerCase().replace(/\s+/g, "_")}`;
        if (loadedLogos.current.has(id)) continue;

        const bases = retailerNameToCandidates(r);
        const candidates: string[] = [];
        for (const b of bases) {
          const enc = encodeURIComponent(b);
          candidates.push(`${basePath}/icons/${enc}.png`, `${basePath}/icons/${enc}.jpg`, `${basePath}/icons/${enc}.jpeg`);
          candidates.push(`${basePath}/icons/${b}.png`,   `${basePath}/icons/${b}.jpg`,   `${basePath}/icons/${b}.jpeg`);
        }
        let added = false;
        for (const url of candidates) {
          try {
            const scaled = await fetchScaledBitmap(url, 64);
            if (!m.hasImage(id)) m.addImage(id, scaled, { pixelRatio: 1 });
            loadedLogos.current.add(id); added = true; break;
          } catch {}
        }
        if (!added && !m.hasImage(id)) {
          m.addImage(id, makeDot("#3b82f6")); loadedLogos.current.add(id);
        }
      }
    })();
  }, [data, bbox, retailersInData, basePath]);

  // overlays
  useEffect(() => {
    const m = mapRef.current; if (!m) return;

    const homeSrc = m.getSource("home-pt")  as mapboxgl.GeoJSONSource;
    const stopsSrc = m.getSource("stops-pt") as mapboxgl.GeoJSONSource;
    const routeSrc = m.getSource("route")    as mapboxgl.GeoJSONSource;

    homeSrc?.setData({
      type: "FeatureCollection",
      features: home ? [{ type: "Feature", geometry: { type: "Point", coordinates: home }, properties: {} }] : [],
    } as any);

    stopsSrc?.setData({
      type: "FeatureCollection",
      features: (stops || []).map(s => ({ type: "Feature", geometry: { type: "Point", coordinates: s.coord }, properties: {} })),
    } as any);

    routeSrc?.setData(routeGeoJSON || { type: "FeatureCollection", features: [] });
  }, [home, stops, routeGeoJSON]);

  return <div style={{height:"100%",width:"100%"}}><div ref={containerRef} style={{height:"100%",width:"100%"}} /></div>;
}
