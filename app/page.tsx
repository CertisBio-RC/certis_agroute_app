"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Feature, Point } from "geojson";
import MapView, { type RetailerProps } from "@/components/Map";

// Local type aliases (do not import from Map.tsx)
type MarkerStyle = "logo" | "color";
type HomeLoc = { lng: number; lat: number };

type Basemap = { name: string; uri: string; sharpen?: boolean };
const BASEMAPS: Basemap[] = [
  { name: "Streets", uri: "mapbox://styles/mapbox/streets-v12" },
  { name: "Outdoors", uri: "mapbox://styles/mapbox/outdoors-v12" },
  { name: "Satellite", uri: "mapbox://styles/mapbox/satellite-streets-v12", sharpen: true },
];

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ?? "";

export default function Page(_: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const [geo, setGeo] = useState<FeatureCollection<Point, RetailerProps> | null>(null);
  const [loading, setLoading] = useState(true);
  const [markerStyle, setMarkerStyle] = useState<MarkerStyle>("logo");
  const [basemapIdx, setBasemapIdx] = useState(0);
  const [flatMap, setFlatMap] = useState(true);
  const [allowRotate, setAllowRotate] = useState(false);
  const [sharpenImagery, setSharpenImagery] = useState(true);
  const [home, setHome] = useState<HomeLoc | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("data/retailers.geojson", { cache: "force-cache" });
        const json = (await res.json()) as FeatureCollection<Point, RetailerProps>;

        const fixed: FeatureCollection<Point, RetailerProps> = {
          type: "FeatureCollection",
          features: (json.features || []).map((f, i) => {
            const props = { ...(f.properties || {}) };
            if ((props as any).Logo && (props as any).Logo.startsWith("/")) {
              (props as any).Logo = (props as any).Logo.slice(1);
            }
            const withId: Feature<Point, RetailerProps> =
              f.id == null ? { ...f, id: (i + 1).toString(), properties: props } : { ...f, properties: props };
            return withId;
          }),
        };

        if (!cancelled) setGeo(fixed);
      } catch (err) {
        console.error("Failed to load retailers.geojson", err);
        if (!cancelled) setGeo({ type: "FeatureCollection", features: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const basemap = BASEMAPS[basemapIdx];
  const filteredGeojson: FeatureCollection<Point, RetailerProps> | null = useMemo(() => geo, [geo]);

  return (
    <main className="min-h-screen">
      <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="certis-logo.png" alt="Certis" className="h-8 w-auto" />
          <h1 className="text-xl font-semibold">Certis AgRoute Planner</h1>
          <span className="text-sm text-gray-500">
            {loading ? "Loading retailers…" : `${filteredGeojson?.features.length ?? 0} retailers`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm">
            Basemap{" "}
            <select
              className="border rounded px-2 py-1"
              value={basemapIdx}
              onChange={(e) => setBasemapIdx(Number(e.target.value))}
            >
              {BASEMAPS.map((b, i) => (
                <option key={b.name} value={i}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            Markers{" "}
            <select
              className="border rounded px-2 py-1"
              value={markerStyle}
              onChange={(e) => setMarkerStyle(e.target.value as MarkerStyle)}
            >
              <option value="logo">Logo</option>
              <option value="color">Color</option>
            </select>
          </label>

          <label className="text-sm flex items-center gap-1">
            <input type="checkbox" checked={flatMap} onChange={(e) => setFlatMap(e.target.checked)} />
            Flat (Mercator)
          </label>

          <label className="text-sm flex items-center gap-1">
            <input type="checkbox" checked={allowRotate} onChange={(e) => setAllowRotate(e.target.checked)} />
            Rotate
          </label>

          <label className="text-sm flex items-center gap-1">
            <input
              type="checkbox"
              checked={sharpenImagery}
              onChange={(e) => setSharpenImagery(e.target.checked)}
            />
            Sharpen imagery
          </label>
        </div>
      </div>

      <div className="p-4">
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <MapView
            data={filteredGeojson || undefined}
            markerStyle={markerStyle}
            showLabels={true}
            labelColor="#fff200"
            mapStyle={basemap.uri}
            projection={flatMap ? "mercator" : "globe"}
            allowRotate={allowRotate && !flatMap}
            rasterSharpen={sharpenImagery && Boolean(basemap.sharpen)}
            mapboxToken={MAPBOX_TOKEN}
            onPickHome={(lng, lat) => setHome({ lng, lat })}
            home={home ?? undefined}
          />
        </div>
      </div>
    </main>
  );
}
