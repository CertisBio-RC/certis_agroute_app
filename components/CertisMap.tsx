"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl, { Map, Popup } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN || "";

interface RetailerFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    name: string;
    address?: string;
    category?: string;
    supplier?: string;
    logo?: string;
  };
}

export default function CertisMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<RetailerFeature | null>(null);

  useEffect(() => {
    if (mapRef.current) return; // prevent re-init

    const map = new mapboxgl.Map({
      container: mapContainer.current as HTMLDivElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-93.6091, 41.6005], // Des Moines as default center
      zoom: 5,
      projection: "mercator", // force Mercator
    });

    mapRef.current = map;

    map.on("load", () => {
      // Load GeoJSON points
      map.addSource("retailers", {
        type: "geojson",
        data: "/data/retailers.geojson",
      });

      map.addLayer({
        id: "retailers-layer",
        type: "circle",
        source: "retailers",
        paint: {
          "circle-radius": 6,
          "circle-color": "#ff6600",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
        },
      });

      // Hover logic
      map.on("mousemove", "retailers-layer", (e) => {
        if (e.features?.length) {
          const feature = e.features[0] as any;
          setHoveredFeature(feature);
        }
      });

      map.on("mouseleave", "retailers-layer", () => {
        setHoveredFeature(null);
      });
    });
  }, []);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={mapContainer} style={{ height: "100%", width: "100%" }} />

      {/* Hover Popup */}
      {hoveredFeature && (
        <Popup
          longitude={hoveredFeature.geometry.coordinates[0]}
          latitude={hoveredFeature.geometry.coordinates[1]}
          closeButton={false}
          closeOnClick={false}
          anchor="top"
        >
          <div style={{ minWidth: "180px" }}>
            {hoveredFeature.properties.logo && (
              <img
                src={`/icons/${hoveredFeature.properties.logo}`}
                alt={hoveredFeature.properties.supplier || "logo"}
                style={{ height: "24px", marginBottom: "4px" }}
              />
            )}
            <strong>{hoveredFeature.properties.name}</strong>
            <br />
            {hoveredFeature.properties.address && (
              <>
                {hoveredFeature.properties.address}
                <br />
              </>
            )}
            {hoveredFeature.properties.category && (
              <>
                {hoveredFeature.properties.category}
                <br />
              </>
            )}
            {hoveredFeature.properties.supplier && (
              <>{hoveredFeature.properties.supplier}</>
            )}
          </div>
        </Popup>
      )}
    </div>
  );
}
