// components/CertisMap.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl, { LngLatLike, Map } from "mapbox-gl";
import { withBasePath } from "@/utils/paths";

type Stop = { id: string; name: string; lon: number; lat: number };

type Props = {
  styleMode: "hybrid" | "street";
  onAddStop?: (s: Stop) => void;
};

const HYBRID = "mapbox://styles/mapbox/satellite-streets-v12";
const STREET = "mapbox://styles/mapbox/streets-v12";

// Category → color ramp (kept simple; matches your legend dots)
const CATEGORY_COLORS: Record<string, string> = {
  "Agronomy": "#2ecc71",
  "Agronomy/Grain": "#27ae60",
  "Distribution": "#9b59b6",
  "Grain": "#3498db",
  "Grain/Feed": "#1abc9c",
  "Kingpin": "#e74c3c",        // center fill; ring handled by a separate layer
  "Office/Service": "#f1c40f",
};

export default function CertisMap({ styleMode, onAddStop }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const styleURL = useMemo(() => (styleMode === "hybrid" ? HYBRID : STREET), [styleMode]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1) Token: env first; fallback to mapbox-token file
      const envToken = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN?.trim();
      let token = envToken;
      if (!token) {
        try {
          const res = await fetch(withBasePath("mapbox-token"));
          token = (await res.text()).trim();
        } catch {
          token = "";
        }
      }
      if (!token) {
        console.error("Mapbox token missing. Ensure NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN or /public/mapbox-token.");
        return;
      }
      mapboxgl.accessToken = token;

      if (cancelled || !containerRef.current) return;

      // 2) Build map
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: styleURL,
        center: [-93.5, 41.7] as LngLatLike, // IA-ish
        zoom: 5,
        cooperativeGestures: true,
        attributionControl: true,
        pitchWithRotate: false,
        dragRotate: false,
      });
      mapRef.current = map;

      // Keep mercator, always
      const applyMercator = () => {
        try {
          // @ts-ignore v3 still accepts projection setter
          map.setProjection("mercator");
        } catch {}
      };
      map.on("load", applyMercator);
      map.on("style.load", applyMercator);

      // 3) Retailers source
      const retailersUrl = withBasePath("data/retailers.geojson");

      map.on("load", async () => {
        // Clean any leftover layers/sources on re-init
        const safeRemove = (id: string) => {
          if (map.getLayer(id)) map.removeLayer(id);
          if (map.getSource(id)) map.removeSource(id);
        };

        safeRemove("retailers");
        safeRemove("clusters");
        safeRemove("cluster-count");
        safeRemove("retailer-points");
        safeRemove("retailer-kingpin-ring");
        safeRemove("retailer-kingpin-center");

        map.addSource("retailers", {
          type: "geojson",
          data: retailersUrl,
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 40,
          generateId: true,
        });

        // Clusters
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "retailers",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#3b82f6", // <= 10
              10,
              "#2563eb", // <= 25
              25,
              "#1d4ed8", // > 25
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              14, 10,
              18, 25,
              24
            ],
            "circle-opacity": 0.9
          }
        });

        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "retailers",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
            "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"]
          },
          paint: { "text-color": "#ffffff" }
        });

        // Unclustered retailer points (non-kingpin)
        map.addLayer({
          id: "retailer-points",
          type: "circle",
          source: "retailers",
          filter: ["all",
            ["!", ["has", "point_count"]],
            ["!=", ["get", "Category"], "Kingpin"]
          ],
          paint: {
            "circle-radius": 6,
            "circle-color": [
              "case",
              ["==", ["get", "Category"], "Agronomy"], CATEGORY_COLORS["Agronomy"],
              ["==", ["get", "Category"], "Agronomy/Grain"], CATEGORY_COLORS["Agronomy/Grain"],
              ["==", ["get", "Category"], "Distribution"], CATEGORY_COLORS["Distribution"],
              ["==", ["get", "Category"], "Grain"], CATEGORY_COLORS["Grain"],
              ["==", ["get", "Category"], "Grain/Feed"], CATEGORY_COLORS["Grain/Feed"],
              ["==", ["get", "Category"], "Office/Service"], CATEGORY_COLORS["Office/Service"],
              "#94a3b8" // neutral fallback
            ],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#0b1220"
          }
        });

        // Kingpin ring (always above clusters)
        map.addLayer({
          id: "retailer-kingpin-ring",
          type: "circle",
          source: "retailers",
          filter: ["all",
            ["!", ["has", "point_count"]],
            ["==", ["get", "Category"], "Kingpin"]
          ],
          paint: {
            "circle-radius": 9,
            "circle-color": "#00000000",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffd400" // yellow ring
          }
        });

        // Kingpin center
        map.addLayer({
          id: "retailer-kingpin-center",
          type: "circle",
          source: "retailers",
          filter: ["all",
            ["!", ["has", "point_count"]],
            ["==", ["get", "Category"], "Kingpin"]
          ],
          paint: {
            "circle-radius": 6,
            "circle-color": CATEGORY_COLORS["Kingpin"],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#0b1220"
          }
        });

        // Interaction — clusters expand
        map.on("click", "clusters", (e) => {
          const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
          const clusterId = features[0]?.properties?.cluster_id;
          if (clusterId == null) return;
          const src = map.getSource("retailers") as mapboxgl.GeoJSONSource;
          src.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({ center: (features[0].geometry as any).coordinates as LngLatLike, zoom });
          });
        });
        map.on("mousemove", "clusters", () => map.getCanvas().style.cursor = "pointer");
        map.on("mouseleave", "clusters", () => map.getCanvas().style.cursor = "");

        // Shared hover popup (unclustered + kingpin)
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 10
        });

        const hoverLayers = ["retailer-points", "retailer-kingpin-ring", "retailer-kingpin-center"];

        hoverLayers.forEach((ly) => {
          map.on("mousemove", ly, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const f = e.features?.[0];
            if (!f) return;
            const p = f.properties || {};
            const name = p["Name"] || p["Retailer"] || "Location";
            const city = p["City"] || "";
            const cat = p["Category"] || "";
            const logoKey = (p["Retailer"] || p["Name"] || "").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-");
            const iconUrl = withBasePath(`icons/${logoKey}.png`);

            const html = `
              <div style="display:flex;gap:8px;align-items:center">
                <img src="${iconUrl}" alt="" width="28" height="28" onerror="this.style.display='none'"/>
                <div style="line-height:1.2">
                  <div style="font-weight:600">${name}</div>
                  <div style="font-size:12px;opacity:0.8">${city} · ${cat}</div>
                  <div style="font-size:11px;opacity:0.7">Click to add to Trip</div>
                </div>
              </div>
            `;
            popupRef.current!
              .setLngLat((f.geometry as any).coordinates as [number, number])
              .setHTML(html)
              .addTo(map);
          });

          map.on("mouseleave", ly, () => {
            map.getCanvas().style.cursor = "";
            popupRef.current?.remove();
          });

          map.on("click", ly, (e) => {
            const f = e.features?.[0];
            if (!f || !onAddStop) return;
            const p = f.properties || {};
            const name = (p["Name"] || p["Retailer"] || "Location").toString();
            const [lon, lat] = (f.geometry as any).coordinates as [number, number];
            onAddStop({
              id: `${name}-${lon.toFixed(5)}-${lat.toFixed(5)}`,
              name,
              lon,
              lat
            });
          });
        });
      });
    }

    init();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [styleURL, onAddStop]);

  return (
    <div
      ref={containerRef}
      className="map-container"
      aria-label="Certis Retailer Map (Mercator)"
    />
  );
}
