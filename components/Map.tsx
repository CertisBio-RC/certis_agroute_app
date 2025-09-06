// /components/Map.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { FeatureCollection, Point, Feature } from "geojson";

mapboxgl.accessToken = ""; // we set it per-instance via props (safer for SSR)

type RetailerProps = Record<string, any>;
type Projection = "mercator" | "globe";

export type HomeLoc = { lng: number; lat: number; label?: string };

type Props = {
  data?: FeatureCollection<Point, RetailerProps>;
  markerStyle: "logo" | "color";
  showLabels?: boolean;
  labelColor?: string;
  mapStyle: string; // mapbox style URI
  projection: Projection;
  allowRotate: boolean;
  rasterSharpen?: boolean; // kept for compatibility; no-op for HTML markers
  mapboxToken: string;

  home: HomeLoc | null;
  enableHomePick?: boolean;
  onPickHome?: (lng: number, lat: number) => void;
};

const SRC_ID = "retailers-src";
const LYR_CLUSTER = "retailers-clusters";
const LYR_COUNT = "retailers-cluster-count";
const LYR_UNCLUSTERED = "retailers-unclustered";

/**
 * Small helper: run a function *after* the style is completely loaded.
 * If already loaded, runs immediately.
 */
function whenStyleLoaded(map: mapboxgl.Map, cb: () => void) {
  if (map.isStyleLoaded()) {
    cb();
  } else {
    const once = () => {
      map.off("style.load", once);
      cb();
    };
    map.on("style.load", once);
  }
}

/** Remove a layer if present */
function tryRemoveLayer(map: mapboxgl.Map, id: string) {
  if (map.getLayer(id)) {
    try {
      map.removeLayer(id);
    } catch {}
  }
}
/** Remove a source if present */
function tryRemoveSource(map: mapboxgl.Map, id: string) {
  if (map.getSource(id)) {
    try {
      map.removeSource(id);
    } catch {}
  }
}

/** Return retailer key for icon file lookup */
function getRetailerName(p: RetailerProps) {
  const r =
    (typeof p.retailer === "string" && p.retailer.trim()) ||
    (typeof p.Retailer === "string" && p.Retailer.trim()) ||
    "";
  return r;
}

