// /app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import Link from "next/link";
import Image from "next/image";

import Map from "@/components/Map";
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

// Basemap presets (unchanged)
const BASEMAPS = [
  { key: "streets",   label: "Streets",   uri: "mapbox://styles/mapbox/streets-v12",           sharpen: false },
  { key: "outdoors",  label: "Outdoors",  uri: "mapbox://styles/mapbox/outdoors-v12",          sharpen: false },
  { key: "light",     label: "Light",     uri: "mapbox://styles/mapbox/light-v11",             sharpen: false },
  { key: "dark",      label: "Dark",      uri: "mapbox://styles/mapbox/dark-v11",              sharpen: false },
  { key: "satellite", label: "Satellite", uri: "mapbox://styles/mapbox/satellite-streets-v12", sharpen: true  },
];

type RetailerProps = Record<string, any>;
type TripMode = "round_home" | "start_home" | "no_home";

// NEW: structure to hold “Send to phone” links for each leg
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
  const [basemapKey, setBasemapKey] = useState<string>("streets");
  const [flatMap, setFlatMap] = useState<boolean>(true);
  const [allowRotate, setAllowRotate] = useState<boolean>(false);
  const [sharpenImagery, setSharpenImagery] = useState<boolean>(true);
  const basemap = BASEMAPS.find((b) => b.key === basemapKey) ?? BASEMAPS[0];

  // Home
  const [home, setHome] = useState<HomeLoc | null>(null);
  const [homeQuery, setHomeQuery] = useState("");
  const [homePickMode, setHomePickMode] = useState(false);
  const [tripMode, setTripMode] = useState<TripMode>("round_home");

  // NEW: share links state
  const [share, setShare] = useState<ShareLinks[]>([]);

  const mapboxToken =
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN || "";

  // Load once
  const reloadData = () => {
    const ts = Date.now();
    fetch(`/data/retailers.geojson?ts=${ts}`)
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

  // Legend items (unchanged)
  const legendItems: LegendItemInput[] = useMemo(() => {
    if (!filteredGeojson) return [];
    const seen = new Map<string, { name?: string; city?: string }>();
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

  // ---------- Build Trip (now produces deep links) ----------
  async function buildTrip() {
    if (!filteredGeojson) return alert("No points to build from.");
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

    // Chunk to ≤12 stops per request (Mapbox Optimized Trips limit)
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

        // Pull optimized ORDER from response
        const wp = Array.isArray(j.waypoints) ? j.waypoints : j.trips?.[0]?.waypoints;
        let ordered: [number, number][] = [];

        if (Array.isArray(wp) && wp.every((w: any) => Array.isArray(w?.location) && typeof w?.waypoint_index === "number")) {
          // Sort by waypoint_index (0..n in travel order)
          ordered = wp
            .slice()
            .sort((a: any, b: any) => a.waypoint_index - b.waypoint_index)
            .map((w: any) => [Number(w.location[0]), Number(w.location[1])] as [number, number]);
        } else {
          // Fallback: keep original slice order
          ordered = slice;
        }

        // Build deep links for this leg
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

      // Advance; for subsequent chunks we step by MAX-1 so the last dest becomes next origin smoothly
      idx += (idx === 0 && tripMode !== "no_home" ? MAX - 1 : MAX);
      legNum += 1;
    }
  }

  // ----- Home helpers (unchanged from your previous file, trimmed for brevity) -----
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
    <main className="relative mx-auto max-w-[1200px] px-4 py-6">
      {/* Brand Header */}
      <div className="mb-4 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/certis-logo.png" alt="Certis Biologicals" width={180} height={42} priority className="h-10 w-auto" />
          <span className="sr-only">Home</span>
        </Link>
        <div className="text-xl font-semibold">Certis AgRoute Planner</div>
        <div className="ml-2 rounded-full border px-2 py-0.5 text-xs text-gray-500">Retailer map &amp; trip builder</div>
      </div>

      {/* Controls (filters, basemap, etc.) — keep your current block here */}

      {/* Home controls (keep your current block; buttons call setHomeFromSearch / clearHome, etc.) */}

      {/* Map + Legend */}
      <div className="relative">
        <Map
          data={filteredGeojson || undefined}
          markerStyle={markerStyle}
          showLabels={true}
          labelColor="#fff200"
          mapStyle={(BASEMAPS.find(b=>b.key===basemapKey) ?? BASEMAPS[0]).uri}
          projection={flatMap ? "mercator" : "globe"}
          allowRotate={allowRotate && !flatMap}
          rasterSharpen={sharpenImagery && (BASEMAPS.find(b=>b.key===basemapKey)?.sharpen ?? false)}
          mapboxToken={mapboxToken}
          home={home}
          enableHomePick={homePickMode}
          onPickHome={(lng, lat) => { const loc = { lng, lat, label: "Home (map)" }; setHome(loc); saveHome(loc); setHomePickMode(false); }}
        />

        <div className="pointer-events-none absolute right-4 top-4 z-20">
          <Legend
            items={legendItems}
            selectedRetailer={retailerFilter || undefined}
            onSelect={(r) => setRetailerFilter(r ?? "")}
            className="pointer-events-auto"
          />
        </div>
      </div>

      {/* NEW: Send to phone panel */}
      {share.length > 0 && (
        <section className="mt-4 rounded-xl border border-gray-200 p-3">
          <div className="mb-2 text-sm font-semibold">Send to phone</div>
          <p className="mb-3 text-sm text-gray-600">
            Tap a link on your phone. For long trips, you’ll see multiple chunks.
          </p>

          {share.map((leg, i) => (
            <div key={i} className="mb-3 rounded-lg border border-gray-200 p-2">
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

// Small helper to render link groups
function LinkGroup({ label, urls }: { label: string; urls: string[] }) {
  if (!urls || urls.length === 0) return (
    <div className="flex-1 rounded-md bg-gray-50 p-2 text-sm text-gray-400">{label}: not available</div>
  );
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
            className="rounded-md border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
          >
            {urls.length === 1 ? "Open" : `Open ${idx + 1}`}
          </a>
        ))}
      </div>
    </div>
  );
}
