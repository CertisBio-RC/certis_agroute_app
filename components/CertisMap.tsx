"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type Basemap = "hybrid" | "Hybrid" | "streets" | "Streets";

type CertisMapProps = {
  /** e.g. "/certis_agroute_app" for Pages, "" locally */
  basePath: string;
  /** Mapbox public token */
  token: string;

  /** Basemap toggle from UI */
  basemap: Basemap;

  /**
   * GeoJSON FeatureCollection<Point>
   * Required properties used: Retailer, Name, Category, Address, City, State, Zip
   * Optional: Logo (filename) — if present, shown in popup
   */
  data: GeoJSON.FeatureCollection<GeoJSON.Point>;

  /** Optional [minX, minY, maxX, maxY] to fit the view */
  bbox?: readonly [number, number, number, number];

  /** Called when the user double-clicks on the map (to set Home, etc.) */
  onMapDblClick?: (lnglat: [number, number]) => void;

  /** Called when a point is clicked (to add a stop, etc.) */
  onPointClick?: (lnglat: [number, number], title: string) => void;
};

function slugify(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function popupHTML(props: any, basePath: string) {
  const retailer = props?.Retailer ?? "";
  const name = props?.Name ?? "";
  const category = props?.Category ?? "";
  const addr = [props?.Address, props?.City, props?.State, props?.Zip]
    .filter(Boolean)
    .join(", ");

  // Use explicit props.Logo when present; otherwise try /logos/<retailer-slug>.png
  const explicit = props?.Logo ? String(props.Logo) : "";
  const guess = `${basePath}/logos/${slugify(retailer)}.png`;
  const src = explicit ? `${basePath}/logos/${explicit}` : guess;

  // The onerror hides the <img> if the file is missing
  const logoTag = `<img class="c-popup-logo" src="${src}" alt="" onerror="this.style.display='none'">`;

  return `
    <div class="c-popup">
      <div class="c-popup__head">
        ${logoTag}
        <div class="c-popup__titles">
          <div class="c-popup__retailer">${retailer || ""}</div>
          <div class="c-popup__name">${name || ""}</div>
        </div>
      </div>
      <div class="c-popup__meta">
        <div class="c-popup__cat">${category || ""}</div>
        <div class="c-popup__addr">${addr || ""}</div>
      </div>
    </div>
  `;
}

export default function CertisMap({
  basePath,
  token,
  basemap,
  data,
  bbox,
  onMapDblClick,
  onPointClick,
}: CertisMapProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Touch detection: no hover on touch devices
  const isTouch = useMemo(
    () => typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0),
    []
  );

  // Split data into “kingpins” (Category === "Kingpin") and “others”
  const kingpinFC = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => {
    const feats = (data?.features ?? []).filter(
      (f) => (f?.properties as any)?.Category === "Kingpin"
    );
    return { type: "FeatureCollection", features: feats as any };
  }, [data]);

  const othersFC = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => {
    const feats = (data?.features ?? []).filter(
      (f) => (f?.properties as any)?.Category !== "Kingpin"
    );
    return { type: "FeatureCollection", features: feats as any };
  }, [data]);

  // Style choice
  const styleURL =
    basemap.toLowerCase() === "streets"
      ? "mapbox://styles/mapbox/streets-v12"
      : "mapbox://styles/mapbox/satellite-streets-v12";

  // Init / style changes
  useEffect(() => {
    if (!mapEl.current) return;
    mapboxgl.accessToken = token;

    // Create once
    if (!mapRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapEl.current,
        style: styleURL,
        center: [-96.5, 41.5],
        zoom: 4,
        hash: true,
      });

      // basic nav
      mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

      // dbl-click => set Home
      mapRef.current.on("dblclick", (e) => {
        onMapDblClick?.([e.lngLat.lng, e.lngLat.lat]);
      });
    } else {
      // Switch basemap if needed
      const m = mapRef.current;
      if ((m as any).getStyle()?.sprite?.indexOf(styleURL) === -1) {
        m.setStyle(styleURL);
      }
    }

    return () => {
      // Don't auto-destroy between re-renders; keeps map stable
    };
  }, [styleURL, token, onMapDblClick]);

  // Data layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onStyle = () => {
      // SOURCES
      if (map.getSource("others")) map.removeSource("others");
      if (map.getSource("kingpins")) map.removeSource("kingpins");

      map.addSource("others", {
        type: "geojson",
        data: othersFC,
        cluster: true,
        clusterRadius: 48,
        clusterProperties: {},
      });

      // non-clustered kingpins so they always show
      map.addSource("kingpins", { type: "geojson", data: kingpinFC });

      // LAYERS — clusters for others
      if (map.getLayer("clusters")) map.removeLayer("clusters");
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "others",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#65a9ff",
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "point_count"],
            2, 16,
            40, 28,
            200, 36,
          ],
          "circle-stroke-color": "#0b1016",
          "circle-stroke-width": 2,
        },
      });

      if (map.getLayer("cluster-count")) map.removeLayer("cluster-count");
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "others",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count"],
          "text-size": 12,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
        },
        paint: { "text-color": "#ffffff" },
      });

      // unclustered others (colored dots)
      if (map.getLayer("unclustered-dots")) map.removeLayer("unclustered-dots");
      map.addLayer({
        id: "unclustered-dots",
        type: "circle",
        source: "others",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "Category"],
            // tweak colors to your liking
            "Agronomy", "#42c1ff",
            "Office/Service", "#92a2b5",
            "Distribution", "#6ee7a4",
            "#66b3ff" // default
          ],
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            4, 4,
            8, 6,
            12, 8
          ],
          "circle-stroke-color": "#0b1016",
          "circle-stroke-width": 2,
        },
      });

      // KINGPINS — bright red with yellow ring, always on top
      if (map.getLayer("kingpin-circles")) map.removeLayer("kingpin-circles");
      map.addLayer({
        id: "kingpin-circles",
        type: "circle",
        source: "kingpins",
        paint: {
          "circle-color": "#ff3355",              // bright red
          "circle-stroke-color": "#ffd84d",       // yellow ring
          "circle-stroke-width": 3,
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            3, 7,
            6, 10,
            10, 12,
            14, 14
          ]
        },
      });

      // ---------- POPUPS ----------
      const hoverPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 16,
      });
      let hoverVisible = false;

      const showHover = (e: any) => {
        if (isTouch) return; // no hover on touch
        const f = e.features?.[0];
        if (!f) return;
        const [lng, lat] = (f.geometry as any).coordinates;
        hoverPopup
          .setLngLat([lng, lat])
          .setHTML(popupHTML(f.properties, basePath))
          .addTo(map);
        hoverVisible = true;
      };

      const hideHover = () => {
        if (!isTouch && hoverVisible) {
          hoverPopup.remove();
          hoverVisible = false;
        }
      };

      const clickSticky = (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        const [lng, lat] = (f.geometry as any).coordinates;
        // Sticky popup for both desktop and mobile
        new mapboxgl.Popup({ closeButton: true, offset: 16 })
          .setLngLat([lng, lat])
          .setHTML(popupHTML(f.properties, basePath))
          .addTo(map);
        const title = [f.properties?.Retailer, f.properties?.Name].filter(Boolean).join(" — ");
        onPointClick?.([lng, lat], title);
      };

      const hoverTargets = ["unclustered-dots", "kingpin-circles"];
      hoverTargets.forEach((layer) => {
        map.on("mousemove", layer, showHover);
        map.on("mouseleave", layer, hideHover);
        map.on("click", layer, clickSticky);
        map.on("touchstart", layer, clickSticky);
      });

      // Fit bounds if provided
      if (bbox && Number.isFinite(bbox[0])) {
        map.fitBounds(bbox, { padding: 40, duration: 350 });
      }
    };

    // Style might still be loading
    if (map.isStyleLoaded()) {
      onStyle();
    } else {
      map.once("styledata", onStyle);
    }

    return () => {
      const m = mapRef.current;
      if (!m) return;
      // remove handlers to prevent duplicates when style changes
      const layers = ["unclustered-dots", "kingpin-circles"];
      layers.forEach((layer) => {
        if (m.getLayer(layer)) {
          m.off("mousemove", layer, () => {});
          m.off("mouseleave", layer, () => {});
          m.off("click", layer, () => {});
          m.off("touchstart", layer, () => {});
        }
      });
    };
  }, [othersFC, kingpinFC, bbox, basePath, isTouch, onPointClick]);

  return (
    <div
      ref={mapEl}
      style={{ width: "100%", height: "100%", minHeight: "480px" }}
      aria-label="Retailers map"
    />
  );
}

/* --- Minimal CSS to style popup (scoped via class names) ---
   Put this in app/globals.css if you want the exact look:

.c-popup { font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#e8eaee; }
.c-popup__head { display:flex; gap:10px; align-items:center; margin-bottom:6px; }
.c-popup-logo { width:46px; height:auto; border-radius:6px; border:1px solid rgba(255,255,255,.15); background:#0b1016; padding:4px; }
.c-popup__titles { display:flex; flex-direction:column; gap:2px; }
.c-popup__retailer { font-weight:600; }
.c-popup__name { color:#cbd3dc; }
.c-popup__meta { margin-top:4px; }
.c-popup__cat { font-size:12px; color:#96a1ad; }
.c-popup__addr { margin-top:2px; font-size:12px; color:#cbd3dc; }
*/
