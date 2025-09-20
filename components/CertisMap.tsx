// components/CertisMap.tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface CertisMapProps {
  onAddStop?: (name: string) => void;
}

const SOURCE_ID = "agroute-src";
const LAYER_ID = "agroute-layer";

export default function CertisMap({ onAddStop }: CertisMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12", // default basemap
      center: [-93.5, 41.9],
      zoom: 4.3,
      attributionControl: true,
    });

    mapRef.current = map;

    map.on("load", () => {
      // Load Certis logo image from /public
      map.loadImage("/certis-logo.png", (error, image) => {
        if (error) {
          console.error("Error loading logo image:", error);
          return;
        }
        if (!map.hasImage("certis-logo") && image) {
          map.addImage("certis-logo", image);
        }

        // Add source
        if (!map.getSource(SOURCE_ID)) {
          map.addSource(SOURCE_ID, {
            type: "geojson",
            data: "/data/retailers.geojson",
          });
        }

        // Add symbol layer with logo icon
        if (!map.getLayer(LAYER_ID)) {
          map.addLayer({
            id: LAYER_ID,
            type: "symbol",
            source: SOURCE_ID,
            layout: {
              "icon-image": "certis-logo",
              "icon-size": 0.08, // adjust size to match your logo
              "icon-allow-overlap": true,
              "text-field": ["get", "name"],
              "text-offset": [0, 1.2],
              "text-anchor": "top",
              "text-size": 10,
            },
            paint: {
              "text-color": "#111827",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1,
            },
          });
        }

        // Click handler → add stop + zoom
        map.on("click", LAYER_ID, (e) => {
          const feat = e.features && e.features[0];
          const name = (feat?.properties as any)?.name as string | undefined;
          if (name && onAddStop) onAddStop(name);

          if (feat?.geometry?.type === "Point") {
            const [lng, lat] = (feat.geometry as any).coordinates;
            map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 7) });
          }
        });

        // Change cursor on hover
        map.on("mouseenter", LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
        });
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onAddStop]);

  return (
    <div ref={mapContainer} className="h-full w-full rounded-2xl overflow-hidden" />
  );
}
