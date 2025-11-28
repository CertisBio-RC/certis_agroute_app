"use client";

import { useState, useMemo, useEffect } from "react";
import CertisMap, { categoryColors } from "@/components/CertisMap";
import SearchLocationsTile from "@/components/SearchLocationsTile";
import Image from "next/image";
import { Menu, X } from "lucide-react";

/* ============================================================================
   📌 STOP TYPE — used everywhere: trip list, search, map callbacks
============================================================================ */
export type Stop = {
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  coords: [number, number];
};

/* ============================================================================
   🌗 THEME (Bailey Rule — default = DARK)
============================================================================ */
function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const next = stored ? (stored as "light" | "dark") : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return { theme, toggleTheme };
}

/* ============================================================================
   🔧 HELPERS
============================================================================ */
const norm = (v: string) => (v || "").trim().toLowerCase();
const capState = (v: string) => (v || "").toUpperCase();

/* ============================================================================
   🌍 GOOGLE MAPS LINK
============================================================================ */
function buildGoogleMapsUrl(stops: Stop[]) {
  if (!stops || stops.length < 2) return null;

  const origin = encodeURIComponent(
    `${stops[0].address}, ${stops[0].city}, ${stops[0].state} ${stops[0].zip}`
  );
  const destination = encodeURIComponent(
    `${stops[stops.length - 1].address}, ${stops[stops.length - 1].city}, ${
      stops[stops.length - 1].state
    } ${stops[stops.length - 1].zip}`
  );

  const waypoints = stops
    .slice(1, -1)
    .map((s) => `${s.address}, ${s.city}, ${s.state} ${s.zip}`)
    .map(encodeURIComponent)
    .join("|");

  return waypoints
    ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}`
    : `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
}

/* ============================================================================
   🍏 APPLE MAPS LINK
============================================================================ */
function buildAppleMapsUrl(stops: Stop[]) {
  if (!stops || stops.length < 2) return null;

  const origin = encodeURIComponent(
    `${stops[0].address}, ${stops[0].city}, ${stops[0].state} ${stops[0].zip}`
  );

  const daddr = stops
    .slice(1)
    .map((s) => `${s.address}, ${s.city}, ${s.state} ${s.zip}`)
    .map(encodeURIComponent)
    .join("+to:");

  return `http://maps.apple.com/?dirflg=d&saddr=${origin}&daddr=${daddr}`;
}

