// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import Link from "next/link";
import Image from "next/image";

// IMPORTANT: alias to avoid shadowing the global Map<T, U>
import MapView from "@/components/Map";
import Legend, { type LegendItemInput } from "@/components/Legend";

import {
  applyFilters,
  distinctValues,
  readCategory,
  readRetailer,
  readState,
} from "@/utils/filtering";

import {
  geocodeAddress,
  loadHome,
  saveHome,
  type HomeLoc,
} from "@/utils/home";

import {
  buildAppleMapsLinks,
  buildGoogleMapsLinks,
  buildWazeStepLinks,
} from "@/utils/navLinks";

type RetailerProps = Record<string, any>;
type TripMode = "round_home" | "start_home" | "no_home";

// Mapbox styles
const BASEMAPS = [
  { key: "streets",   label: "Streets",   uri: "mapbox://styles/mapbox/streets-v12",           sharpen: false },
  { key: "outdoors",  label: "Outdoors",  uri: "mapbox://styles/mapbox/outdoors-v12",          sharpen: false },
  { key: "light",     label: "Light",     uri: "mapbox://styles/mapbox/light-v11",             sharpen: false },
  { key: "dark",      label: "Dark",      uri: "mapbox://styles/mapbox/dark-v11",              sharpen: false },
  { key: "satellite", label: "Satellite", uri: "mapbox://styles/mapbox/satellite-streets-v12", sharpen: true  },
];

type ShareLinks = {
  legLabel: string;
  google: string[];
  apple: string[];
  waze: string[];
};

// Base path helper for GitHub Pages (so /certis_agroute_app/data/... works)
const repoBase = process.env.NEXT_PUBLIC_REPO_NAME
  ? `/${process.env.NEXT_PUBLIC_REPO_NAME}`
  : "";
const withBasePath = (p: string) => `${repoBase}${p}`;

