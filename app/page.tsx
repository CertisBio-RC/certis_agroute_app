"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Feature, FeatureCollection, Point } from "geojson";
import MapView, { RetailerProps } from "@/components/Map";

type MarkerStyle = "logo" | "color";

type Basemap = {
  id: string;
  name: string;
  uri: string;
  sharpen?: boolean;
};

// Basemap choices (Mapbox styles + satellite)
const BASEMAPS: Basemap[] = [
  { id: "streets", name: "Mapbox Streets", uri: "mapbox://styles/mapbox/streets-v12" },
  { id: "outdoors", name: "Mapbox Outdoors", uri: "mapbox://styles/mapbox/outdoors-v12" },
  { id: "light", name: "Mapbox Light", uri: "mapbox://styles/mapbox/light-v11" },
  { id: "dark", name: "Mapbox Dark", uri: "mapbox://styles/mapbox/dark-v11" },
  { id: "satellite", name: "Satellite", uri: "mapbox://styles/mapbox/satellite-streets-v12", sharpen: true },
];

function normalizeCollection(json: any): FeatureCollection<Point, RetailerProps> {
  const features: Feature<Point, any>[] = (json?.features || []) as Feature<Point, any>[];

  const normalized = features.map((f: Feature<Point, any>, i: number) => {
    const p: any = { ...(f.properties ?? {}) };

    // Ensure an id exists
    if (p.id == null) p.id = (i + 1).toString();

    // Make any logo path relative (no leading slash) so it works on GitHub Pages
    if (typeof p.Logo === "string" && p.Logo.startsWith("/")) {
      p.Logo = p.Logo.slice(1);
    }

    // Coerce into RetailerProps shape
    const coerced = p as RetailerProps;

    return {
      type: "Feature",
      geometry: f.geometry,
      properties: coerced,
    } as Feature<Point, RetailerProps>;
  });

  return {
    type: "FeatureCollection",
    features: normalized as Feature<Point, RetailerProps>[],
  };
}

export default function Page() {
  const [raw, setRaw] = useState<FeatureCollection<Point, RetailerProps> | null>(null);

  // Simple UI state
  const [markerStyle, setMarkerStyle] = useState<MarkerStyle>("logo");
  const [basemapId, setBasemapId] = useState<string>("streets");
  const [flatMap, setFlatMap] = useState<boolean>(true);
  const [allowRotate, setAllowRotate] = useState<boolean>(false);
  const [sharpenImagery, setSharpenImagery] = useState<boolean>(true);

  // Load retailers GeoJSON (relative path for GitHub Pages)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("data/retailers.geojson", { cache: "no-store" });
        const json = await res.json();
        if (!mounted) return;
        setRaw(normalizeCollection(json));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Failed to load retailers.geojson:", e);
        if (!mounted) setRaw(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // No complex filtering applied right now; wire in your filters here if desired
  const filteredGeojson = useMemo(() => {
    if (!raw) return null;
    return raw;
  }, [raw]);

  const basemap = useMemo(() => {
    const found = BASEMAPS.find((b) => b.id === basemapId) ?? BASEMAPS[0];
    return found;
  }, [basemapId]);

  const token = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN || "";

  return (
    <main className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src="certis-logo.png"
              alt="Certis"
              className="h-8 w-auto"
              loading="eager"
            />
            <h1 className="text-lg font-semibold">Certis AgRoute Planner</h1>
          </div>

          {/* Quick Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm">
              Marker:
              <select
                className="ml-2 rounded border px-2 py-1 text-sm"
                value={markerStyle}
                onChange={(e) => setMarkerStyle(e.target.value as MarkerStyle)}
              >
                <option value="logo">Logo</option>
                <option value="color">Color</option>
              </select>
            </label>

            <label className="text-sm">
              Basemap:
              <select
                className="ml-2 rounded border px-2 py-1 text-sm"
                value={basemapId}
                onChange={(e) => setBasemapId(e.target.value)}
              >
                {BASEMAPS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={flatMap}
                onChange={(e) => setFlatMap(e.target.checked)}
              />
              2D (Mercator)
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowRotate}
                onChange={(e) => setAllowRotate(e.target.checked)}
              />
              Rotate
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sharpenImagery}
                onChange={(e) => setSharpenImagery(e.target.checked)}
                disabled={!basemap.sharpen}
              />
              Sharpen
            </label>
          </div>
        </div>
      </header>

      {/* Map */}
      <section className="mx-auto mt-4 max-w-7xl px-4 pb-6">
        <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
          <MapView
            data={filteredGeojson || undefined}
            markerStyle={markerStyle}
            showLabels={true}
            labelColor="#fff200"
            mapStyle={basemap.uri}
            projection={flatMap ? "mercator" : "globe"}
            allowRotate={allowRotate && !flatMap}
            rasterSharpen={sharpenImagery && Boolean(basemap.sharpen)}
            mapboxToken={token}
          />
        </div>

        {/* Simple footer */}
        <div className="mt-3 text-xs text-gray-500">
          Data source: <code>public/data/retailers.geojson</code> — features loaded:{" "}
          <strong>{filteredGeojson?.features?.length ?? 0}</strong>
        </div>
      </section>
    </main>
  );
}