const MapView: React.FC<Props> = ({
  data,
  markerStyle,
  showLabels = true,
  labelColor = "#fff200",
  mapStyle,
  projection,
  allowRotate,
  rasterSharpen = false,
  mapboxToken,
  home,
  enableHomePick = false,
  onPickHome,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // HTML markers (logos)
  const logoMarkersRef = useRef<mapboxgl.Marker[]>([]);
  // Home marker
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  // Pick handler
  const pickHandlerRef = useRef<(e: mapboxgl.MapMouseEvent) => void>();

  const validData = useMemo(() => data ?? null, [data]);

  /** Clear any HTML logo markers */
  function clearLogoMarkers() {
    for (const m of logoMarkersRef.current) {
      try {
        m.remove();
      } catch {}
    }
    logoMarkersRef.current = [];
  }

  /** Build the logo <img> marker element */
  function buildLogoEl(retailer: string) {
    const img = document.createElement("img");
    img.alt = retailer || "Retailer";
    img.style.width = "36px";
    img.style.height = "36px";
    img.style.objectFit = "contain";
    img.style.borderRadius = "50%";
    img.style.background = "#000"; // small pad looks cleaner on imagery
    img.style.padding = "2px";

    // Try .png first, then .jpg, then default
    // Place your icons in /public/icons/<Retailer> Logo.png (or .jpg)
    const makeSrc = (ext: "png" | "jpg") =>
      `/icons/${retailer.replace(/[<>:"/\\|?*]+/g, "")} Logo.${ext}`;

    img.src = makeSrc("png");
    img.onerror = () => {
      img.onerror = null;
      img.src = makeSrc("jpg");
      img.onerror = () => {
        img.src = "/icons/_default.png"; // ensure you have a small default icon
      };
    };
    return img;
  }

  /** Add HTML markers for logos (does not depend on style load) */
  function renderLogoMarkers() {
    const map = mapRef.current;
    if (!map || !validData) return;

    clearLogoMarkers();

    for (const f of validData.features) {
      const coords = f.geometry?.coordinates as [number, number] | undefined;
      if (!coords) continue;

      const p = f.properties || {};
      const retailer = getRetailerName(p);
      const el = buildLogoEl(retailer);

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(coords)
        .addTo(map);

      logoMarkersRef.current.push(marker);

      if (showLabels) {
        const label = document.createElement("div");
        label.textContent =
          (typeof p.name === "string" && p.name) ||
          (typeof p.Name === "string" && p.Name) ||
          retailer ||
          "";
        label.style.color = labelColor;
        label.style.fontSize = "11px";
        label.style.fontWeight = "600";
        label.style.textShadow =
          "0 0 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.8)";
        label.style.marginTop = "4px";
        const labelMarker = new mapboxgl.Marker({
          element: label,
          anchor: "top",
        })
          .setLngLat(coords)
          .addTo(map);
        logoMarkersRef.current.push(labelMarker);
      }
    }
  }

  /** Add vector cluster layers (waits for style) */
  function renderClusterLayers() {
    const map = mapRef.current;
    if (!map || !validData) return;

    whenStyleLoaded(map, () => {
      // Clean old
      tryRemoveLayer(map, LYR_COUNT);
      tryRemoveLayer(map, LYR_CLUSTER);
      tryRemoveLayer(map, LYR_UNCLUSTERED);
      tryRemoveSource(map, SRC_ID);

      map.addSource(SRC_ID, {
        type: "geojson",
        data: validData,
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 40,
      });

      // Clusters
      map.addLayer({
        id: LYR_CLUSTER,
        type: "circle",
        source: SRC_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#3b82f6", // <= 10
            10,
            "#10b981", // <= 30
            30,
            "#f59e0b", // > 30
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            14, // <= 10
            10,
            18, // <= 30
            30,
            24, // > 30
          ],
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1.5,
        },
      });

      // Cluster count
      map.addLayer({
        id: LYR_COUNT,
        type: "symbol",
        source: SRC_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        },
        paint: {
          "text-color": "#ffffff",
        },
      });

      // Unclustered points
      map.addLayer({
        id: LYR_UNCLUSTERED,
        type: "circle",
        source: SRC_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 6,
          "circle-color": "#22d3ee",
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1.5,
        },
      });

      // Zoom into clusters on click
      map.on("click", LYR_CLUSTER, (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [LYR_CLUSTER],
        });
        const clusterId = features[0]?.properties?.cluster_id;
        if (!clusterId) return;
        const src = map.getSource(SRC_ID) as mapboxgl.GeoJSONSource;
        src.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          if (!features[0]?.geometry) return;
          const center = (features[0].geometry as any).coordinates as [
            number,
            number
          ];
          map.easeTo({ center, zoom });
        });
      });

      map.on("mouseenter", LYR_CLUSTER, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", LYR_CLUSTER, () => {
        map.getCanvas().style.cursor = "";
      });
    });
  }

  // ---------- init map ----------
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    mapboxgl.accessToken = mapboxToken || "";
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      projection,
      center: [-98.5795, 39.8283], // CONUS default
      zoom: 4,
      cooperativeGestures: true,
      attributionControl: true,
    });
    mapRef.current = map;

    // basic UI
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }));
    map.addControl(new mapboxgl.FullscreenControl());

    // rotate / pitch policy
    if (!allowRotate) {
      map.dragRotate.disable();
      map.setPitch(0);
    } else {
      map.dragRotate.enable();
    }

    // If we change style externally, we'll rebuild layers in another effect
    return () => {
      // cleanup on unmount
      clearLogoMarkers();
      homeMarkerRef.current?.remove();
      try {
        map.remove();
      } catch {}
      mapRef.current = null;
    };
  }, [mapboxToken]); // one-time on token presence

  // ---------- react to style / projection changes ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // style change
    if (map.getStyle()?.sprite !== mapStyle) {
      map.setStyle(mapStyle);
    }

    // projection change
    try {
      map.setProjection(projection);
    } catch {}

    // (Re)render layers/markers once the new style is loaded
    whenStyleLoaded(map, () => {
      // Only the dot/cluster mode depends on style
      if (markerStyle === "color") {
        clearLogoMarkers();
        renderClusterLayers();
      } else {
        // logos mode uses HTML markers → no style dependency
        tryRemoveLayer(map, LYR_COUNT);
        tryRemoveLayer(map, LYR_CLUSTER);
        tryRemoveLayer(map, LYR_UNCLUSTERED);
        tryRemoveSource(map, SRC_ID);
        renderLogoMarkers();
      }
    });
  }, [mapStyle, projection]); // switch basemap / globe/flat

  // ---------- react to marker mode + data ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!validData) {
      // wipe everything if data missing
      clearLogoMarkers();
      whenStyleLoaded(map, () => {
        tryRemoveLayer(map, LYR_COUNT);
        tryRemoveLayer(map, LYR_CLUSTER);
        tryRemoveLayer(map, LYR_UNCLUSTERED);
        tryRemoveSource(map, SRC_ID);
      });
      return;
    }

    if (markerStyle === "logo") {
      clearLogoMarkers();
      whenStyleLoaded(map, () => {
        tryRemoveLayer(map, LYR_COUNT);
        tryRemoveLayer(map, LYR_CLUSTER);
        tryRemoveLayer(map, LYR_UNCLUSTERED);
        tryRemoveSource(map, SRC_ID);
      });
      renderLogoMarkers();
    } else {
      clearLogoMarkers();
      renderClusterLayers();
    }
  }, [markerStyle, validData, showLabels, labelColor]);

  // ---------- rotate/pitch policy ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!allowRotate) {
      map.dragRotate.disable();
      map.setPitch(0);
    } else {
      map.dragRotate.enable();
    }
  }, [allowRotate]);

  // ---------- Home marker ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!home) {
      homeMarkerRef.current?.remove();
      homeMarkerRef.current = null;
      return;
    }

    const el = document.createElement("div");
    el.textContent = "H";
    el.style.background = "#10b981";
    el.style.color = "#0b132b";
    el.style.width = "26px";
    el.style.height = "26px";
    el.style.display = "grid";
    el.style.placeItems = "center";
    el.style.borderRadius = "50%";
    el.style.fontWeight = "700";
    el.style.boxShadow = "0 0 0 2px #0f172a";

    if (homeMarkerRef.current) {
      homeMarkerRef.current.setLngLat([home.lng, home.lat]);
      // @ts-expect-error - v3 Marker doesn't expose setElement, rebuild instead
      homeMarkerRef.current.remove();
      homeMarkerRef.current = new mapboxgl.Marker({
        element: el,
        anchor: "center",
      })
        .setLngLat([home.lng, home.lat])
        .addTo(map);
    } else {
      homeMarkerRef.current = new mapboxgl.Marker({
        element: el,
        anchor: "center",
      })
        .setLngLat([home.lng, home.lat])
        .addTo(map);
    }
  }, [home]);

  // ---------- Pick on map ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (!enableHomePick || !onPickHome) return;
      const { lng, lat } = e.lngLat;
      onPickHome(lng, lat);
    };
    pickHandlerRef.current = onClick;

    if (enableHomePick) {
      map.getCanvas().style.cursor = "crosshair";
      map.on("click", onClick);
    } else {
      map.getCanvas().style.cursor = "";
      if (pickHandlerRef.current) {
        map.off("click", pickHandlerRef.current);
      }
    }

    return () => {
      if (pickHandlerRef.current) {
        try {
          map.off("click", pickHandlerRef.current);
        } catch {}
      }
      map.getCanvas().style.cursor = "";
    };
  }, [enableHomePick, onPickHome]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "74vh", borderRadius: 12, overflow: "hidden" }}
    />
  );
};

export default MapView;
