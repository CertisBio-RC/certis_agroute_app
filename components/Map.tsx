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

      // Destroy previous map, if any
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
        projection: "mercator", // force flat map
      });
      mapRef.current = map;

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

        // Unclustered dots (always available)
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

        // Preload retailer images (png → jpg fallback) then add logo layer
        const addOrUpdateLogoLayer = () => {
          if (!map.getLayer("logos")) {
            map.addLayer({
              id: "logos",
              type: "symbol",
              source: "retailers",
              filter: [
                "all",
                ["!", ["has", "point_count"]],
                ["<", ["zoom"], 15], // hide logos at extreme zoom to prevent giant sprites
              ],
              layout: {
                "icon-image": ["get", "__iconName"], // set on feature via data-driven property
                // Size curve caps growth; big originals become small, never screen-filling
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

        // Set data-driven icon name property (e.g., "retailer-central-valley-ag")
        // and register the corresponding sprite images once per retailer.
        for (const f of data.features) {
          const r = String(f?.properties?.__retailerName || "").trim();
          const key = r
            .toLowerCase()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-");
          f.properties.__iconName = `retailer-${key}`;
        }

        const registerImages = async () => {
          const promises = uniqueRetailers.map(async (r) => {
            const key = r
              .toLowerCase()
              .replace(/[^\w\s-]/g, "")
              .replace(/\s+/g, "-");
            const name = `retailer-${key}`;
            if (map.hasImage(name)) return;

            const tryLoad = (url: string) =>
              new Promise<HTMLImageElement | null>((res) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => res(img);
                img.onerror = () => res(null);
                img.src = url;
              });

            // Look for "<Retailer> Logo.(png|jpg)" under /icons/
            const pretty = r.replace(/[\\/:*?"<>|]/g, " ").trim();
            const png = `${basePath}/icons/${pretty} Logo.png`;
            const jpg = `${basePath}/icons/${pretty} Logo.jpg`;

            let image = await tryLoad(png);
            if (!image) image = await tryLoad(jpg);

            // Fallback: tiny transparent dot prevents missing-image warnings
            if (!image) {
              const c = document.createElement("canvas");
              c.width = 8;
              c.height = 8;
              image = c;
            }
            try {
              map.addImage(name, image as any, { pixelRatio: 2 });
            } catch {}
          });

          await Promise.all(promises);
          addOrUpdateLogoLayer();
        };

        registerImages();
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, basemap]);

  // Update data + visibility when filters/markerStyle change
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
