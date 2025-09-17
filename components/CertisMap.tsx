"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl, { Map, Popup } from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN || "";

interface CertisMapProps {
  categoryColors: Record<string, string>;
  selectedCategories: string[];
  onAddStop: (stop: string) => void;
}

export default function CertisMap({
  categoryColors,
  selectedCategories,
  onAddStop,
}: CertisMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<Popup | null>(null);

  const [geojson, setGeojson] = useState<any>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-93.6091, 41.6005], // Midwest center
      zoom: 5,
      projection: { name: "mercator" },
    });

    mapRef.current = map;

    map.on("load", () => {
      fetch("/data/retailers.geojson")
        .then((res) => res.json())
        .then((data) => {
          setGeojson(data);

          // Source
          map.addSource("retailers", {
            type: "geojson",
            data,
          });

          // Base layer for all non-Kingpin retailers
          map.addLayer({
            id: "retailers-circle",
            type: "circle",
            source: "retailers",
            filter: ["!=", ["get", "category"], "Kingpin"],
            paint: {
              "circle-radius": 6,
              "circle-color": [
                "coalesce",
                ["get", "color"],
                "#007cbf",
              ],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });

          // Kingpin overlay layer (always on top)
          map.addLayer({
            id: "kingpins-circle",
            type: "circle",
            source: "retailers",
            filter: ["==", ["get", "category"], "Kingpin"],
            paint: {
              "circle-radius": 8,
              "circle-color": "#ff0000",   // red fill
              "circle-stroke-color": "#ffff00", // yellow outline
              "circle-stroke-width": 2,
            },
          });
        });
    });

    return () => {
      map.remove();
    };
  }, [categoryColors]);

  // Filtering logic — Kingpins stay visible
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;

    const filtered = {
      ...geojson,
      features: geojson.features.filter((f: any) => {
        const category = f.properties.category;
        if (category === "Kingpin") return true; // always keep Kingpins
        return selectedCategories.includes(category);
      }),
    };

    (map.getSource("retailers") as mapboxgl.GeoJSONSource)?.setData(filtered);
  }, [selectedCategories, geojson]);

  // Hover popup
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
    });
    popupRef.current = popup;

    const showPopup = (e: mapboxgl.MapMouseEvent & { features?: any[] }) => {
      map.getCanvas().style.cursor = "pointer";

      const feature = e.features?.[0];
      if (!feature) return;

      const { name, address, category, supplier, logo } = feature.properties;

      const logoHtml = logo
        ? `<img src="/icons/${logo}" alt="${name}" style="width:40px;height:40px;object-fit:contain;margin-bottom:4px;" />`
        : "";

      const html = `
        <div style="font-family:sans-serif;max-width:200px;">
          ${logoHtml}
          <div style="font-weight:bold;font-size:14px;">${name}</div>
          <div style="font-size:12px;">${address || ""}</div>
          <div style="font-size:12px;">Category: ${category || ""}</div>
          <div style="font-size:12px;">Supplier: ${supplier || ""}</div>
        </div>
      `;

      popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
    };

    const hidePopup = () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    };

    // Apply hover to both layers
    map.on("mousemove", "retailers-circle", showPopup);
    map.on("mousemove", "kingpins-circle", showPopup);
    map.on("mouseleave", "retailers-circle", hidePopup);
    map.on("mouseleave", "kingpins-circle", hidePopup);

    return () => {
      map.off("mousemove", "retailers-circle", showPopup);
      map.off("mousemove", "kingpins-circle", showPopup);
      map.off("mouseleave", "retailers-circle", hidePopup);
      map.off("mouseleave", "kingpins-circle", hidePopup);
    };
  }, []);

  return <div ref={mapContainerRef} className="w-full h-full" />;
}
