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
}) {
  const { basePath, token, basemap, markerStyle, data, bbox } = props;

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
        projection: "mercator",
      });
      mapRef.current = map;

      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
        maxWidth: "320px",
      });

      function ensureLayers() {
        // Source
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

        // Cluster layers
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

        // Dots (always available)
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

        // Prepare icon name on features
        for (const f of data.features) {
          const r = String(f?.properties?.__retailerName || "").trim();
          const key = r
            .toLowerCase()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-");
          f.properties.__iconName = `retailer-${key}`;
        }

        const registerImages = async () => {
          const tryLoad = (url: string) =>
            new Promise<HTMLImageElement | null>((res) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload = () => res(img);
              img.onerror = () => res(null);
              img.src = url;
            });

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

            let image: HTMLImageElement | ImageBitmap | null = await tryLoad(png);
            if (!image) image = await tryLoad(jpg);

            if (!image) {
              // TS-safe fallback: tiny transparent ImageData
              const empty = new ImageData(8, 8);
              try {
                map.addImage(name, empty, { pixelRatio: 2 });
              } catch {}
              return;
            }

            try {
              map.addImage(name, image as any, { pixelRatio: 2 });
            } catch {}
          });

          await Promise.all(jobs);

          // Logos with safe scaling; hide at extreme zoom
          if (!map.getLayer("logos")) {
            map.addLayer({
              id: "logos",
              type: "symbol",
              source: "retailers",
              filter: [
                "all",
                ["!", ["has", "point_count"]],
                ["<", ["zoom"], 15], // prevent giant sprites
              ],
              layout: {
                "icon-image": ["get", "__iconName"],
                "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.12, 8, 0.18, 12, 0.24, 14, 0.28],
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "visibility": markerStyle === "logos" ? "visible" : "none",
              },
            });
          } else {
            map.setLayoutProperty("logos", "visibility", markerStyle === "logos" ? "visible" : "none");
          }
        };

        registerImages();

        // Hover popup handlers (bind once)
        if (!handlersBoundRef.current) {
          handlersBoundRef.current = true;

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

          ["dots", "logos"].forEach((layer) => {
            map.on("mouseenter", layer, showPopup);
            map.on("mousemove", layer, showPopup);
            map.on("mouseleave", layer, hidePopup);
          });

          map.on("click", "clusters", (e: any) => {
            const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
            const clusterId = features?.[0]?.properties?.cluster_id;
            const source = map.getSource("retailers") as any;
            if (!clusterId || !source?.getClusterExpansionZoom) return;
            source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
              if (err) return;
              const center = features[0].geometry.coordinates as [number, number];
              map.easeTo({ center, zoom });
            });
          });
        }
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

      map.on("style.load", () => ensureLayers());
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource("retailers")) (map.getSource("retailers") as any).setData(data as any);
    if (map.getLayer("dots"))
      map.setLayoutProperty("dots", "visibility", markerStyle === "dots" ? "visible" : "none");
    if (map.getLayer("logos"))
      map.setLayoutProperty("logos", "visibility", markerStyle === "logos" ? "visible" : "none");
  }, [data, markerStyle]);

  return <div ref={mapEl} style={{ position: "absolute", inset: 0 }} />;
}