/* ============================================================================
   🚀 MAIN PAGE COMPONENT — K4 GOLD FINAL
============================================================================ */
export default function Page() {
  const { theme, toggleTheme } = useTheme();

  /* ============================================
     FILTER STATE
  ============================================ */
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableRetailers, setAvailableRetailers] = useState<string[]>([]);
  const [availableSuppliers, setAvailableSuppliers] = useState<string[]>([]);

  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  /* ============================================
     CHANNEL SUMMARY (from CertisMap)
  ============================================ */
  const [retailerSummary, setRetailerSummary] = useState<
    {
      retailer: string;
      count: number;
      suppliers: string[];
      categories: string[];
      states: string[];
    }[]
  >([]);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* ============================================
     TRIP BUILDER
  ============================================ */
  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [tripMode, setTripMode] = useState<"entered" | "optimize">("entered");

  const [homeZip, setHomeZip] = useState("");
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);

  const [routeSummary, setRouteSummary] = useState<{
    distance_m: number;
    duration_s: number;
  } | null>(null);
  /* ============================================================================
     ➕ ADD STOP (Search or Map Click)
     Rules:
       • No duplicates
       • Home always stays at top (if present)
  ============================================================================ */
  const handleAddStop = (stop: Stop) => {
    setTripStops((prev) => {
      // Prevent duplicates by label + address
      if (prev.some((s) => s.label === stop.label && s.address === stop.address))
        return prev;

      const home = prev.find((s) => s.label.startsWith("Home"));
      const nonHome = prev.filter((s) => !s.label.startsWith("Home"));

      return home ? [home, ...nonHome, stop] : [...prev, stop];
    });
  };

  /* ============================================================================
     ➖ REMOVE STOP
  ============================================================================ */
  const handleRemoveStop = (index: number) => {
    setTripStops((prev) => prev.filter((_, i) => i !== index));
  };

  /* ============================================================================
     🧹 CLEAR STOPS — leaves HOME ZIP intact
  ============================================================================ */
  const handleClearStops = () => {
    setTripStops((prev) => prev.filter((s) => s.label.startsWith("Home")));
    setRouteSummary(null);
  };

  /* ============================================================================
     📍 GEOCODE HOME ZIP (Mapbox)
  ============================================================================ */
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

  const handleGeocodeZip = async () => {
    if (!homeZip || !mapboxToken) return;

    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          homeZip
        )}.json?access_token=${mapboxToken}&limit=1`
      );
      const data = await res.json();

      if (data.features?.length > 0) {
        const f = data.features[0];
        const [lng, lat] = f.center;

        let city = "";
        let state = "";

        f.context?.forEach((c: any) => {
          if (c.id.startsWith("place")) city = c.text;
          if (c.id.startsWith("region"))
            state = c.short_code?.replace("US-", "") || c.text;
        });

        const homeStop: Stop = {
          label: `Home (${homeZip})`,
          address: homeZip,
          city,
          state,
          zip: homeZip,
          coords: [lng, lat],
        };

        setHomeCoords([lng, lat]);

        setTripStops((prev) => {
          const withoutHome = prev.filter((s) => !s.label.startsWith("Home"));
          return [homeStop, ...withoutHome];
        });
      }
    } catch (err) {
      console.error("ZIP Geocode failed:", err);
    }
  };

  /* ============================================================================
     🚗 ROUTE ORDER (home → stops → home)
     Enforces the K4 Rule:
       • If home exists → trip becomes [home, ...rest, home]
       • If no home → trip is unchanged
  ============================================================================ */
  const stopsForRoute = useMemo(() => {
    const home = tripStops.find((s) => s.label.startsWith("Home"));
    const rest = tripStops.filter((s) => !s.label.startsWith("Home"));

    return home ? [home, ...rest, home] : tripStops;
  }, [tripStops]);

  /* ============================================================================
     🔁 CALLBACK FROM OPTIMIZED ROUTE
     Replaces tripStops with optimized list  
     while preserving the home → ... → home rule
  ============================================================================ */
  const handleOptimizedRoute = (optimized: Stop[]) => {
    if (optimized.length < 2) return;
    const start = optimized[0];
    const end = optimized[optimized.length - 1];
    const mid = optimized.slice(1, -1);
    setTripStops([start, ...mid, end]);
  };

  /* ============================================================================
     📊 CHANNEL SUMMARY FILTERING  
     Reflects BOTH:
       • Sleuth Mode (selectedRetailers)
       • Trip Mode (retailers in tripStops)
     And ALWAYS expands to full dataset per retailer.
  ============================================================================ */
  const expandedTargetRetailers = useMemo(() => {
    // From filter panel
    const fromFilter = selectedRetailers;

    // From trip builder (labels)
    const fromTrip = tripStops
      .map((s) => norm(s.label))
      .filter((x) => x !== "");

    const merged = [...fromFilter, ...fromTrip]
      .filter((v, i, arr) => arr.indexOf(v) === i);

    return merged;
  }, [selectedRetailers, tripStops]);

  const normalSummary = retailerSummary.filter(
    (s) =>
      !s.categories.includes("Kingpin") &&
      expandedTargetRetailers.includes(norm(s.retailer))
  );

  const kingpinSummary = retailerSummary.filter(
    (s) =>
      (s.categories.includes("Kingpin") ||
        norm(s.retailer) === "kingpin") &&
      expandedTargetRetailers.includes(norm(s.retailer))
  );

  /* ============================================================================
     🎨 BEGIN UI
  ============================================================================ */
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  return (
    <div className="flex h-screen w-screen relative overflow-hidden">
      {/* ============================================================
         📱 MOBILE MENU TOGGLE
      ============================================================ */}
      <button
        className="absolute top-3 left-3 z-20 p-2 bg-gray-800 text-white rounded-md md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* ============================================================
         🧭 SIDEBAR
      ============================================================ */}
      <aside
        className={`fixed md:static top-0 left-0 h-full w-[600px] bg-gray-100 dark:bg-gray-900 p-4 border-r border-gray-300 dark:border-gray-700 overflow-y-auto z-10 transform transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* LOGO + THEME BUTTON */}
        <div className="flex flex-col items-center justify-center mb-6 gap-3">
          <Image
            src={`${basePath}/certis-logo.png`}
            alt="Certis Logo"
            width={180}
            height={60}
            priority
          />

          <button
            onClick={toggleTheme}
            className="px-3 py-1 rounded text-[14px] font-semibold border border-yellow-500 text-yellow-400 hover:bg-yellow-600/20"
          >
            {theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          </button>
        </div>

        {/* HOME ZIP CODE */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-[16px] leading-tight">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">
            Home ZIP Code
          </h2>

          <div className="flex space-x-2">
            <input
              type="text"
              value={homeZip}
              onChange={(e) => setHomeZip(e.target.value)}
              placeholder="Enter ZIP"
              className="flex-1 p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700"
            />
            <button
              onClick={handleGeocodeZip}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Set
            </button>
          </div>

          {homeCoords && (
            <p className="mt-2 text-sm text-yellow-400">
              Home set: {homeZip}
            </p>
          )}
        </div>

        {/* SEARCH TILE */}
        <SearchLocationsTile allStops={allStops} onAddStop={handleAddStop} />
        {/* ============================================================
           🌎 STATES FILTER
        ============================================================ */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">States</h2>

          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() => setSelectedStates(availableStates.map(norm))}
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm"
            >
              Select All
            </button>

            <button
              onClick={() => setSelectedStates([])}
              className="px-2 py-1 bg-gray-500 text-white rounded text-sm"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {availableStates.map((state) => {
              const n = norm(state);
              return (
                <label key={state} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedStates.includes(n)}
                    onChange={() =>
                      setSelectedStates((prev) =>
                        prev.includes(n)
                          ? prev.filter((x) => x !== n)
                          : [...prev, n]
                      )
                    }
                  />
                  <span className="text-white">{state.toUpperCase()}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* ============================================================
           🏪 RETAILERS FILTER
        ============================================================ */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">Retailers</h2>

          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() =>
                setSelectedRetailers(
                  filteredRetailersForSummary.map((r) => norm(r))
                )
              }
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm"
            >
              Select All
            </button>

            <button
              onClick={() => setSelectedRetailers([])}
              className="px-2 py-1 bg-gray-500 text-white rounded text-sm"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {availableRetailers.map((retailer) => {
              const n = norm(retailer);
              return (
                <label key={retailer} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedRetailers.includes(n)}
                    onChange={() =>
                      setSelectedRetailers((prev) =>
                        prev.includes(n)
                          ? prev.filter((x) => x !== n)
                          : [...prev, n]
                      )
                    }
                  />
                  <span className="text-white">{retailer}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* ============================================================
           🏭 SUPPLIERS FILTER
        ============================================================ */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">Suppliers</h2>

          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() => setSelectedSuppliers(availableSuppliers)}
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm"
            >
              Select All
            </button>

            <button
              onClick={() => setSelectedSuppliers([])}
              className="px-2 py-1 bg-gray-500 text-white rounded text-sm"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {availableSuppliers.map((supplier) => (
              <label key={supplier} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedSuppliers.includes(supplier)}
                  onChange={() =>
                    setSelectedSuppliers((prev) =>
                      prev.includes(supplier)
                        ? prev.filter((x) => x !== supplier)
                        : [...prev, supplier]
                    )
                  }
                />
                <span className="text-white">{supplier}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ============================================================
           🗂️ CATEGORIES FILTER
        ============================================================ */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">Categories</h2>

          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() =>
                setSelectedCategories(
                  ["Agronomy", "Grain/Feed", "C-Store/Service/Energy", "Distribution"].map(
                    norm
                  )
                )
              }
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm"
            >
              Select All
            </button>

            <button
              onClick={() => setSelectedCategories([])}
              className="px-2 py-1 bg-gray-500 text-white rounded text-sm"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {["Agronomy", "Grain/Feed", "C-Store/Service/Energy", "Distribution"].map(
              (cat) => (
                <label key={cat} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(norm(cat))}
                    onChange={() =>
                      setSelectedCategories((prev) =>
                        prev.includes(norm(cat))
                          ? prev.filter((x) => x !== norm(cat))
                          : [...prev, norm(cat)]
                      )
                    }
                  />
                  <span className="flex items-center text-white">
                    <span
                      className="inline-block w-3 h-3 rounded-full mr-1"
                      style={{ backgroundColor: categoryColors[cat] }}
                    />
                    {cat}
                  </span>
                </label>
              )
            )}
          </div>
        </div>

        {/* ============================================================
           📊 CHANNEL SUMMARY (Sleuth + Trip Expansion)
        ============================================================ */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">
            Channel Summary
          </h2>

          <div className="max-h-48 overflow-y-auto text-white">
            {normalSummary.map((entry, i) => (
              <div key={i} className="p-2 mb-3 rounded bg-gray-700/40">
                <div className="text-yellow-300 font-bold text-[17px]">
                  {entry.retailer}
                </div>

                <div className="text-[15px]">
                  <div>State(s): {entry.states.join(", ")}</div>
                  <div>Total Locations: {entry.count}</div>
                  <div>Suppliers: {entry.suppliers.join(", ") || "N/A"}</div>
                  <div>Categories: {entry.categories.join(", ")}</div>
                </div>
              </div>
            ))}

            {kingpinSummary.length > 0 && (
              <div className="p-3 mt-4 rounded bg-gray-800/60">
                <div className="text-yellow-400 font-bold text-[17px]">
                  Kingpins
                </div>
                <div className="text-yellow-200 text-[15px]">
                  {kingpinSummary.map((s) => s.retailer).join(", ")}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================
           🚗 TRIP BUILDER
        ============================================================ */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">
            Trip Optimization
          </h2>

          {/* Radio Buttons */}
          <div className="flex space-x-4 mb-3">
            <label className="flex items-center space-x-2 text-white">
              <input
                type="radio"
                checked={tripMode === "entered"}
                onChange={() => setTripMode("entered")}
              />
              <span>Map as Entered</span>
            </label>

            <label className="flex items-center space-x-2 text-white">
              <input
                type="radio"
                checked={tripMode === "optimize"}
                onChange={() => setTripMode("optimize")}
              />
              <span>Optimize Route</span>
            </label>
          </div>

          {/* Route Summary */}
          {routeSummary && (
            <div className="p-2 mb-3 rounded bg-gray-700 text-gray-200 text-[15px]">
              <strong>
                {(routeSummary.distance_m / 1609.34).toFixed(1)} miles •{" "}
                {(routeSummary.duration_s / 60).toFixed(0)} minutes
              </strong>
              <br />
              {tripMode === "optimize"
                ? "Optimized for shortest driving time"
                : "Mapped in entered order"}
            </div>
          )}

          {/* Stop List */}
          {tripStops.length > 0 ? (
            <div className="space-y-3">
              <ol className="ml-5 space-y-3 text-[15px]">
                {tripStops.map((stop, idx) => (
                  <li
                    key={idx}
                    className="pb-2 border-b border-gray-600 flex justify-between"
                  >
                    <div>
                      <div className="text-yellow-300 font-semibold">
                        {stop.label}
                      </div>
                      <div className="text-white text-[14px]">
                        {stop.address}
                        <br />
                        {stop.city}, {stop.state} {stop.zip}
                      </div>
                    </div>

                    {!stop.label.startsWith("Home") && (
                      <button
                        onClick={() => handleRemoveStop(idx)}
                        className="text-yellow-400 hover:text-yellow-200 text-[14px]"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ol>

              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  onClick={handleClearStops}
                  className="px-2 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  Clear All
                </button>

                {buildGoogleMapsUrl(stopsForRoute) && (
                  <a
                    href={buildGoogleMapsUrl(stopsForRoute) || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                  >
                    Open in Google Maps
                  </a>
                )}

                {buildAppleMapsUrl(stopsForRoute) && (
                  <a
                    href={buildAppleMapsUrl(stopsForRoute) || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    Open in Apple Maps
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-[15px]">No stops added yet.</div>
          )}
        </div>
      </aside>

      {/* ============================================================
         🗺️ MAP PANEL
      ============================================================ */}
      <main className="flex-1 relative flex flex-col">
        <div className="w-full flex justify-end pr-6 pt-4 mb-3">
          <h1 className="text-xl font-bold text-yellow-400 tracking-wide">
            Certis Ag-Route Planner
          </h1>
        </div>

        <div className="flex-1">
          <CertisMap
            selectedCategories={selectedCategories}
            selectedStates={selectedStates}
            selectedSuppliers={selectedSuppliers}
            selectedRetailers={selectedRetailers}
            homeCoords={homeCoords}
            onStatesLoaded={setAvailableStates}
            onRetailersLoaded={setAvailableRetailers}
            onSuppliersLoaded={setAvailableSuppliers}
            onRetailerSummary={setRetailerSummary}
            onAddStop={handleAddStop}
            onAllStopsLoaded={setAllStops}
            tripStops={stopsForRoute}
            tripMode={tripMode}
            onRouteSummary={setRouteSummary}
            onOptimizedRoute={handleOptimizedRoute}
          />
        </div>
      </main>
    </div>
  );
}
