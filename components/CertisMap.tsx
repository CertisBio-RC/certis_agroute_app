"use client";
import React, { useEffect, useRef, useState } from "react";
import mapboxgl, { Map, Popup } from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string;

type CertisMapProps = {
  categoryColors: Record<string, string>;
  selectedCategories: string[];
  onAddStop: (stop: string) => void;
};

export default function CertisMap({
  categoryColors,
  selectedCategories,
  onAddStop,
}: CertisMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<Popup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-v9",
      center: [-93.6091, 41.6005],
      zoom: 4,
    });

    mapRef.current = map;

    map.on("load", () => {
      map.addSource("retailers", {
        type: "geojson",
        data: "/certis_agroute_app/data/retailers.geojson",
      });

      map.addLayer({
        id: "retailers-layer",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "category"], "Kingpin"],
            8,
            6,
          ],
          "circle-color": [
            "case",
            ["==", ["get", "category"], "Kingpin"],
            "#FF0000",
            ["match", ["get", "category"],
              Object.keys(categoryColors),
              ["get", "color"],
              "#888888"
            ]
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "category"], "Kingpin"],
            2,
            1,
          ],
          "circle-stroke-color": [
            "case",
            ["==", ["get", "category"], "Kingpin"],
            "#FFFF00",
            "#000000",
          ],
        },
      });

      // Hover popup
      map.on("mousemove", "retailers-layer", (e) => {
        if (!e.features?.length) return;
        const f = e.features[0];

        if (!popupRef.current) {
          popupRef.current = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
          });
        }

        const { name, address, category, supplier, retailer } = f.properties as any;

        const html = `
          <div style="font-size: 14px;">
            <img src="/icons/${retailer}.png" alt="${retailer}" style="width:40px;height:40px;" />
            <div><b>${name}</b></div>
            <div>${address}</div>
            <div><b>Category:</b> ${category}</div>
            <div><b>Supplier:</b> ${supplier}</div>
          </div>
        `;

        popupRef.current
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);
      });

      map.on("mouseleave", "retailers-layer", () => {
        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
      });

      // Click -> Add to trip builder
      map.on("click", "retailers-layer", (e) => {
        if (!e.features?.length) return;
        const f = e.features[0];
        const { name } = f.properties as any;
        onAddStop(name);
      });
    });

    return () => {
      map.remove();
    };
  }, [categoryColors, selectedCategories, onAddStop]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
}