export default function Page() {
  const [raw, setRaw] = useState<FeatureCollection<Point, RetailerProps> | null>(null);

  // Filters
  const [stateFilter, setStateFilter] = useState<string>("");
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set());
  const [retailerFilter, setRetailerFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // Marker + basemap UI
  const [markerStyle, setMarkerStyle] = useState<"logo" | "color">("logo");
  const [basemapKey, setBasemapKey] = useState<string>("satellite"); // default Satellite as requested
  const [flatMap, setFlatMap] = useState<boolean>(true);
  const [allowRotate, setAllowRotate] = useState<boolean>(false);
  const [sharpenImagery, setSharpenImagery] = useState<boolean>(true);
  const basemap = BASEMAPS.find((b) => b.key === basemapKey) ?? BASEMAPS[0];

  // Home
  const [home, setHome] = useState<HomeLoc | null>(null);
  const [homeQuery, setHomeQuery] = useState("");
  const [homePickMode, setHomePickMode] = useState(false);
  const [tripMode, setTripMode] = useState<TripMode>("round_home");

  // Share-to-phone links
  const [share, setShare] = useState<ShareLinks[]>([]);

  // Tokens (public)
  const mapboxToken =
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
    process.env.MAPBOX_PUBLIC_TOKEN ||
    "";

  // Load GeoJSON once (with cache-bust)
  const reloadData = () => {
    const ts = Date.now();
    const url = withBasePath(`/data/retailers.geojson`) + `?ts=${ts}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch retailers.geojson (${r.status})`);
        return r.json();
      })
      .then((j) => setRaw(j))
      .catch((e) => console.error("Failed to load retailers.geojson", e));
  };
  useEffect(() => {
    reloadData();
    setHome(loadHome());
  }, []);

  // Distinct dropdowns
  const stateOptions = useMemo(() => distinctValues(raw, readState), [raw]);
  const retailerOptions = useMemo(() => distinctValues(raw, readRetailer), [raw]);
  const categoryOptions = useMemo(() => distinctValues(raw, readCategory), [raw]);

  // Apply filters
  const filteredGeojson: FeatureCollection<Point, RetailerProps> | null = useMemo(() => {
    if (!raw) return null;
    return applyFilters(raw, {
      state: stateFilter,
      states: selectedStates,
      retailer: retailerFilter,
      category: categoryFilter,
    });
  }, [raw, stateFilter, selectedStates, retailerFilter, categoryFilter]);

  // Legend items
  const legendItems: LegendItemInput[] = useMemo(() => {
    if (!filteredGeojson) return [];
    const seen = new Map<string, { name?: string; city?: string }>();
    for (const f of filteredGeojson.features) {
      const p = f.properties || {};
      const retailer =
        typeof p.retailer === "string" && p.retailer.trim()
          ? p.retailer.trim()
          : typeof p.Retailer === "string"
          ? p.Retailer.trim()
          : "";
      if (!retailer || seen.has(retailer)) continue;
      const name =
        typeof p.name === "string"
          ? p.name.trim()
          : typeof p.Name === "string"
          ? p.Name.trim()
          : "";
      const city =
        typeof p.city === "string"
          ? p.city.trim()
          : typeof p.City === "string"
          ? p.City.trim()
          : "";
      seen.set(retailer, { name, city });
    }
    return Array.from(seen.entries()).map(([retailer, sample]) => ({
      retailer,
      sampleName: sample.name,
      sampleCity: sample.city,
    }));
  }, [filteredGeojson]);

  // ---------- Build Trip (creates deep links per optimized leg) ----------
  async function buildTrip() {
    if (!filteredGeojson) return alert("No points to build from.");
    setShare([]); // reset

    const pts = filteredGeojson.features
      .map((f) => f.geometry?.coordinates as [number, number])
      .filter(Boolean);
    if (pts.length === 0) return alert("No stops available after filtering.");

    const coords: [number, number][] = [];
    const params = new URLSearchParams({
      annotations: "duration,distance",
      geometries: "geojson",
      overview: "full",
    });

    if (tripMode === "round_home") {
      if (!home) return alert("Set Home first.");
      coords.push([home.lng, home.lat], ...pts);
      params.set("roundtrip", "true");
      params.set("source", "first");
    } else if (tripMode === "start_home") {
      if (!home) return alert("Set Home first.");
      coords.push([home.lng, home.lat], ...pts);
      params.set("roundtrip", "false");
      params.set("source", "first");
    } else {
      coords.push(...pts);
      params.set("roundtrip", "true");
    }

    const MAX = 12; // Mapbox limit
    let idx = 0;
    let legNum = 1;

    while (idx < coords.length) {
      const slice = coords.slice(idx, idx + MAX);
      if (slice.length < 2) break;

      const coordStr = slice.map((c) => `${c[0]},${c[1]}`).join(";");
      const url = `https://api.mapbox.com/optimized-trips/v2/driving/${coordStr}?${params.toString()}&access_token=${mapboxToken}`;

      try {
        const r = await fetch(url);
        const j: any = await r.json();
        if (!r.ok || !j?.trips?.[0]) throw new Error(j?.message || `API ${r.status}`);

        const wp = Array.isArray(j.waypoints)
          ? j.waypoints
          : j.trips?.[0]?.waypoints;
        let ordered: [number, number][] = [];

        if (
          Array.isArray(wp) &&
          wp.every(
            (w: any) =>
              Array.isArray(w?.location) && typeof w?.waypoint_index === "number",
          )
        ) {
          ordered = wp
            .slice()
            .sort((a: any, b: any) => a.waypoint_index - b.waypoint_index)
            .map(
              (w: any) =>
                [Number(w.location[0]), Number(w.location[1])] as [number, number],
            );
        } else {
          ordered = slice;
        }

        // Deep links
        const g = buildGoogleMapsLinks(ordered);
        const a = buildAppleMapsLinks(ordered);
        const w = buildWazeStepLinks(ordered);

        setShare((prev) => [
          ...prev,
          {
            legLabel: `Leg ${legNum} (${ordered.length} stops)`,
            google: g,
            apple: a,
            waze: w,
          },
        ]);
      } catch (e: any) {
        console.error("Optimized Trips error:", e);
        alert(`Trip build failed: ${e?.message || e}`);
        break;
      }

      // Overlap last -> first for continuity except on first (when Home present)
      idx += idx === 0 && tripMode !== "no_home" ? MAX - 1 : MAX;
      legNum += 1;
    }
  }

  // ----- Home helpers -----
  async function setHomeFromSearch() {
    if (!homeQuery.trim()) return;
    try {
      const loc = await geocodeAddress(homeQuery.trim(), mapboxToken);
      setHome(loc);
      saveHome(loc);
    } catch (e: any) {
      alert(e?.message || "Could not find that address.");
    }
  }
  function clearHome() {
    setHome(null);
    saveHome(null);
  }

  // ------------------- UI -------------------
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 text-gray-200">
      {/* Header */}
      <header className="mb-4 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3">
          {/* place /public/certis-logo.png */}
          <Image
            src="/certis-logo.png"
            alt="Certis Biologicals"
            width={160}
            height={36}
            priority
            className="h-9 w-auto"
          />
          <span className="sr-only">Home</span>
        </Link>
        <h1 className="text-2xl font-semibold">Certis AgRoute Planner</h1>
        <span className="ml-2 rounded-full border px-2 py-0.5 text-xs text-gray-400">
          Retailer map &amp; trip builder
        </span>
      </header>

      {/* Controls row 1 */}
      <section className="mb-3 grid grid-cols-1 gap-3 rounded-xl border border-zinc-700 bg-zinc-900/60 p-3 md:grid-cols-12">
        <div className="flex items-center gap-2 md:col-span-3">
          <button
            onClick={reloadData}
            className="rounded-md border border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-800"
          >
            Reload data
          </button>
          <button
            onClick={buildTrip}
            className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Build Trip
          </button>
        </div>

        <div className="md:col-span-3">
          <label className="mb-1 block text-xs text-gray-400">Basemap</label>
          <select
            value={basemapKey}
            onChange={(e) => setBasemapKey(e.target.value)}
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm"
          >
            {BASEMAPS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-300">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={flatMap}
                onChange={(e) => setFlatMap(e.target.checked)}
              />
              Flat map
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={allowRotate}
                onChange={(e) => setAllowRotate(e.target.checked)}
                disabled={flatMap}
              />
              Allow rotate
            </label>
            <label className="flex items-center gap-1" title="Boost contrast on satellite imagery">
              <input
                type="checkbox"
                checked={sharpenImagery}
                onChange={(e) => setSharpenImagery(e.target.checked)}
                disabled={!basemap.sharpen}
              />
              Sharpen imagery
            </label>
          </div>
        </div>

        <div className="md:col-span-3">
          <label className="mb-1 block text-xs text-gray-400">Category</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {categoryOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <label className="mb-1 block text-xs text-gray-400">Retailer</label>
          <select
            value={retailerFilter}
            onChange={(e) => setRetailerFilter(e.target.value)}
            className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {retailerOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-300">
            <span>Markers:</span>
            <select
              value={markerStyle}
              onChange={(e) => setMarkerStyle(e.target.value as "logo" | "color")}
              className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs"
            >
              <option value="logo">Logos</option>
              <option value="color">Colored circles</option>
            </select>
          </div>
        </div>
      </section>

      {/* Home controls */}
      <section className="mb-3 grid grid-cols-1 gap-3 rounded-xl border border-zinc-700 bg-zinc-900/60 p-3 md:grid-cols-12">
        <div className="md:col-span-12">
          <label className="mb-1 block text-xs text-gray-400">Home</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={homeQuery}
              onChange={(e) => setHomeQuery(e.target.value)}
              placeholder="Enter address (city, ZIP, or full)"
              className="min-w-[260px] flex-1 rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm"
            />
            <button
              onClick={setHomeFromSearch}
              className="rounded-md border border-zinc-600 px-2 py-1 text-sm hover:bg-zinc-800"
              title="Geocode and set Home"
            >
              Set from address
            </button>
            <button
              onClick={() => setHomePickMode((s) => !s)}
              className={`rounded-md px-2 py-1 text-sm ${
                homePickMode
                  ? "border-emerald-500 bg-emerald-600/20"
                  : "border border-zinc-600 hover:bg-zinc-800"
              }`}
              title="Pick Home by clicking the map"
            >
              Pick on map
            </button>
            <button
              onClick={clearHome}
              className="rounded-md border border-zinc-600 px-2 py-1 text-sm hover:bg-zinc-800"
            >
              Clear
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            Current:{" "}
            {home
              ? `${home.label ?? ""} (${home.lat.toFixed(5)}, ${home.lng.toFixed(5)})`
              : "No Home set"}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-300">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={tripMode === "round_home"}
                onChange={() => setTripMode("round_home")}
              />
              Round trip from Home
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={tripMode === "start_home"}
                onChange={() => setTripMode("start_home")}
              />
              Start at Home, end elsewhere
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={tripMode === "no_home"}
                onChange={() => setTripMode("no_home")}
              />
              No Home constraints
            </label>
          </div>
        </div>
      </section>

      {/* State filter chips */}
      <section className="mb-3 rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
        <label className="mb-2 block text-xs text-gray-400">States</label>
        <div className="flex items-center gap-2">
          <select
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setSelectedStates(new Set()); // clear multi when dropdown used
            }}
            className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {stateOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <span className="text-xs text-gray-500">
            Tip: use chip buttons below for multi-state.
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {stateOptions.slice(0, 18).map((s) => {
            const selected = selectedStates.has(s);
            return (
              <button
                key={s}
                onClick={() => {
                  const next = new Set(selectedStates);
                  if (selected) next.delete(s);
                  else next.add(s);
                  setSelectedStates(next);
                  setStateFilter(""); // multi-select mode
                }}
                className={`rounded-full px-3 py-1 text-xs ${
                  selected
                    ? "bg-emerald-600 text-white"
                    : "border border-zinc-600 text-gray-300 hover:bg-zinc-800"
                }`}
              >
                {s}
              </button>
            );
          })}
          {stateOptions.length > 18 && (
            <span className="text-xs text-gray-500">(+ more)</span>
          )}
          {selectedStates.size > 0 && (
            <button
              onClick={() => setSelectedStates(new Set())}
              className="rounded-full border border-zinc-600 px-3 py-1 text-xs text-gray-300 hover:bg-zinc-800"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {/* Map + Legend side-by-side on wide screens */}
      <section className="relative grid grid-cols-1 gap-3 md:grid-cols-[1fr_280px]">
        <div className="relative">
          <MapView
            data={filteredGeojson || undefined}
            markerStyle={markerStyle}
            showLabels={true}
            labelColor="#fff200"
            mapStyle={basemap.uri}
            projection={flatMap ? "mercator" : "globe"}
            allowRotate={allowRotate && !flatMap}
            rasterSharpen={sharpenImagery && (basemap.sharpen ?? false)}
            mapboxToken={mapboxToken}
            home={home}
            enableHomePick={homePickMode}
            onPickHome={(lng, lat) => {
              const loc = { lng, lat, label: "Home (map)" };
              setHome(loc);
              saveHome(loc);
              setHomePickMode(false);
            }}
          />
        </div>

        <aside className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
          <Legend
            items={legendItems}
            selectedRetailer={retailerFilter || undefined}
            onSelect={(r) => setRetailerFilter(r ?? "")}
          />
        </aside>
      </section>

      {/* Send-to-phone results */}
      {share.length > 0 && (
        <section className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
          <div className="mb-2 text-sm font-semibold">Send to phone</div>
          <p className="mb-3 text-sm text-gray-400">
            Tap a link on your phone. Long trips will be split into multiple chunks (≤12 stops each).
          </p>

          {share.map((leg, i) => (
            <div key={i} className="mb-3 rounded-lg border border-zinc-700 p-2">
              <div className="mb-2 text-sm font-medium">{leg.legLabel}</div>
              <div className="flex flex-col gap-2 md:flex-row">
                <LinkGroup label="Google Maps" urls={leg.google} />
                <LinkGroup label="Apple Maps" urls={leg.apple} />
                <LinkGroup label="Waze (step-by-step)" urls={leg.waze} />
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

// Render grouped links
function LinkGroup({ label, urls }: { label: string; urls: string[] }) {
  if (!urls || urls.length === 0) {
    return (
      <div className="flex-1 rounded-md bg-zinc-800/60 p-2 text-sm text-gray-400">
        {label}: not available
      </div>
    );
  }
  return (
    <div className="flex-1">
      <div className="mb-1 text-xs text-gray-500">{label}</div>
      <div className="flex flex-wrap gap-2">
        {urls.map((u, idx) => (
          <a
            key={idx}
            href={u}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-zinc-700 px-2 py-1 text-sm hover:bg-zinc-800"
          >
            {urls.length === 1 ? "Open" : `Open ${idx + 1}`}
          </a>
        ))}
      </div>
    </div>
  );
}
