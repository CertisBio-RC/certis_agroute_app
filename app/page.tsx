// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Feature, Point } from "geojson";
import MapView, { type RetailerProps } from "@/components/Map";

// match MapView markerStyle union
type MarkerStyleOpt = "color" | "logo";

type BasemapKey = "Hybrid" | "Satellite" | "Streets";
const BASEMAPS: Record<BasemapKey, { style: string; sharpen?: boolean }> = {
  Hybrid: { style: "mapbox://styles/mapbox/satellite-streets-v12", sharpen: true },
  Satellite: { style: "mapbox://styles/mapbox/satellite-v9", sharpen: true },
  Streets: { style: "mapbox://styles/mapbox/streets-v12", sharpen: false },
};

function uniq<T>(xs: T[]) {
  return Array.from(new Set(xs));
}

function toRetailerProps(raw: any): RetailerProps {
  return {
    Retailer: String(raw.Retailer ?? ""),
    Name: String(raw.Name ?? ""),
    City: raw.City ? String(raw.City) : undefined,
    State: raw.State ? String(raw.State) : undefined,
    Category: raw.Category ? String(raw.Category) : undefined,
    Address: raw.Address ? String(raw.Address) : undefined,
    Phone: raw.Phone ? String(raw.Phone) : undefined,
    Website: raw.Website ? String(raw.Website) : undefined,
    Logo: raw.Logo ? String(raw.Logo).replace(/^\/+/, "") : undefined,
    Color: raw.Color ? String(raw.Color) : undefined,
  };
}

