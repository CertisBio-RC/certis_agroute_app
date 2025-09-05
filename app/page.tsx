// /app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Point } from "geojson";

import MapView from "@/components/Map";
import Legend, { type LegendItemInput } from "@/components/Legend";

import {
  applyFilters,
  distinctValues,
  readCategory,
  readRetailer,
  readState,
} from "@/utils/filtering";

import { geocodeAddress, loadHome, saveHome, type HomeLoc } from "@/utils/home";
import { buildAppleMapsLinks, buildGoogleMapsLinks, buildWazeStepLinks } from "@/utils/navLinks";
import { withBasePath } from "@/utils/paths";

// Basemap presets
const BASEMAPS = [
  { key: "streets",   label: "Streets",   uri: "mapbox://styles/mapbox/streets-v12",           sharpen: false },
  { key: "outdoors",  label: "Outdoors",  uri: "mapbox://styles/mapbox/outdoors-v12",          sharpen: false },
  { key: "light",     label: "Light",     uri: "mapbox://styles/mapbox/light-v11",             sharpen: false },
  { key: "dark",      label: "Dark",      uri: "mapbox://styles/mapbox/dark-v11",              sharpen: false },
  { key: "satellite", label: "Satellite", uri: "mapbox://styles/mapbox/satellite-streets-v12", sharpen: true  },
];

type RetailerProps = Record<string, any>;
type TripMode = "round_home" | "start_home" | "no_home";

type ShareLinks = {
  legLabel: string;
  google: string[];
  apple: string[];
  waze: string[];
};

