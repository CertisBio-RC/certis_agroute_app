"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl, { Map as MbMap, MapLayerMouseEvent } from "mapbox-gl";

type Feature = {
  type: "Feature";
  geometry: { type: string; coordinates?: [number, number] } | null;
  properties: Record<string, any>;
};
type FC = { type: "FeatureCollection"; features: Feature[] };

type Stop = { coord: [number, number]; title?: string };

type MapProps = {
  basePath: string; // e.g. "/certis_agroute_app" or ""
  token?: string;
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

const isLngLat = (c: any): c is [number, number] =>
  Array.isArray(c) &&
  c.length === 2 &&
  Number.isFinite(c[0]) &&
  Number.isFinite(c[1]) &&
  c[0] >= -180 &&
  c[0] <= 180 &&
  c[1] >= -90 &&
  c[1] <= 90;

const RETAILER_KEYS = ["__retailerName", "Retailer", "retailer", "RETAILER"];
const NAME_KEYS = ["Name", "name", "NAME"];
const CAT_KEYS = ["Category", "category", "CATEGORY"];
const STATE_KEYS = ["State", "state", "STATE"];
const ADDR_KEYS = ["Address", "address", "ADDRESS"];
const CITY_KEYS = ["City", "city", "CITY"];
const ZIP_KEYS = ["Zip", "zip", "ZIP"];

function gp(obj: any, keys: string[], fallback = ""): string {
  for (const k of keys) {
    if (obj && obj[k] != null) return String(obj[k]);
  }
  return fallback;
}

/** Build candidate logo basenames (no extension). */
function retailerNameToCandidates(r: string): string[] {
  const raw = r.trim();
  const collapsed = raw.replace(/\s+/g, " ");
  const noSpaces = collapsed.replace(/\s+/g, "");
  const safe = collapsed.replace(/[^\w\- ]+/g, "");
  const dashed = collapsed.replace(/\s+/g, "-");
  const withLogo = `${collapsed} Logo`;
  const uniq = new Set([collapsed, withLogo, safe, dashed, noSpaces].filter(Boolean));
  return [...uniq];
}

/** Fetch image and return an ImageBitmap scaled into a transparent square (max=maxPx). */
async function fetchScaledBitmap(url: string, maxPx = 64): Promise<ImageBitmap> {
  const r = await fetch(url, { cache: "force-cache" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const blob = await r.blob();
  const bmp = await createImageBitmap(blob);

  const ratio = Math.min(maxPx / bmp.width, maxPx / bmp.height, 1);
  const w = Math.max(1, Math.round(bmp.width * ratio));
  const h = Math.max(1, Math.round(bmp.height * ratio));

  if (typeof OffscreenCanvas !== "undefined") {
    const oc = new OffscreenCanvas(maxPx, maxPx);
    const ctx = oc.getContext("2d")!;
    ctx.clearRect(0, 0, maxPx, maxPx);
    const dx = Math.floor((maxPx - w) / 2);
    const dy = Math.floor((maxPx - h) / 2);
    ctx.drawImage(bmp, dx, dy, w, h);
    // @ts-ignore
    const scaled = oc.transferToImageBitmap ? oc.transferToImageBitmap() : await createImageBitmap(oc as any);
    return scaled;
  } else {
    const c = document.createElement("canvas");
    c.width = maxPx;
    c.height = maxPx;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, maxPx, maxPx);
    const dx = Math.floor((maxPx - w) / 2);
    const dy = Math.floor((maxPx - h) / 2);
    ctx.drawImage(bmp, dx, dy, w, h);
    const scaled = await createImageBitmap(c);
    return scaled;
  }
}

/** Create a small colored dot ImageData as a logo fallback. */
function makeDot(color: string): ImageData {
  const size = 24;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  let canvas: any;
  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(size, size);
    ctx = canvas.getContext("2d");
  } else {
    canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    ctx = canvas.getContext("2d");
  }
  if (!ctx) return new ImageData(1, 1);
  ctx.clearRect(0, 0, size, size);
  (ctx as any).beginPath();
  (ctx as any).arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  (ctx as any).fillStyle = color;
  (ctx as any).fill();
  return (ctx as any).getImageData(0, 0, size, size);
}

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
  const loadedLogos = useRef<Set<string>>(new Set()); // image ids already added

  /** Extract unique retailer names present in current data. */
  const retailersInData = useMemo(() => {
    const s = new Set<string>();
    for (const f of data.features) {
      const r = gp(f.properties, RETAILER_KEYS).trim();
      if (r) s.add(r);
    }
    return [...s];
  }, [data]);

  /** Initialize map once */
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
                attribution:
                  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
              },
            },
            layers: [{ id: "osm-tiles", type: "raster", source: "osm-tiles" }],
          } as any,
      center: [-97.2, 40.8],
      zoom: 4,
      attributionControl: true,
      cooperativeGestures: true,
      pitchWithRotate: false,
      dragRotate: false,
    });

    // Restore projection toggle (only when token is present; OSM fallback can't do globe)
    if (token) {
      try {
        m.addControl(new (mapboxgl as any).ProjectionControl({ default: "mercator" }), "top-right");
      } catch {
        // ignore if control not available in current mapbox-gl build
      }
    }

    // Prevent default double-click zoom so dblclick can set Home
    m.doubleClickZoom.disable();

    m.on("load", () => {
      // Source with clustering
      if (!m.getSource("retailers")) {
        m.addSource("retailers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });
      }

      // Cluster circles
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
              "#60a5fa",
              10,
              "#3b82f6",
              30,
              "#1d4ed8",
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16,
              10,
              22,
              30,
              28,
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

      // Kingpin ring (under logos)
      if (!m.getLayer("kingpin-ring")) {
        m.addLayer(
          {
            id: "kingpin-ring",
            type: "circle",
            source: "retailers",
            filter: [
              "all",
              ["!", ["has", "point_count"]],
              ["==", ["get", "Category"], "Kingpin"],
            ],
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                4,
                6,
                10,
                9,
                14,
                12,
              ],
              "circle-color": "rgba(239,68,68,0.22)",
              "circle-stroke-color": "#ef4444",
              "circle-stroke-width": 2,
            },
          },
          "clusters"
        );
      }

      // Dots (unclustered)
      if (!m.getLayer("unclustered")) {
        m.addLayer({
          id: "unclustered",
          type: "circle",
          source: "retailers",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              4,
              4,
              10,
              6,
              14,
              8,
            ],
            "circle-color": [
              "case",
              ["==", ["get", "Category"], "Kingpin"],
              "#ef4444", // red for kingpins
              "#3b82f6", // default blue
            ],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#0f172a",
          },
        });
      }

      // Logos (symbol layer)
      if (!m.getLayer("retailer-logos")) {
        m.addLayer({
          id: "retailer-logos",
          type: "symbol",
          source: "retailers",
          filter: ["!", ["has", "point_count"]],
          layout: {
            "icon-image": ["get", "__iconId"], // per-feature image id
            "icon-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              4,
              0.35,
              10,
              0.45,
              14,
              0.55,
            ],
            "icon-allow-overlap": true,
            "icon-optional": true,
          },
          paint: {
            "icon-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              4,
              0.95,
              16,
              0.85,
              19,
              0.70,
            ],
          },
        });
      }

      // Home marker
      if (!m.getSource("home-pt")) {
        m.addSource("home-pt", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!m.getLayer("home-pt")) {
        m.addLayer({
          id: "home-pt",
          type: "circle",
          source: "home-pt",
          paint: {
            "circle-radius": 7,
            "circle-color": "#22c55e",
            "circle-stroke-color": "#052e16",
            "circle-stroke-width": 2,
          },
        });
      }

      // Stops layer
      if (!m.getSource("stops-pt")) {
        m.addSource("stops-pt", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!m.getLayer("stops-pt")) {
        m.addLayer({
          id: "stops-pt",
          type: "circle",
          source: "stops-pt",
          paint: {
            "circle-radius": 6,
            "circle-color": "#eab308",
            "circle-stroke-color": "#713f12",
            "circle-stroke-width": 2,
          },
        });
      }

      // Route layer
      if (!m.getSource("route")) {
        m.addSource("route", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!m.getLayer("route")) {
        m.addLayer({
          id: "route",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#22c55e",
            "line-width": 4,
            "line-opacity": 0.9,
          },
        });
      }

      // Interactions (popups, clicks)
      const showPopup = (e: MapLayerMouseEvent) => {
        const f: any = e.features && e.features[0];
        if (!f) return;
        const p = f.properties || {};
        const r = gp(p, RETAILER_KEYS);
        const nm = gp(p, NAME_KEYS);
        const cat = gp(p, CAT_KEYS);
        const st = gp(p, STATE_KEYS);
        const addr = gp(p, ADDR_KEYS);
        const city = gp(p, CITY_KEYS);
        const zip = gp(p, ZIP_KEYS);

        const html = `
          <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto; font-size: 12px;">
            <div style="font-weight:700; margin-bottom:4px">${r || "Retailer"}</div>
            ${nm ? `<div>${nm}</div>` : ""}
            ${cat ? `<div><b>${cat}</b></div>` : ""}
            ${[addr, city, zip].filter(Boolean).join(", ")}
          </div>
        `;
        if (!popupRef.current) {
          popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
        }
        popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(m);
      };
      const hidePopup = () => popupRef.current?.remove();

      ["unclustered", "retailer-logos"].forEach((layerId) => {
        m.on("mouseenter", layerId, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layerId, () => {
          m.getCanvas().style.cursor = "";
          hidePopup();
        });
        m.on("mousemove", layerId, (ev) => showPopup(ev as MapLayerMouseEvent));
        m.on("click", layerId, (e: any) => {
          hidePopup();
          const f: any = e.features && e.features[0];
          const c: any = f?.geometry?.coordinates;
          if (isLngLat(c)) {
            const title = gp(f.properties || {}, NAME_KEYS) || gp(f.properties || {}, RETAILER_KEYS);
            onPointClick?.([c[0], c[1]], title);
          }
        });
      });

      // Zoom into clusters on click
      m.on("click", "clusters", (e) => {
        const features = m.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const clusterId = features[0].properties?.cluster_id;
        const source: any = m.getSource("retailers");
        source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          m.easeTo({ center: (features[0].geometry as any).coordinates, zoom });
        });
      });

      // Set Home on double click
      m.on("dblclick", (e) => onMapDblClick?.([e.lngLat.lng, e.lngLat.lat]));

      mapRef.current = m;
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** We avoid setStyle at runtime to keep layers intact. */
  useEffect(() => {
    // no-op by design
  }, [basemap, token]);

  /** Load data, annotate features with icon ids, feed source, and preload logos (scaled). */
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const src = m.getSource("retailers") as mapboxgl.GeoJSONSource;
    if (!src) return;

    const fc: FC = {
      type: "FeatureCollection",
      features: data.features.map((f) => {
        const r = gp(f.properties, RETAILER_KEYS).trim();
        const iconId = r ? `logo-${r.toLowerCase().replace(/\s+/g, "_")}` : "";
        return {
          type: "Feature",
          geometry: f.geometry,
          properties: { ...f.properties, __iconId: iconId },
        };
      }),
    };

    src.setData(fc as any);

    // Fit bounds (if provided)
    if (bbox && isFinite(bbox[0])) {
      try {
        m.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 60, duration: 600 }
        );
      } catch {}
    }

    // Preload logos, scaled to 64×64
    const doLoad = async () => {
      for (const r of retailersInData) {
        const id = `logo-${r.toLowerCase().replace(/\s+/g, "_")}`;
        if (loadedLogos.current.has(id)) continue;

        // Try candidate filenames in /public/icons
        const bases = retailerNameToCandidates(r);
        const candidates: string[] = [];
        for (const b of bases) {
          const enc = encodeURIComponent(b);
          candidates.push(`${basePath}/icons/${enc}.png`);
          candidates.push(`${basePath}/icons/${enc}.jpg`);
          candidates.push(`${basePath}/icons/${enc}.jpeg`);
          // raw (no encode) as last resort
          candidates.push(`${basePath}/icons/${b}.png`);
          candidates.push(`${basePath}/icons/${b}.jpg`);
          candidates.push(`${basePath}/icons/${b}.jpeg`);
        }

        let added = false;
        for (const url of candidates) {
          try {
            const scaled = await fetchScaledBitmap(url, 64);
            if (!m.hasImage(id)) m.addImage(id, scaled, { pixelRatio: 1 });
            loadedLogos.current.add(id);
            added = true;
            break;
          } catch {
            // try next
          }
        }

        // If none worked, add a colored dot fallback as the image id
        if (!added && !m.hasImage(id)) {
          m.addImage(id, makeDot("#3b82f6"));
          loadedLogos.current.add(id);
        }
      }
    };
    doLoad();
  }, [data, bbox, retailersInData, basePath, markerStyle]);

  /** Toggle visibility between dots & logos (ring shows only with logos). */
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const setVis = (id: string, v: "visible" | "none") => {
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", v);
    };
    const dotsOn = markerStyle === "dots";
    setVis("unclustered", dotsOn ? "visible" : "none");
    setVis("retailer-logos", dotsOn ? "none" : "visible");
    setVis("kingpin-ring", dotsOn ? "none" : "visible");
  }, [markerStyle]);

  /** Update Home / stops / route overlays */
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const homeSrc = m.getSource("home-pt") as mapboxgl.GeoJSONSource;
    if (homeSrc) {
      homeSrc.setData({
        type: "FeatureCollection",
        features: home
          ? [{ type: "Feature", geometry: { type: "Point", coordinates: home }, properties: {} }]
          : [],
      } as any);
    }

    const stopsSrc = m.getSource("stops-pt") as mapboxgl.GeoJSONSource;
    if (stopsSrc) {
      stopsSrc.setData({
        type: "FeatureCollection",
        features: stops.map((s) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: s.coord },
          properties: {},
        })),
      } as any);
    }

    const routeSrc = m.getSource("route") as mapboxgl.GeoJSONSource;
    if (routeSrc) {
      routeSrc.setData(routeGeoJSON || { type: "FeatureCollection", features: [] });
    }
  }, [home, stops, routeGeoJSON]);

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