export default function Page() {
  // data
  const [geojson, setGeojson] = useState<FeatureCollection<Point, RetailerProps> | null>(null);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // map token
  const [token, setToken] = useState<string>(
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ??
      (typeof window !== "undefined" ? (window as any).__MAPBOX_TOKEN : undefined) ??
      ""
  );

  // ui state
  const [basemap, setBasemap] = useState<BasemapKey>("Hybrid");
  const [markerStyle, setMarkerStyle] = useState<MarkerStyleOpt>("color");
  const [flatProjection, setFlatProjection] = useState<boolean>(true);
  const [allowRotate, setAllowRotate] = useState<boolean>(false);
  const [sharpenImagery, setSharpenImagery] = useState<boolean>(true);

  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [labelColor, setLabelColor] = useState<string>("#c7d2fe");

  const [search, setSearch] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("All");
  const [home, setHome] = useState<{ lng: number; lat: number } | null>(null);

  // token fallback from file
  useEffect(() => {
    if (token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("mapbox-token.txt", { cache: "no-store" });
        if (!res.ok) return;
        const txt = (await res.text()).trim();
        if (!cancelled && txt) {
          (window as any).__MAPBOX_TOKEN = txt;
          setToken(txt);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // load retailers
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingData(true);
      setDataError(null);
      try {
        const res = await fetch("data/retailers.geojson", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as FeatureCollection<Point, any>;
        const normalized: FeatureCollection<Point, RetailerProps> = {
          type: "FeatureCollection",
          features: (json.features || []).map((f: Feature<Point, any>, i: number) => {
            const props = toRetailerProps(f.properties ?? {});
            const withId: Feature<Point, RetailerProps> =
              f.id == null ? { ...f, id: (i + 1).toString(), properties: props } : { ...f, properties: props };
            const p: any = withId.properties;
            if (p.Logo && String(p.Logo).startsWith("/")) p.Logo = String(p.Logo).replace(/^\/+/, "");
            return withId;
          }),
        };
        if (!cancelled) setGeojson(normalized);
      } catch (err: any) {
        if (!cancelled) setDataError(String(err?.message ?? err ?? "Failed loading retailers"));
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const states = useMemo(() => {
    const all = (geojson?.features ?? [])
      .map((f) => f.properties.State)
      .filter(Boolean) as string[];
    return ["All", ...uniq(all).sort()];
  }, [geojson]);

  const filteredGeojson = useMemo<FeatureCollection<Point, RetailerProps> | null>(() => {
    if (!geojson) return null;
    const term = search.trim().toLowerCase();
    const wantAll = stateFilter === "All";
    const features = geojson.features.filter((f) => {
      const p = f.properties;
      const inState = wantAll || (p.State ?? "").toLowerCase() === stateFilter.toLowerCase();
      if (!inState) return false;
      if (!term) return true;
      const hay = [p.Retailer, p.Name, p.City, p.State, p.Category, p.Address, p.Phone, p.Website]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
    return { type: "FeatureCollection", features };
  }, [geojson, search, stateFilter]);

  const basemapCfg = BASEMAPS[basemap];
  const mapStyle = basemapCfg.style;
  const sharpen = sharpenImagery && !!basemapCfg.sharpen;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="container mx-auto px-4 py-4 flex items-center gap-6">
        <img src="certis-logo.png" alt="Certis" className="h-8 w-auto" />
        <a className="text-sky-300 hover:underline" href="./">Home</a>
        <h1 className="text-2xl font-bold">Certis AgRoute Planner</h1>
        <div className="opacity-70">{filteredGeojson?.features.length ?? geojson?.features.length ?? 0} retailers</div>
      </div>

      <div className="container mx-auto px-4 pb-8 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
            <div className="font-semibold text-zinc-300 mb-3">MAP</div>

            <label className="block text-sm mb-1">Basemap</label>
            <select
              className="w-full rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 mb-3"
              value={basemap}
              onChange={(e) => setBasemap(e.target.value as BasemapKey)}
            >
              {Object.keys(BASEMAPS).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>

            <label className="block text-sm mb-1">Markers</label>
            <select
              className="w-full rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 mb-3"
              value={markerStyle}
              onChange={(e) => setMarkerStyle(e.target.value as MarkerStyleOpt)}
            >
              <option value="color">Color dot</option>
              <option value="logo">Logo</option>
            </select>

            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={flatProjection} onChange={(e) => setFlatProjection(e.target.checked)} />
                <span>Flat (Mercator)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={allowRotate} onChange={(e) => setAllowRotate(e.target.checked)} />
                <span>Rotate</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sharpenImagery}
                  onChange={(e) => setSharpenImagery(e.target.checked)}
                />
                <span>Sharpen imagery</span>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
            <div className="font-semibold text-zinc-300 mb-3">LABELS</div>
            <label className="flex items-center gap-2 mb-3">
              <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
              <span>Show labels</span>
            </label>
            <label className="block text-sm mb-1">Label color</label>
            <input className="w-full h-2 rounded bg-zinc-800" type="color" value={labelColor} onChange={(e) => setLabelColor(e.target.value)} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
            <div className="font-semibold text-zinc-300 mb-3">FILTER</div>
            <label className="block text-sm mb-1">Search</label>
            <input
              className="w-full rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 mb-3"
              placeholder="Retailer, name, city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="block text-sm mb-1">State</label>
            <select
              className="w-full rounded-lg bg-zinc-800 border border-white/10 px-3 py-2"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
            >
              {states.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
            <div className="font-semibold text-zinc-300 mb-3">HOME</div>
            <div className="flex gap-3">
              <button className="rounded-lg bg-sky-600/80 hover:bg-sky-600 px-4 py-2" onClick={() => setHome({ lng: -97, lat: 38.5 })}>
                Set Example
              </button>
              <button className="rounded-lg bg-zinc-700 hover:bg-zinc-600 px-4 py-2" onClick={() => setHome(null)}>
                Clear
              </button>
            </div>
            <div className="mt-3 text-sm opacity-70">
              lng: {home?.lng?.toFixed(4) ?? "-97.0000"} / lat: {home?.lat?.toFixed(4) ?? "38.5000"}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4 relative min-h-[600px]">
          <MapView
            data={filteredGeojson || undefined}
            markerStyle={markerStyle}
            showLabels={showLabels}
            labelColor={labelColor}
            mapStyle={mapStyle}
            allowRotate={allowRotate}
            projection={flatProjection ? "mercator" : "globe"}
            rasterSharpen={sharpen}
            mapboxToken={token}
            home={home ?? undefined}
          />
          <div className="absolute bottom-3 left-4 text-sm opacity-70 pointer-events-none">
            <span className="mr-6">Use two fingers to move the map</span>
            <span>Use ctrl + scroll to zoom the map</span>
          </div>
          {loadingData && (
            <div className="absolute top-3 right-4 text-xs px-2 py-1 rounded bg-zinc-800/70 border border-white/10">
              Loading retailers…
            </div>
          )}
          {!!dataError && (
            <div className="absolute top-3 right-4 text-xs px-2 py-1 rounded bg-rose-700/70 border border-white/10">
              {dataError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
