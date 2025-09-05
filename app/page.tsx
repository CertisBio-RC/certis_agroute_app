// /app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import Link from "next/link";
import Image from "next/image";

// Import the map component with a non-conflicting name
import AgMap from "@/components/Map";
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

// ---------------- Helpers ----------------
function withBasePath(p: string) {
  const repo = (process.env.NEXT_PUBLIC_REPO_NAME || process.env.REPO_NAME || "").trim();
  const base = repo ? `/${repo}` : "";
  const path = p.startsWith("/") ? p : `/${p}`;
  return `${base}${path}`;
}

// ---------- Basemap presets ----------
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
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const basemap = useMemo(
    () => BASEMAPS.find((b) => b.key === basemapKey) ?? BASEMAPS[0],
    [basemapKey]
  );

  // Home
  const [home, setHome] = useState<HomeLoc | null>(null);
  const [homeQuery, setHomeQuery] = useState("");
  const [homePickMode, setHomePickMode] = useState(false);
  const [tripMode, setTripMode] = useState<TripMode>("round_home");

  // share links
  const [share, setShare] = useState<ShareLinks[]>([]);

  const mapboxToken =
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN || "";

  // --------- Load data + home once ----------
  const reloadData = () => {
    setLoading(true);
    setLoadError(null);
    const ts = Date.now();
    const url = withBasePath(`/data/retailers.geojson`) + `?ts=${ts}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch ${url} (${r.status})`);
        return r.json();
      })
      .then((j) => {
        setRaw(j);
        setLoading(false);
      })
      .catch((e) => {
        console.error("Failed to load retailers.geojson", e);
        setLoadError(e?.message || "Failed to load data");
        setLoading(false);
      });
  };

  useEffect(() => {
    reloadData();
    setHome(loadHome());
  }, []);

  // Persist basemap
  useEffect(() => {
    try {
      const saved = localStorage.getItem("basemapKey");
      if (saved) setBasemapKey(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("basemapKey", basemapKey);
    } catch {}
  }, [basemapKey]);

  // Distinct options
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

  // Legend items — use globalThis.Map so nothing shadows it
  const legendItems: LegendItemInput[] = useMemo(() => {
    if (!filteredGeojson) return [];
    const seen = new globalThis.Map<string, { name?: string; city?: string }>();
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

  // ---------- Build Trip ----------
  async function buildTrip() {
    if (!filteredGeojson) return alert("No points to build from.");
    setShare([]); // reset previous links

    const points = filteredGeojson.features
      .map((f) => f.geometry?.coordinates as [number, number])
      .filter(Boolean);

    if (points.length === 0) return alert("No stops available after filtering.");

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
      const url = `https://api.mapbox.com/optimized-trips/v2/driving/${coordStr}?${params.toString()}&access_token=${mapboxToken}`;

      try {
        const r = await fetch(url);
        const j: any = await r.json();
        if (!r.ok || !j?.trips?.[0]) throw new Error(j?.message || `API error (${r.status})`);

        const wp = Array.isArray(j.waypoints) ? j.waypoints : j.trips?.[0]?.waypoints;
        let ordered: [number, number][] = [];

        if (
          Array.isArray(wp) &&
          wp.every((w: any) => Array.isArray(w?.location) && typeof w?.waypoint_index === "number")
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
          { legLabel: `Leg ${legNum} (${ordered.length} stops)`, google: g, apple: a, waze: w },
        ]);
      } catch (e: any) {
        console.error("Optimized Trips error:", e);
        alert(`Trip build failed: ${e?.message || e}`);
        break;
      }

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

  // ---------- Render ----------
  return (
    <main className="wrap">
      {/* Header */}
      <div className="header-row">
        <Link href="/" className="brand">
          <Image
            src="/certis-logo.png"
            alt="Certis Biologicals"
            width={176}
            height={40}
            priority
            className="brand-logo"
          />
          <span className="sr-only">Home</span>
        </Link>
        <h1>Certis AgRoute Planner</h1>
        <div className="subtitle">Retailer map &amp; trip builder</div>
      </div>

      {/* Top controls */}
      <div className="controls">
        <div className="group">
          <button className="btn" onClick={reloadData}>Reload data</button>
          <button className="btn primary" onClick={buildTrip}>Build Trip</button>
        </div>

        <div className="group">
          <label>Category</label>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="group">
          <label>Retailer</label>
          <select value={retailerFilter} onChange={(e) => setRetailerFilter(e.target.value)}>
            <option value="">All</option>
            {retailerOptions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="group">
          <label>Markers</label>
          <select
            value={markerStyle}
            onChange={(e) => setMarkerStyle(e.target.value as "logo" | "color")}
          >
            <option value="logo">Logos</option>
            <option value="color">Colors</option>
          </select>
        </div>

        <div className="group">
          <label>Basemap</label>
          <select value={basemapKey} onChange={(e) => setBasemapKey(e.target.value)}>
            {BASEMAPS.map((b) => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </select>
          <label className="inline">
            <input type="checkbox" checked={flatMap} onChange={(e) => setFlatMap(e.target.checked)} />
            Flat map
          </label>
          <label className="inline">
            <input
              type="checkbox"
              checked={allowRotate}
              onChange={(e) => setAllowRotate(e.target.checked)}
              disabled={flatMap}
            />
            Allow rotate
          </label>
          <label className="inline" title="Boost contrast on satellite imagery">
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

      {/* Home controls */}
      <div className="controls">
        <div className="group">
          <label>Home</label>
          <input
            className="text"
            type="text"
            placeholder="Enter address (city, ZIP, or full address)"
            value={homeQuery}
            onChange={(e) => setHomeQuery(e.target.value)}
          />
          <button className="btn" onClick={setHomeFromSearch}>Set from address</button>
          <button className="btn" onClick={() => setHomePickMode(true)}>Pick on map</button>
          <button className="btn" onClick={clearHome}>Clear</button>
        </div>

        <div className="group radios">
          <label className="inline">
            <input
              type="radio"
              checked={tripMode === "round_home"}
              onChange={() => setTripMode("round_home")}
            />
            Round trip from Home
          </label>
          <label className="inline">
            <input
              type="radio"
              checked={tripMode === "start_home"}
              onChange={() => setTripMode("start_home")}
            />
            Start at Home, end elsewhere
          </label>
          <label className="inline">
            <input
              type="radio"
              checked={tripMode === "no_home"}
              onChange={() => setTripMode("no_home")}
            />
            No Home constraints
          </label>
          {home?.label && (
            <div className="current-home">
              <strong>Current:</strong>&nbsp;{home.label}
            </div>
          )}
        </div>
      </div>

      {/* States */}
      <div className="controls">
        <div className="group">
          <label>States</label>
          <select
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setSelectedStates(new Set());
            }}
          >
            <option value="">All</option>
            {stateOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <span className="hint">Tip: use chip buttons below for multi-state.</span>

          <div className="chips">
            {stateOptions.map((s) => {
              const active = selectedStates.has(s);
              return (
                <button
                  key={s}
                  className={`chip ${active ? "active" : ""}`}
                  onClick={() => {
                    const next = new Set(selectedStates);
                    if (active) next.delete(s);
                    else next.add(s);
                    setSelectedStates(next);
                    setStateFilter(""); // chip mode → clear single-select
                  }}
                >
                  {s}
                </button>
              );
            })}
            {selectedStates.size > 0 && (
              <button className="btn" onClick={() => setSelectedStates(new Set())}>Clear</button>
            )}
          </div>
        </div>
      </div>

      {/* Map + Legend */}
      <div className="map-wrap">
        <AgMap
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
          onPickHome={(lng, lat) => {
            const loc = { lng, lat, label: "Home (map)" };
            setHome(loc);
            saveHome(loc);
            setHomePickMode(false);
          }}
        />

        <div className="legend-fab">
          <Legend
            items={legendItems}
            selectedRetailer={retailerFilter || undefined}
            onSelect={(r) => setRetailerFilter(r ?? "")}
          />
        </div>

        {loading && <div className="loading">Loading data…</div>}
        {!loading && loadError && (
          <div className="error">
            <div>Data failed to load.</div>
            <code>{loadError}</code>
          </div>
        )}
      </div>

      {/* Send-to-phone panel */}
      {share.length > 0 && (
        <section className="share">
          <div className="share-title">Send to phone</div>
          <p className="share-hint">Tap a link on your phone. Long trips are split into multiple chunks.</p>

          {share.map((leg, i) => (
            <div key={i} className="share-leg">
              <div className="share-leg-title">{leg.legLabel}</div>
              <div className="share-groups">
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

// Helper to render link groups
function LinkGroup({ label, urls }: { label: string; urls: string[] }) {
  if (!urls || urls.length === 0)
    return <div className="share-empty">{label}: not available</div>;
  return (
    <div className="share-col">
      <div className="share-col-title">{label}</div>
      <div className="share-links">
        {urls.map((u, idx) => (
          <a key={idx} href={u} target="_blank" rel="noopener noreferrer" className="share-link">
            {urls.length === 1 ? "Open" : `Open ${idx + 1}`}
          </a>
        ))}
      </div>
    </div>
  );
}