export default function Page() {
  const [raw, setRaw] = useState<FeatureCollection<Point, RetailerProps> | null>(null);

  // Filters
  const [stateFilter, setStateFilter] = useState<string>("");
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set());
  const [retailerFilter, setRetailerFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // Marker + basemap UI
  const [markerStyle, setMarkerStyle] = useState<"logo" | "color">("logo");
  const [basemapKey, setBasemapKey] = useState<string>("satellite"); // default Satellite
  const [flatMap, setFlatMap] = useState<boolean>(true);
  const [allowRotate, setAllowRotate] = useState<boolean>(false);
  const [sharpenImagery, setSharpenImagery] = useState<boolean>(true);
  const basemap = BASEMAPS.find((b) => b.key === basemapKey) ?? BASEMAPS[0];

  // Home
  const [home, setHome] = useState<HomeLoc | null>(null);
  const [homeQuery, setHomeQuery] = useState("");
  const [homePickMode, setHomePickMode] = useState(false);
  const [tripMode, setTripMode] = useState<TripMode>("round_home");

  // Share links
  const [share, setShare] = useState<ShareLinks[]>([]);

  const mapboxToken =
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN || "";

  // Load once
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
  useEffect(() => { reloadData(); setHome(loadHome()); }, []);

  // Distinct options
  const stateOptions = useMemo(() => distinctValues(raw, readState), [raw]);
  const retailerOptions = useMemo(() => distinctValues(raw, readRetailer), [raw]);
  const categoryOptions = useMemo(() => distinctValues(raw, readCategory), [raw]);

  // Apply filters
  const filteredGeojson: FeatureCollection<Point, RetailerProps> | null = useMemo(() => {
    if (!raw) return null;
    return applyFilters(raw, { state: stateFilter, states: selectedStates, retailer: retailerFilter, category: categoryFilter });
  }, [raw, stateFilter, selectedStates, retailerFilter, categoryFilter]);

  // Legend items
  const legendItems: LegendItemInput[] = useMemo(() => {
    if (!filteredGeojson) return [];
    const seen = new (globalThis as any).Map<string, { name?: string; city?: string }>();
    for (const f of filteredGeojson.features) {
      const p = f.properties || {};
      const retailer = typeof p.retailer === "string" && p.retailer.trim()
        ? p.retailer.trim()
        : (typeof p.Retailer === "string" ? p.Retailer.trim() : "");
      if (!retailer || seen.has(retailer)) continue;
      const name = typeof p.name === "string" ? p.name.trim() : (typeof p.Name === "string" ? p.Name.trim() : "");
      const city = typeof p.city === "string" ? p.city.trim() : (typeof p.City === "string" ? p.City.trim() : "");
      seen.set(retailer, { name, city });
    }
    return Array.from(seen.entries()).map(([retailer, sample]) => ({
      retailer, sampleName: sample.name, sampleCity: sample.city,
    }));
  }, [filteredGeojson]);

  // ---------- Build Trip with robust error messaging ----------
  async function buildTrip() {
    if (!filteredGeojson) return alert("No points to build from.");
    if (!mapboxToken || !mapboxToken.startsWith("pk.")) {
      return alert("Missing/invalid Mapbox public token. Check the GitHub secret MAPBOX_PUBLIC_TOKEN.");
    }
    setShare([]); // reset previous links

    // Pull coordinates from filtered set
    const points = filteredGeojson.features
      .map((f) => f.geometry?.coordinates as [number, number])
      .filter(Boolean);

    if (points.length === 0) return alert("No stops available after filtering.");

    // Compose coordinates list with optional Home at start/end
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

    const MAX = 12;
    let idx = 0;
    let legNum = 1;

    while (idx < coords.length) {
      const slice = coords.slice(idx, idx + MAX);
      if (slice.length < 2) break;

      const coordStr = slice.map((c) => `${c[0]},${c[1]}`).join(";");
      const url = `https://api.mapbox.com/optimized-trips/v2/driving/${coordStr}?${params.toString()}&access_token=${encodeURIComponent(mapboxToken)}`;

      try {
        const resp = await fetch(url, { mode: "cors" });
        const text = await resp.text();
        if (!resp.ok) {
          // Try to parse Mapbox JSON error for a helpful message
          let apiMsg = "";
          try { apiMsg = JSON.parse(text)?.message || ""; } catch {}
          throw new Error(`Mapbox ${resp.status} ${resp.statusText}${apiMsg ? `: ${apiMsg}` : ""}`);
        }
        const j = JSON.parse(text);

        const wp = Array.isArray(j?.waypoints) ? j.waypoints : j?.trips?.[0]?.waypoints;
        let ordered: [number, number][] = [];

        if (Array.isArray(wp) && wp.every((w: any) => Array.isArray(w?.location) && typeof w?.waypoint_index === "number")) {
          ordered = wp
            .slice()
            .sort((a: any, b: any) => a.waypoint_index - b.waypoint_index)
            .map((w: any) => [Number(w.location[0]), Number(w.location[1])] as [number, number]);
        } else {
          ordered = slice;
        }

        // Build deep links
        const g = buildGoogleMapsLinks(ordered);
        const a = buildAppleMapsLinks(ordered);
        const w = buildWazeStepLinks(ordered);

        setShare((prev) => [
          ...prev,
          { legLabel: `Leg ${legNum} (${ordered.length} stops)`, google: g, apple: a, waze: w },
        ]);
      } catch (e: any) {
        console.error("Optimized Trips error:", e);
        alert(`Trip build failed: ${e?.message || e}`);
        break;
      }

      idx += (idx === 0 && tripMode !== "no_home" ? MAX - 1 : MAX);
      legNum += 1;
    }
  }

  // ----- Home helpers -----
  async function setHomeFromSearch() {
    if (!homeQuery.trim()) return;
    try {
      const loc = await geocodeAddress(homeQuery.trim(), mapboxToken);
      setHome(loc); saveHome(loc);
    } catch (e: any) {
      alert(e?.message || "Could not find that address.");
    }
  }
  function clearHome() { setHome(null); saveHome(null); }

  // ----- Render -----
  return (
    <main className="relative mx-auto max-w-[1200px] px-4 py-6 text-gray-100">
      {/* Brand header */}
      <div className="mb-4 flex items-center gap-3">
        <a href={withBasePath("/")} className="flex items-center gap-3">
          <img
            src={withBasePath("/certis-logo.png")}
            alt="Certis Biologicals"
            width={160}
            height={40}
            className="h-10 w-auto"
          />
          <span className="sr-only">Home</span>
        </a>
        <div className="text-2xl font-semibold">Certis AgRoute Planner</div>
        <div className="ml-2 rounded-full border border-gray-600 px-2 py-0.5 text-xs text-gray-400">Retailer map &amp; trip builder</div>
      </div>

      {/* Controls */}
      <header className="mb-3 rounded-xl bg-[#0f1420] p-4 shadow">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button className="rounded-md border border-gray-600 px-3 py-2 hover:bg-gray-800" onClick={reloadData}>Reload data</button>
          <button className="rounded-md bg-blue-600 px-3 py-2 hover:bg-blue-500" onClick={buildTrip}>Build Trip</button>

          <div className="ml-auto" />
          <div className="flex items-center gap-2">
            <label className="text-sm">Category</label>
            <select className="min-w-[180px] rounded-md bg-gray-900 px-2 py-1"
              value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All</option>
              {categoryOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm">Retailer</label>
            <select className="min-w-[220px] rounded-md bg-gray-900 px-2 py-1"
              value={retailerFilter} onChange={(e) => setRetailerFilter(e.target.value)}>
              <option value="">All</option>
              {retailerOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm">Markers</label>
            <select className="rounded-md bg-gray-900 px-2 py-1"
              value={markerStyle} onChange={(e) => setMarkerStyle(e.target.value as any)}>
              <option value="logo">Logos</option>
              <option value="color">Colors</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm">Basemap</label>
            <select className="rounded-md bg-gray-900 px-2 py-1"
              value={basemapKey} onChange={(e) => setBasemapKey(e.target.value)}>
              {BASEMAPS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={flatMap} onChange={(e) => setFlatMap(e.target.checked)} />Flat map</label>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={allowRotate} onChange={(e) => setAllowRotate(e.target.checked)} disabled={flatMap} />Allow rotate</label>
          <label className="flex items-center gap-1 text-sm" title="Boost contrast on satellite imagery">
            <input type="checkbox" checked={sharpenImagery} onChange={(e) => setSharpenImagery(e.target.checked)} disabled={!basemap.sharpen} />Sharpen imagery
          </label>
        </div>
      </header>

      {/* Home controls */}
      <section className="mb-3 rounded-xl bg-[#0f1420] p-4 shadow">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <label className="w-12 shrink-0 text-sm text-gray-400">Home</label>
          <input
            className="min-w-[260px] flex-1 rounded-md bg-gray-900 px-3 py-2"
            placeholder="Enter address (city, ZIP, or full address)"
            value={homeQuery}
            onChange={(e) => setHomeQuery(e.target.value)}
          />
          <button className="rounded-md border border-gray-600 px-3 py-2 hover:bg-gray-800" onClick={setHomeFromSearch}>Set from address</button>
          <button className="rounded-md border border-gray-600 px-3 py-2 hover:bg-gray-800" onClick={() => setHomePickMode(true)}>Pick on map</button>
          <button className="rounded-md border border-gray-600 px-3 py-2 hover:bg-gray-800" onClick={clearHome}>Clear</button>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="tm" checked={tripMode === "round_home"} onChange={() => setTripMode("round_home")} />Round trip from Home</label>
          <label className="flex items-center gap-2"><input type="radio" name="tm" checked={tripMode === "start_home"} onChange={() => setTripMode("start_home")} />Start at Home, end elsewhere</label>
          <label className="flex items-center gap-2"><input type="radio" name="tm" checked={tripMode === "no_home"} onChange={() => setTripMode("no_home")} />No Home constraints</label>
          <span className="text-gray-400">Current: {home ? `${home.label || ""}` : "None"}</span>
        </div>
      </section>

      {/* States + grid layout: map left, legend right */}
      <section className="mb-3 rounded-xl bg-[#0f1420] p-4 shadow">
        <div className="flex items-center gap-3">
          <label className="text-sm">States</label>
          <select className="min-w-[140px] rounded-md bg-gray-900 px-2 py-1"
            value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">All</option>
            {stateOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <span className="text-sm text-gray-400">Tip: use chip buttons below for multi-state.</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {["IA","IL","IN","MI","MN","ND","NE","OH","SD"].map((s) => {
            const active = selectedStates.has(s);
            return (
              <button
                key={s}
                onClick={() => {
                  const next = new Set(selectedStates);
                  active ? next.delete(s) : next.add(s);
                  setSelectedStates(next);
                  // When using chip mode, clear single select to avoid conflicts
                  if (next.size > 0) setStateFilter("");
                }}
                className={`rounded-full px-3 py-1 text-sm ${active ? "bg-blue-600" : "bg-gray-800 hover:bg-gray-700"}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </section>

      {/* Two-column: Map | Legend */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="relative rounded-xl bg-[#0f1420] p-2 shadow">
          <MapView
            data={filteredGeojson || undefined}
            markerStyle={markerStyle}
            showLabels={true}
            labelColor="#fff200"
            mapStyle={basemap.uri}
            projection={flatMap ? "mercator" : "globe"}
            allowRotate={allowRotate && !flatMap}
            rasterSharpen={sharpenImagery && !!basemap.sharpen}
            mapboxToken={mapboxToken}
            home={home}
            enableHomePick={homePickMode}
            onPickHome={(lng, lat) => { const loc = { lng, lat, label: "Home (map)" }; setHome(loc); saveHome(loc); setHomePickMode(false); }}
          />
        </div>

        <aside className="rounded-xl bg-[#0f1420] p-3 shadow">
          <Legend
            items={legendItems}
            selectedRetailer={retailerFilter || undefined}
            onSelect={(r) => setRetailerFilter(r ?? "")}
            className="pointer-events-auto"
          />
        </aside>
      </div>

      {/* Send to phone panel */}
      {share.length > 0 && (
        <section className="mt-4 rounded-xl bg-[#0f1420] p-3 shadow">
          <div className="mb-2 text-sm font-semibold">Send to phone</div>
          <p className="mb-3 text-sm text-gray-400">
            Tap a link on your phone. For long trips, you’ll see multiple chunks.
          </p>

          {share.map((leg, i) => (
            <div key={i} className="mb-3 rounded-lg border border-gray-700 p-2">
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

function LinkGroup({ label, urls }: { label: string; urls: string[] }) {
  if (!urls || urls.length === 0) return (
    <div className="flex-1 rounded-md bg-gray-900 p-2 text-sm text-gray-500">{label}: not available</div>
  );
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
            className="rounded-md border border-gray-700 px-2 py-1 text-sm hover:bg-gray-800"
          >
            {urls.length === 1 ? "Open" : `Open ${idx + 1}`}
          </a>
        ))}
      </div>
    </div>
  );
}
