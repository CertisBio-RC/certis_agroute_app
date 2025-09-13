"use client";

import { useEffect, useMemo, useRef } from "react";

type FC = { type: "FeatureCollection"; features: any[] };

export default function Map(props: {
  basePath: string;
  token: string;
  basemap: "hybrid" | "streets";
  markerStyle: "dots" | "logos";
  data: FC;
  bbox: [number, number, number, number] | null;

  /* Trip planner props */
  home: [number, number] | null; // [lng,lat]
  stops: Array<{ coord: [number, number]; title: string }>;
  routeGeoJSON: any | null;

  onMapDblClick?: (lnglat: [number, number]) => void;
  onPointClick?: (lnglat: [number, number], title: string) => void;
}) {
  const {
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
  } = props;

  const mapRef = useRef<any>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapboxglRef = useRef<any>(null);
  const popupRef = useRef<any>(null);
  const handlersBoundRef = useRef(false);

  const uniqueRetailers = useMemo(() => {
    const s = new Set<string>();
    for (const f of data.features) {
      const n = String(f?.properties?.__retailerName || "").trim();
      if (n) s.add(n);
    }
    return Array.from(s);
  }, [data]);

  // utils
  const loadImage = (url: string) =>
    new Promise<HTMLImageElement | null>((res) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = url;
    });
  const resizeToMax = (img: HTMLImageElement, maxSide = 96) => {
    const r = img.width / img.height;
    let w = img.width;
    let h = img.height;
    if (w > h) {
      if (w > maxSide) {
        w = maxSide;
        h = Math.round(maxSide / r);
      }
    } else {
      if (h > maxSide) {
        h = maxSide;
        w = Math.round(maxSide * r);
      }
    }
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.floor(w));
    c.height = Math.max(1, Math.floor(h));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c;
  };

  useEffect(() => {
    (async () => {
      const mod = await import("mapbox-gl");
      const mapboxgl = (mapboxglRef.current = mod.default || (mod as any));
      const hasToken = !!token;
      if (hasToken) mapboxgl.accessToken = token;

      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {}
        mapRef.current = null;
      }

      const style = hasToken
        ? basemap === "hybrid"
          ? "mapbox://styles/mapbox/satellite-streets-v12"
          : "mapbox://styles/mapbox/streets-v12"
        : {
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: [
                  "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
                ],
                tileSize: 256,
                attribution: "© OpenStreetMap contributors",
              },
            },
            layers: [{ id: "osm", type: "raster", source: "osm" }],
          };

      const map = new mapboxgl.Map({
        container: mapEl.current as HTMLDivElement,
        style,
        center: [-96.7, 41.5],
        zoom: 5,
        cooperativeGestures: true,
        attributionControl: true,
        projection: "mercator", // flat
      });
      mapRef.current = map;

      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
        maxWidth: "320px",
      });

      // Build sources/layers
      function ensureLayers() {
        // retailers source
        if (!map.getSource("retailers")) {
          map.addSource("retailers", {
            type: "geojson",
            data,
            cluster: true,
            clusterRadius: 42,
            clusterMaxZoom: 11,
          });
        } else {
          (map.getSource("retailers") as any).setData(data as any);
        }

        // cluster bubbles
        if (!map.getLayer("clusters")) {
          map.addLayer({
            id: "clusters",
            type: "circle",
            source: "retailers",
            filter: ["has", "point_count"],
            paint: {
              "circle-radius": ["step", ["get", "point_count"], 14, 25, 20, 100, 28],
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
              "circle-color": ["step", ["get", "point_count"], "#5B8DEF", 25, "#3FB07C", 100, "#F28B2E"],
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
              "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            },
            paint: { "text-color": "#ffffff" },
          });
        }

        // dots
        if (!map.getLayer("dots")) {
          map.addLayer({
            id: "dots",
            type: "circle",
            source: "retailers",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-radius": 6,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
              "circle-color": "#1C7CFF",
            },
            layout: { visibility: markerStyle === "dots" ? "visible" : "none" },
          });
        } else {
          map.setLayoutProperty("dots", "visibility", markerStyle === "dots" ? "visible" : "none");
        }

        // set icon names on features
        for (const f of data.features) {
          const r = String(f?.properties?.__retailerName || "").trim();
          const key = r
            .toLowerCase()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-");
          f.properties.__iconName = `retailer-${key}`;
        }

        // register retailer images (pre-scaled)
        const registerImages = async () => {
          const jobs = uniqueRetailers.map(async (r) => {
            const key = r
              .toLowerCase()
              .replace(/[^\w\s-]/g, "")
              .replace(/\s+/g, "-");
            const name = `retailer-${key}`;
            if (map.hasImage(name)) return;

            const pretty = r.replace(/[\\/:*?"<>|]/g, " ").trim();
            const png = `${basePath}/icons/${pretty} Logo.png`;
            const jpg = `${basePath}/icons/${pretty} Logo.jpg`;

            let img = await loadImage(png);
            if (!img) img = await loadImage(jpg);

            if (!img) {
              const empty = new ImageData(8, 8);
              try {
                map.addImage(name, empty, { pixelRatio: 2 });
              } catch {}
              return;
            }

            const scaled = resizeToMax(img, 96);
            try {
              map.addImage(name, scaled as any, { pixelRatio: 2 });
            } catch {}
          });

          await Promise.all(jobs);

          // logos (hidden at ultra zoom to avoid big sprites)
          if (!map.getLayer("logos")) {
            map.addLayer({
              id: "logos",
              type: "symbol",
              source: "retailers",
              filter: [
                "all",
                ["!", ["has", "point_count"]],
                ["<", ["zoom"], 14],
              ],
              layout: {
                "icon-image": ["get", "__iconName"],
                "icon-size": ["interpolate", ["linear"], ["zoom"], 0, 0.14, 10, 0.16, 13.9, 0.18],
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "visibility": markerStyle === "logos" ? "visible" : "none",
              },
            });
          } else {
            map.setLayoutProperty("logos", "visibility", markerStyle === "logos" ? "visible" : "none");
          }

          bindHoverAndClickOnce(); // after layers exist
        };

        registerImages();

        // trip overlays: home, stops, route
        // home image (star) once
        if (!map.hasImage("home-star")) {
          const c = document.createElement("canvas");
          c.width = 64;
          c.height = 64;
          const g = c.getContext("2d")!;
          g.translate(32, 32);
          g.fillStyle = "#fbbf24";
          g.strokeStyle = "#ffffff";
          g.lineWidth = 3;
          const spikes = 5;
          const outerR = 20;
          const innerR = 8;
          g.beginPath();
          for (let i = 0; i < spikes * 2; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const a = (Math.PI / spikes) * i - Math.PI / 2;
            g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          g.closePath();
          g.fill();
          g.stroke();
          map.addImage("home-star", c as any, { pixelRatio: 2 });
        }

        if (!map.getSource("home-src")) {
          map.addSource("home-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        }
        if (!map.getLayer("home-layer")) {
          map.addLayer({
            id: "home-layer",
            type: "symbol",
            source: "home-src",
            layout: {
              "icon-image": "home-star",
              "icon-size": 0.6,
              "icon-allow-overlap": true,
            },
          });
        }

        if (!map.getSource("stops-src")) {
          map.addSource("stops-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        }
        if (!map.getLayer("stops-circles")) {
          map.addLayer({
            id: "stops-circles",
            type: "circle",
            source: "stops-src",
            paint: {
              "circle-radius": 9,
              "circle-color": "#0ea5e9",
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            },
          });
        }
        if (!map.getLayer("stops-labels")) {
          map.addLayer({
            id: "stops-labels",
            type: "symbol",
            source: "stops-src",
            layout: {
              "text-field": ["to-string", ["get", "order"]],
              "text-size": 12,
              "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            },
            paint: { "text-color": "#ffffff" },
          });
        }

        if (!map.getSource("route-src")) {
          map.addSource("route-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        }
        if (!map.getLayer("route-line")) {
          map.addLayer({
            id: "route-line",
            type: "line",
            source: "route-src",
            paint: {
              "line-width": 4,
              "line-color": "#22c55e",
              "line-opacity": 0.9,
            },
          });
        }
      }

      const showPopup = (e: any) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties || {};
        const retailer = p.Retailer || p.__retailerName || "Retailer";
        const name = p.Name || "";
        const addr = [p.Address, p.City, p.State, p.Zip].filter(Boolean).join(", ");
        const cat = p.Category ? `<div style="opacity:.8">${p.Category}</div>` : "";
        const html = `
          <div style="font: 12px/1.35 -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#111;">
            <div style="font-weight:700">${retailer}</div>
            ${name ? `<div>${name}</div>` : ""}
            ${addr ? `<div style="opacity:.8">${addr}</div>` : ""}
            ${cat}
          </div>`;
        const coords = f.geometry?.coordinates;
        if (!Array.isArray(coords)) return;
        popupRef.current.setLngLat(coords as [number, number]).setHTML(html).addTo(map);
        map.getCanvas().style.cursor = "pointer";
      };
      const hidePopup = () => {
        try {
          popupRef.current?.remove();
        } catch {}
        map.getCanvas().style.cursor = "";
      };

      function bindHoverAndClickOnce() {
        if (handlersBoundRef.current) return;
        if (!map.getLayer("dots") || !map.getLayer("logos")) return;

        ["dots", "logos"].forEach((layer) => {
          map.on("mouseenter", layer, showPopup);
          map.on("mousemove", layer, showPopup);
          map.on("mouseleave", layer, hidePopup);

          // click → add stop to planner
          map.on("click", layer, (e: any) => {
            const f = e?.features?.[0];
            const coords = f?.geometry?.coordinates;
            if (!Array.isArray(coords)) return;
            const p = f.properties || {};
            const title = p.Name || p.Retailer || "Stop";
            onPointClick?.(coords as [number, number], String(title));
          });
        });

        // click cluster to zoom
        map.on("click", "clusters", (e: any) => {
          const feats = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
          const clusterId = feats?.[0]?.properties?.cluster_id;
          const source = map.getSource("retailers") as any;
          if (!clusterId || !source?.getClusterExpansionZoom) return;
          source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
            if (err) return;
            const center = feats[0].geometry.coordinates as [number, number];
            map.easeTo({ center, zoom });
          });
        });

        // dblclick map → set Home
        map.on("dblclick", (e: any) => {
          if (!onMapDblClick) return;
          const ll = e?.lngLat;
          if (!ll) return;
          onMapDblClick([ll.lng, ll.lat]);
        });

        handlersBoundRef.current = true;
      }

      map.on("load", () => {
        ensureLayers();
        if (bbox) {
          map.fitBounds(
            [
              [bbox[0], bbox[1]],
              [bbox[2], bbox[3]],
            ],
            { padding: 40, duration: 0 }
          );
        }
      });

      map.on("style.load", () => {
        handlersBoundRef.current = false;
        ensureLayers();
      });
    })();

    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {}
        mapRef.current = null;
      }
      handlersBoundRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, basemap]);

  // update retailers + visibility when props change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource("retailers")) (map.getSource("retailers") as any).setData(data as any);
    if (map.getLayer("dots"))
      map.setLayoutProperty("dots", "visibility", markerStyle === "dots" ? "visible" : "none");
    if (map.getLayer("logos"))
      map.setLayoutProperty("logos", "visibility", markerStyle === "logos" ? "visible" : "none");
  }, [data, markerStyle]);

  // update trip overlays (home, stops, route)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // home
    const homeFC =
      home && Array.isArray(home)
        ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: home }, properties: {} }] }
        : { type: "FeatureCollection", features: [] };
    (map.getSource("home-src") as any)?.setData(homeFC);

    // stops
    const stopsFC = {
      type: "FeatureCollection",
      features: (stops || []).map((s, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: s.coord },
        properties: { order: i + 1, title: s.title || "" },
      })),
    };
    (map.getSource("stops-src") as any)?.setData(stopsFC);

    // route
    const routeFC =
      routeGeoJSON && routeGeoJSON.type
        ? { type: "FeatureCollection", features: [routeGeoJSON] }
        : { type: "FeatureCollection", features: [] };
    (map.getSource("route-src") as any)?.setData(routeFC);
  }, [home, stops, routeGeoJSON]);

  return <div ref={mapEl} style={{ position: "absolute", inset: 0 }} />;
}
