"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { Map as MapboxMap, MapMouseEvent } from "mapbox-gl";
import type { FeatureCollection, Feature, Geometry, Point, Position } from "geojson";
import { withBasePath } from "@/utils/paths";

type StopLike = { name?: string; coord: [number, number] };

export type SupplierSummary = {
  total: number;
  suppliers: Record<string, number>;
};

export type CertisMapProps = {
  styleMode: "hybrid" | "street";
  selectedSuppliers: string[];
  onAddStop: (s: StopLike) => void;
  onDataLoaded: (summary: SupplierSummary) => void;
};

const STYLE_HYBRID =
  "mapbox://styles/mapbox/satellite-streets-v12";
const STYLE_STREET =
  "mapbox://styles/mapbox/streets-v12";

const MAIN_SRC = "main-points";
const MAIN_LAYER = "main-unclustered";
const CLUSTER_LAYER = "main-clusters";
const CLUSTER_COUNT_LAYER = "main-cluster-count";
const KING_SRC = "king-src";
const KING_LAYER = "kingpins";

const CATEGORY_COLOR: Record<string, string> = {
  "agronomy": "#1ed760",
  "agronomy/grain": "#a24de8",
  "distribution": "#18c5d8",
  "grain": "#f5b100",
  "grain/feed": "#7a5800",
  "kingpin": "#ee2b47",
  "office/service": "#3ea0ff",
};
export default function CertisMap(props: CertisMapProps) {
  const { styleMode, selectedSuppliers, onAddStop, onDataLoaded } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // Keep a copy of the full, raw data (unfiltered) so filters don’t break clusters
  const [raw, setRaw] = useState<FeatureCollection<Point, any> | null>(null);

  const activeStyle = useMemo(() => (styleMode === "street" ? STYLE_STREET : STYLE_HYBRID), [styleMode]);

  // ---- helpers -------------------------------------------------------------

  const norm = (s: any) => String(s ?? "").trim().toLowerCase();
  const normCategory = (p: any) =>
    norm(p?.Type ?? p?.category ?? p?.Category ?? "").replace(/\s+/g, "");
  const isKingpin = (p: any) => norm(p?.Type ?? p?.category ?? p?.Category) === "kingpin";

  const splitSuppliers = (val: any): string[] => {
    const s = String(val ?? "").trim();
    if (!s) return [];
    return s.split(/[;,/|]+/).map((x) => x.trim()).filter(Boolean);
  };

  const logoFor = (retailer: string) =>
    withBasePath(`/icons/${retailer.replace(/[^\w\-]+/g, "_")}.png`);

  async function fetchFirstJson<T = any>(candidates: string[]): Promise<T> {
    for (const path of candidates) {
      try {
        const r = await fetch(withBasePath(path), { cache: "no-store" });
        if (r.ok) return (await r.json()) as T;
      } catch {
        /* ignore and try next */
      }
    }
    throw new Error("DATA_NOT_FOUND");
  }

  function toPointFC(fc: FeatureCollection<Geometry, any>): FeatureCollection<Point, any> {
    const feats: Feature<Point, any>[] = [];
    for (const f of fc.features ?? []) {
      if (!f) continue;
      if (f.geometry?.type === "Point") {
        feats.push(f as Feature<Point, any>);
        continue;
      }
      // If someone ships MultiPoint or other, coerce points out of it
      if (f.geometry?.type === "MultiPoint") {
        const coords = (f.geometry.coordinates as Position[]) ?? [];
        for (const c of coords) {
          feats.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: c },
            properties: { ...(f.properties ?? {}) },
          });
        }
      }
    }
    return { type: "FeatureCollection", features: feats };
  }

  // derive filtered data from selection
  const filtered = useMemo<FeatureCollection<Point, any> | null>(() => {
    if (!raw) return null;
    if (!selectedSuppliers.length) return raw;

    const allow = new Set(selectedSuppliers.map(norm));
    const feats = raw.features.filter((f) => {
      const suppliers = splitSuppliers(f.properties?.["Supplier(s)"] ?? f.properties?.Supplier);
      // retain if any matches
      return suppliers.some((s) => allow.has(norm(s)));
    });
    return { type: "FeatureCollection", features: feats };
  }, [raw, selectedSuppliers]);

  // ---- init map ------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      // Mapbox token from file, else env
      try {
        const tokenTxt = await fetch(withBasePath("/mapbox-token"), { cache: "no-store" })
          .then((r) => (r.ok ? r.text() : ""))
          .catch(() => "");
        const token = tokenTxt?.trim() || (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "");
        if (token) mapboxgl.accessToken = token;
      } catch {
        /* ignore, Mapbox will throw a friendly error if missing */
      }

      // Load supplier dataset from any of the known names
      try {
        const fc = await fetchFirstJson<FeatureCollection<Geometry, any>>([
          "/data/retailers.geojson",
          "/data/retailers.json",
          "/data/main.geojson",
          "/data/main.json",
        ]);
        const pts = toPointFC(fc);

        // add normalized helper props we’ll use for styling & filtering
        for (const f of pts.features) {
          const p: any = (f.properties ||= {});
          p.__cat = normCategory(p);
          // keep a single, primary supplier for logo & display purposes
          const allSup = splitSuppliers(p["Supplier(s)"] ?? p.Supplier);
          p.__supplier = allSup[0] ?? "";
        }

        if (cancelled) return;
        setRaw(pts);

        // Build summary and inform parent
        const counts: Record<string, number> = {};
        for (const f of pts.features) {
          const arr = splitSuppliers(f.properties?.["Supplier(s)"] ?? f.properties?.Supplier);
          for (const s of arr) counts[s] = (counts[s] ?? 0) + 1;
        }
        onDataLoaded({ total: pts.features.length, suppliers: counts });
      } catch (err) {
        console.error("Supplier dataset not found under /public/data/*", err);
        onDataLoaded({ total: 0, suppliers: {} });
      }

      // Create the map
      const container = containerRef.current!;
      const m = new mapboxgl.Map({
        container,
        style: activeStyle,
        center: [-96.0, 40.3],
        zoom: 4,
        cooperativeGestures: true,
      });
      mapRef.current = m;

      m.once("style.load", () => {
        try {
          m.setProjection({ name: "mercator" as any });
        } catch {
          /* v3 sets mercator by default; ignore */
        }
        wireSourcesAndLayers(m);
      });

      // Hover popup
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
      });

      m.on("mousemove", (e: MapMouseEvent) => {
        const layers = [KING_LAYER, MAIN_LAYER];
        const feats = m.queryRenderedFeatures(e.point, { layers });
        const f = feats[0] as Feature<Point, any> | undefined;
        if (!f) {
          popupRef.current?.remove();
          return;
        }
        const p: any = f.properties ?? {};
        const name = p?.Name ?? p?.Retailer ?? p?.name ?? "Location";
        const city = p?.City ?? p?.city ?? "";
        const state = p?.State ?? p?.state ?? "";
        const sup = p?.__supplier ?? "";
        const cat = p?.__cat ?? "";

        const logo = sup ? `<img src="${logoFor(sup)}" onerror="this.style.display='none'" style="width:48px;height:48px;object-fit:contain;border-radius:6px;border:1px solid #22384e;background:#0c1a24;padding:4px;margin-right:8px;" />` : "";

        popupRef.current!
          .setLngLat((f.geometry as any).coordinates as [number, number])
          .setHTML(
            `<div style="display:flex;align-items:center;max-width:280px;">
               ${logo}
               <div>
                 <div style="font-weight:700">${name}</div>
                 <div style="opacity:.85">${city}${city && state ? ", " : ""}${state}</div>
                 <div style="margin-top:4px;display:flex;gap:6px;align-items:center;">
                   <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${CATEGORY_COLOR[cat] ?? "#7aa1c2"}"></span>
                   <div style="opacity:.75;font-weight:500;text-transform:capitalize">${(cat || "").replace("/", " / ")}</div>
                 </div>
               </div>
             </div>`
          )
          .addTo(m);
      });

      // Click to add stop (unclustered + kingpins)
      const clickHandler = (e: MapMouseEvent) => {
        const layers = [KING_LAYER, MAIN_LAYER];
        const feats = m.queryRenderedFeatures(e.point, { layers });
        const f = feats[0] as Feature<Point, any> | undefined;
        if (!f) return;
        const p: any = f.properties ?? {};
        const coord = (f.geometry as any).coordinates as [number, number];
        onAddStop({ name: p?.Name ?? p?.Retailer ?? "Stop", coord });
      };
      m.on("click", clickHandler);

      // Clicking a cluster zooms in
      m.on("click", CLUSTER_LAYER, (e) => {
        const f = m.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] })?.[0] as any;
        if (!f) return;
        const clusterId = f.properties?.cluster_id;
        const src = m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
        if (!src || clusterId == null) return;
        // @ts-ignore - v3 still supports this on GeoJSONSource
        src.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          m.easeTo({ center: (f.geometry as any).coordinates as [number, number], zoom });
        });
      });

      // Cursor tweaks
      m.on("mouseenter", MAIN_LAYER, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", MAIN_LAYER, () => (m.getCanvas().style.cursor = ""));
      m.on("mouseenter", KING_LAYER, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", KING_LAYER, () => (m.getCanvas().style.cursor = ""));

      // Cleanup
      return () => {
        cancelled = true;
        popupRef.current?.remove();
        mapRef.current?.remove();
        mapRef.current = null;
      };
    }

    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // init once

  // Re-apply style safely when you toggle Hybrid/Street
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.setStyle(activeStyle);
    m.once("style.load", () => {
      try {
        m.setProjection({ name: "mercator" as any });
      } catch {}
      wireSourcesAndLayers(m);
    });
  }, [activeStyle]);

  // Push filtered data into the sources whenever filters or data change
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (!filtered) return;

    const src = m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(filtered as any);

    const kings = {
      type: "FeatureCollection",
      features: filtered.features.filter((f) => isKingpin(f.properties)),
    } as FeatureCollection<Point, any>;
    const ksrc = m.getSource(KING_SRC) as mapboxgl.GeoJSONSource | undefined;
    if (ksrc) ksrc.setData(kings as any);
  }, [filtered]);

  // ---- layer wiring --------------------------------------------------------

  function categoryPaintExpression() {
    // ["match", ["get","__cat"], "agronomy", "#1ed760", ... default]
    const pairs: any[] = [];
    for (const [k, v] of Object.entries(CATEGORY_COLOR)) {
      pairs.push(k, v);
    }
    return ["match", ["get", "__cat"], ...pairs, "#7aa1c2"];
  }

  function wireSourcesAndLayers(m: MapboxMap) {
    // sources
    if (!m.getSource(MAIN_SRC)) {
      m.addSource(MAIN_SRC, {
        type: "geojson",
        data: filtered ?? { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 40,
        clusterMaxZoom: 12,
      });
    }
    if (!m.getSource(KING_SRC)) {
      m.addSource(KING_SRC, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: (filtered?.features ?? []).filter((f) => isKingpin(f.properties)),
        } as any,
      });
    }

    // layers (clusters)
    if (!m.getLayer(CLUSTER_LAYER)) {
      m.addLayer({
        id: CLUSTER_LAYER,
        type: "circle",
        source: MAIN_SRC,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#43d1ff",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            14, 50, 18, 120, 22,
          ],
          "circle-opacity": 0.8,
        },
      });
    }
    if (!m.getLayer(CLUSTER_COUNT_LAYER)) {
      m.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: MAIN_SRC,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: {
          "text-color": "#0d2231",
        },
      });
    }

    // layers (unclustered points)
    if (!m.getLayer(MAIN_LAYER)) {
      m.addLayer({
        id: MAIN_LAYER,
        type: "circle",
        source: MAIN_SRC,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": categoryPaintExpression() as any,
          "circle-radius": 6,
          "circle-stroke-width": 1.25,
          "circle-stroke-color": "#0d2231",
        },
      });
    }

    // layers (kingpins on top)
    if (!m.getLayer(KING_LAYER)) {
      m.addLayer({
        id: KING_LAYER,
        type: "circle",
        source: KING_SRC,
        paint: {
          "circle-color": CATEGORY_COLOR["kingpin"],
          "circle-radius": 8,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0d2231",
        },
      });
    }
  }

  return <div ref={containerRef} className="map-container" style={{ width: "100%", height: "100%" }} />;
}
