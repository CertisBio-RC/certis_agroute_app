// /app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import Link from "next/link";
import Image from "next/image";

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

// ---------- Types ----------
type RetailerProps = Record<string, any>;
type TripMode = "round_home" | "start_home" | "no_home";

type ShareLinks = {
  legLabel: string;
  google: string[];
  apple: string[];
  waze: string[];
};

// ---------- Basemaps ----------
const BASEMAPS = [
  {
    key: "satellite",
    label: "Satellite",
    uri: "mapbox://styles/mapbox/satellite-streets-v12",
    sharpen: true,
  },
  {
    key: "streets",
    label: "Streets",
    uri: "mapbox://styles/mapbox/streets-v12",
    sharpen: false,
  },
  {
    key: "outdoors",
    label: "Outdoors",
    uri: "mapbox://styles/mapbox/outdoors-v12",
    sharpen: false,
  },
  { key: "light", label: "Light", uri: "mapbox://styles/mapbox/light-v11", sharpen: false },
  { key: "dark", label: "Dark", uri: "mapbox://styles/mapbox/dark-v11", sharpen: false },
];

// Small helper: convert possibly-string coords to safe [lng,lat]
function toLngLat(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const lng = Number(v[0]);
  const lat = Number(v[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return [lng, lat];
}

export default function Page() {
  // ---------- Data ----------
  const [raw, setRaw] = useState<FeatureCollection<Point, RetailerProps> | null>(null);

  // ---------- Filters ----------
  const [stateFilter, setStateFilter] = useState<string>("");
  const [selectedStates] = useState<Set<string>>(new Set()); // multi-state chips (kept for future use)
  const [retailerFilter, setRetailerFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // ---------- Map/visual ----------
  const [markerStyle, setMarkerStyle] = useState<"logo" | "color">("logo");
  const [basemapKey, setBasemapKey] = useState<string>("satellite");
  const [flatMap, setFlatMap] = useState<boolean>(true);
  const [allowRotate, setAllowRotate] = useState<boolean>(false);
  const [sharpenImagery, setSharpenImagery] = useState<boolean>(true);
  const basemap = BASEMAPS.find((b) => b.key === basemapKey) ?? BASEMAPS[0];

  // ---------- Home ----------
  const [home, setHome] = useState<HomeLoc | null>(null);
  const [homeQuery, setHomeQuery] = useState("");
  const [homePickMode, setHomePickMode] = useState(false);
  const [tripMode, setTripMode] = useState<TripMode>("round_home");

  // ---------- Share ----------
  const [share, setShare] = useState<ShareLinks[]>([]);

  // Diagnostics if trip building fails
  const [lastTripsUrl, setLastTripsUrl] = useState<string | null>(null);
  const [lastTripsError, setLastTripsError] = useState<string | null>(null);

  // Mapbox token
  const mapboxToken =
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN || "";

  // ---------- Load data ----------
  const reloadData = () => {
    const ts = Date.now();
    fetch(`/data/retailers.geojson?ts=${ts}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`retailers.geojson ${r.status}`);
        return r.json();
      })
      .then((j) => setRaw(j))
      .catch((e) => console.error("Failed to load retailers.geojson:", e));
  };

  useEffect(() => {
    reloadData();
    setHome(loadHome());
  }, []);

  // ---------- Options ----------
  const stateOptions = useMemo(() => distinctValues(raw, readState), [raw]);
  const retailerOptions = useMemo(() => distinctValues(raw, readRetailer), [raw]);
  const categoryOptions = useMemo(() => distinctValues(raw, readCategory), [raw]);

  // ---------- Filtered data ----------
  const filteredGeojson: FeatureCollection<Point, RetailerProps> | null = useMemo(() => {
    if (!raw) return null;
    return applyFilters(raw, {
      state: stateFilter,
      states: selectedStates,
      retailer: retailerFilter,
      category: categoryFilter,
    });
  }, [raw, stateFilter, selectedStates, retailerFilter, categoryFilter]);

  // ---------- Legend ----------
  const legendItems: LegendItemInput[] = useMemo(() => {
    if (!filteredGeojson) return [];
    const seen = (new (globalThis as any).Map() as Map<string, { name?: string; city?: string }>);
    for (const f of filteredGeojson.features) {
      const p = f.properties || {};
      const retailer: string =
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

  // ---------- Trip build (with graceful fallback) ----------
  async function buildTrip() {
    setShare([]);
    setLastTripsUrl(null);
    setLastTripsError(null);

    if (!filteredGeojson) {
      alert("No points to build from.");
      return;
    }
    if (!mapboxToken || !mapboxToken.startsWith("pk.")) {
      alert("Mapbox public token missing. Check repository Secrets.");
      return;
    }

    // Pull & validate coords
    const points = filteredGeojson.features
      .map((f) => toLngLat(f?.geometry?.coordinates))
      .filter((v): v is [number, number] => !!v);

    if (points.length < 1) {
      alert("No stops available after filtering.");
      return;
    }

    // Compose coords list based on trip mode
    const coords: [number, number][] = [];
    const params = new URLSearchParams({
      annotations: "duration,distance",
      geometries: "geojson",
      overview: "full",
    });

    if (tripMode === "round_home") {
      if (!home) return alert("Set Home first.");
      coords.push([home.lng, home.lat], ...points);
      params.set("roundtrip", "true");
      params.set("source", "first");
    } else if (tripMode === "start_home") {
      if (!home) return alert("Set Home first.");
      coords.push([home.lng, home.lat], ...points);
      params.set("roundtrip", "false");
      params.set("source", "first");
    } else {
      coords.push(...points);
      params.set("roundtrip", "true");
    }

    // Optimized Trips (limit 12 per request) — stride 11 to carry the last dest
    const MAX = 12;
    let idx = 0;
    let legNum = 1;
    let usedFallback = false;

    while (idx < coords.length) {
      const slice = coords.slice(idx, idx + MAX);
      if (slice.length < 2) break;

      const coordStr = slice.map((c) => `${c[0]},${c[1]}`).join(";");
      const url = `https://api.mapbox.com/optimized-trips/v2/driving/${coordStr}?${params.toString()}&access_token=${encodeURIComponent(
        mapboxToken
      )}`;

      try {
        setLastTripsUrl(url);
        const r = await fetch(url, { cache: "no-store" });

        // 401/403 → probably no Optimization entitlement; fall back
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          const errText = `HTTP ${r.status} ${r.statusText}\n${body}`;
          setLastTripsError(errText);
          usedFallback = true;
        } else {
          const j: any = await r.json();

          // optimization sometimes returns 200 + error message in body
          if (!j?.trips?.[0] || typeof j?.message === "string") {
            const msg = j?.message || "Optimization returned no trips.";
            setLastTripsError(msg);
            usedFallback = true;
          } else {
            // success: sort waypoints by waypoint_index to get travel order
            const wp = Array.isArray(j.waypoints) ? j.waypoints : j.trips?.[0]?.waypoints;
            let ordered: [number, number][] = [];
            if (
              Array.isArray(wp) &&
              wp.every(
                (w: any) => Array.isArray(w?.location) && typeof w?.waypoint_index === "number"
              )
            ) {
              ordered = wp
                .slice()
                .sort((a: any, b: any) => a.waypoint_index - b.waypoint_index)
                .map((w: any) => [Number(w.location[0]), Number(w.location[1])] as [number, number]);
            } else {
              ordered = slice;
            }

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

            // advance with overlap only on first chunk for round/start modes
            idx += idx === 0 && tripMode !== "no_home" ? MAX - 1 : MAX;
            legNum += 1;
            continue; // go process next chunk
          }
        }
      } catch (e: any) {
        setLastTripsError(`Network error: ${e?.message || String(e)}`);
        usedFallback = true;
      }

      // ---------- Fallback: no optimization; just use the slice order ----------
      {
        const ordered = slice;
        const g = buildGoogleMapsLinks(ordered);
        const a = buildAppleMapsLinks(ordered);
        const w = buildWazeStepLinks(ordered);

        setShare((prev) => [
          ...prev,
          {
            legLabel: `Leg ${legNum} (fallback, ${ordered.length} stops)`,
            google: g,
            apple: a,
            waze: w,
          },
        ]);

        idx += idx === 0 && tripMode !== "no_home" ? MAX - 1 : MAX;
        legNum += 1;
      }
    }

    if (usedFallback) {
      alert(
        "Optimization API unavailable for your token (or network error). Built non-optimized legs instead."
      );
    }
  }

  // ---------- Home helpers ----------
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

  // ---------- UI ----------
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/certis-logo.png"
            alt="Certis Biologicals"
            width={160}
            height={38}
            priority
            className="h-9 w-auto"
          />
          <span className="sr-only">Home</span>
        </Link>
        <h1 className="text-2xl font-semibold">Certis AgRoute Planner</h1>
        <span className="ml-2 rounded-full border px-2 py-0.5 text-xs text-gray-500">
          Retailer map &amp; trip builder
        </span>
      </div>

      {/* Controls */}
      <section className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-800/40 bg-neutral-900/40 p-3 md:grid-cols-2">
        {/* Basemap / markers */}
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded-md border px-3 py-1" onClick={reloadData}>
            Reload data
          </button>
          <button className="rounded-md border px-3 py-1" onClick={buildTrip}>
            Build Trip
          </button>

          <label className="ml-3 text-sm">Basemap</label>
          <select
            className="rounded-md border bg-black/40 px-2 py-1"
            value={basemapKey}
            onChange={(e) => setBasemapKey(e.target.value)}
          >
            {BASEMAPS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>

          <label className="ml-2 flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={flatMap}
              onChange={(e) => setFlatMap(e.target.checked)}
            />
            Flat map
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={allowRotate}
              onChange={(e) => setAllowRotate(e.target.checked)}
              disabled={flatMap}
            />
            Allow rotate
          </label>
          <label className="flex items-center gap-1 text-sm" title="Boost contrast on satellite imagery">
            <input
              type="checkbox"
              checked={sharpenImagery}
              onChange={(e) => setSharpenImagery(e.target.checked)}
              disabled={!basemap.sharpen}
            />
            Sharpen imagery
          </label>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">Category</label>
          <select
            className="rounded-md border bg-black/40 px-2 py-1"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label className="text-sm">Retailer</label>
          <select
            className="rounded-md border bg-black/40 px-2 py-1"
            value={retailerFilter}
            onChange={(e) => setRetailerFilter(e.target.value)}
          >
            <option value="">All</option>
            {retailerOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <label className="text-sm">Markers</label>
          <select
            className="rounded-md border bg-black/40 px-2 py-1"
            value={markerStyle}
            onChange={(e) => setMarkerStyle(e.target.value as any)}
          >
            <option value="logo">Logos</option>
            <option value="color">Colored dots</option>
          </select>
        </div>

        {/* Home */}
        <div className="col-span-1 md:col-span-2 flex flex-wrap items-center gap-2">
          <label className="text-sm">Home:</label>
          <input
            className="w-56 rounded-md border bg-black/40 px-2 py-1"
            placeholder="Enter address (city, ZIP, or full)"
            value={homeQuery}
            onChange={(e) => setHomeQuery(e.target.value)}
          />
          <button className="rounded-md border px-3 py-1" onClick={setHomeFromSearch}>
            Set from address
          </button>
          <button
            className={`rounded-md border px-3 py-1 ${
              homePickMode ? "border-yellow-400 text-yellow-300" : ""
            }`}
            onClick={() => setHomePickMode((v) => !v)}
          >
            Pick on map
          </button>
          <button className="rounded-md border px-3 py-1" onClick={clearHome}>
            Clear
          </button>

          <div className="ml-4 flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="tripmode"
                checked={tripMode === "round_home"}
                onChange={() => setTripMode("round_home")}
              />
              Round trip from Home
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="tripmode"
                checked={tripMode === "start_home"}
                onChange={() => setTripMode("start_home")}
              />
              Start at Home, end elsewhere
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="tripmode"
                checked={tripMode === "no_home"}
                onChange={() => setTripMode("no_home")}
              />
              No Home constraints
            </label>
          </div>
        </div>

        {/* States row */}
        <div className="col-span-1 md:col-span-2 flex flex-wrap items-center gap-2">
          <label className="text-sm">States:</label>
          <select
            className="rounded-md border bg-black/40 px-2 py-1"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value="">All</option>
            {stateOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="ml-2 text-xs text-gray-400">
            Tip: use chip buttons below for multi-state.
          </span>
        </div>
      </section>

      {/* Map + Legend */}
      <section className="grid grid-cols-[1fr_280px] gap-4">
        <div className="rounded-xl border border-gray-800/40 overflow-hidden">
          <MapView
            data={filteredGeojson || undefined}
            markerStyle={markerStyle}
            showLabels={true}
            labelColor="#fff200"
            mapStyle={basemap.uri}
            projection={flatMap ? "mercator" : "globe"}
            allowRotate={allowRotate && !flatMap}
            rasterSharpen={sharpenImagery && basemap.sharpen}
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

        <aside className="sticky top-4 h-fit rounded-xl border border-gray-800/40 bg-neutral-900/40 p-3">
          <Legend
            items={legendItems}
            selectedRetailer={retailerFilter || undefined}
            onSelect={(r) => setRetailerFilter(r ?? "")}
          />

          {(lastTripsUrl || lastTripsError) && (
            <div className="mt-3 rounded-md border border-gray-700/60 bg-black/30 p-2 text-xs">
              <div className="mb-1 font-semibold text-gray-300">Trips API diagnostics</div>
              {lastTripsUrl && (
                <div className="mb-1 break-all">
                  <div className="text-gray-400">URL</div>
                  <div>{lastTripsUrl}</div>
                </div>
              )}
              {lastTripsError && (
                <div className="break-all">
                  <div className="text-gray-400">Error</div>
                  <div className="whitespace-pre-wrap">{lastTripsError}</div>
                </div>
              )}
            </div>
          )}
        </aside>
      </section>

      {/* Send-to-phone links */}
      {share.length > 0 && (
        <section className="mt-4 rounded-xl border border-gray-800/40 bg-neutral-900/40 p-3">
          <div className="mb-2 text-sm font-semibold">Send to phone</div>
          <p className="mb-3 text-sm text-gray-400">
            Tap a link on your phone. Long trips may be split into multiple legs.
          </p>

          {share.map((leg, i) => (
            <div key={i} className="mb-3 rounded-lg border border-gray-800/60 p-2">
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

// Render a group of deep links
function LinkGroup({ label, urls }: { label: string; urls: string[] }) {
  if (!urls || urls.length === 0) {
    return (
      <div className="flex-1 rounded-md bg-gray-800/30 p-2 text-sm text-gray-400">
        {label}: not available
      </div>
    );
  }
  return (
    <div className="flex-1">
      <div className="mb-1 text-xs text-gray-400">{label}</div>
      <div className="flex flex-wrap gap-2">
        {urls.map((u, idx) => (
          <a
            key={idx}
            href={u}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-gray-700/60 px-2 py-1 text-sm hover:bg-gray-800/40"
          >
            {urls.length === 1 ? "Open" : `Open ${idx + 1}`}
          </a>
        ))}
      </div>
    </div>
  );
}
