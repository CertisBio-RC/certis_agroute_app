"use client";

import { useState, useMemo, useEffect } from "react";
import CertisMap from "@/components/CertisMap";
import SearchLocationsTile from "@/components/SearchLocationsTile";
import Image from "next/image";
import { Menu, X } from "lucide-react";

/* ==========================================================================
   🧭 STOP TYPE — MUST MATCH CertisMap.tsx EXACTLY
=========================================================================== */
export interface Stop {
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  coords: [number, number];
}

/* ==========================================================================
   🌗 THEME (Bailey Rule: Default DARK)
=========================================================================== */
function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const start = stored ? (stored as "light" | "dark") : "dark";
    setTheme(start);
    document.documentElement.classList.toggle("dark", start === "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return { theme, toggleTheme };
}

const norm = (s: string) => (s || "").trim().toLowerCase();
const upper = (s: string) => (s || "").toUpperCase();

/* ==========================================================================
   🌍 EXTERNAL MAP URLS
=========================================================================== */
function buildGoogleMapsUrl(stops: Stop[]) {
  if (!stops || stops.length < 2) return null;

  const encode = (s: Stop) =>
    encodeURIComponent(`${s.address}, ${s.city}, ${s.state} ${s.zip}`);

  const origin = encode(stops[0]);
  const destination = encode(stops[stops.length - 1]);
  const MAX = 8;

  const waypoints = stops
    .slice(1, -1)
    .slice(0, MAX)
    .map(encode)
    .join("|");

  return waypoints
    ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}`
    : `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
}

function buildAppleMapsUrl(stops: Stop[]) {
  if (!stops || stops.length < 2) return null;

  const encode = (s: Stop) =>
    encodeURIComponent(`${s.address}, ${s.city}, ${s.state} ${s.zip}`);

  const origin = encode(stops[0]);
  const dest = stops.slice(1).map(encode).join("+to:");

  return `http://maps.apple.com/?dirflg=d&saddr=${origin}&daddr=${dest}`;
}

/* ==========================================================================
   🚀 MAIN PAGE COMPONENT (K4 GOLD — CANONICAL)
=========================================================================== */
export default function Page() {
  const { theme, toggleTheme } = useTheme();

  /* --- FILTER STATE --- */
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableRetailers, setAvailableRetailers] = useState<string[]>([]);
  const [availableSuppliers, setAvailableSuppliers] = useState<string[]>([]);
  const [retailerSummary, setRetailerSummary] = useState<
    {
      retailer: string;
      count: number;
      suppliers: string[];
      categories: string[];
      states: string[];
    }[]
  >([]);

  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* --- TRIP BUILDER --- */
  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [tripMode, setTripMode] = useState<"entered" | "optimize">("entered");
  const [homeZip, setHomeZip] = useState("");
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);

  /* ==========================================================================
     🧭 ADD STOP
  ========================================================================== */
  const handleAddStop = (stop: Stop) => {
    setTripStops((prev) => {
      if (prev.some((s) => s.label === stop.label && s.address === stop.address))
        return prev;

      const nonHome = prev.filter((s) => !s.label.startsWith("Home"));
      const home = prev.find((s) => s.label.startsWith("Home"));

      return home ? [home, ...nonHome, stop] : [...prev, stop];
    });
  };

  /* ==========================================================================
     ❌ REMOVE STOP
  ========================================================================== */
  const handleRemoveStop = (index: number) => {
    setTripStops((prev) => prev.filter((_, i) => i !== index));
  };

  /* ==========================================================================
     🗑 CLEAR STOPS
  ========================================================================== */
  const handleClearStops = () => {
    setTripStops((prev) => prev.filter((s) => s.label.startsWith("Home")));
  };

  /* ==========================================================================
     📍 ZIP → GEOCOORDINATES
  ========================================================================== */
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  const handleGeocodeZip = async () => {
    if (!homeZip || !mapboxToken) return;

    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        homeZip
      )}.json?access_token=${mapboxToken}&limit=1`;

      const data = await (await fetch(url)).json();
      if (!data.features?.length) return;

      const f = data.features[0];
      const [lng, lat] = f.center;

      let city = "";
      let state = "";
      f.context?.forEach((c: any) => {
        if (c.id.startsWith("place")) city = c.text;
        if (c.id.startsWith("region"))
          state = c.short_code?.replace("US-", "") || c.text;
      });

      const newHome: Stop = {
        label: `Home (${homeZip})`,
        address: homeZip,
        city,
        state,
        zip: homeZip,
        coords: [lng, lat],
      };

      setHomeCoords([lng, lat]);
      setTripStops((prev) => {
        const others = prev.filter((s) => !s.label.startsWith("Home"));
        return [newHome, ...others];
      });
    } catch {}
  };

  /* ==========================================================================
     RETAILER SUMMARY (STATE-FIRST LOGIC)
  ========================================================================== */
  const filteredRetailersForSummary = useMemo(() => {
    if (selectedStates.length === 0) return availableRetailers;

    return retailerSummary
      .filter((s) =>
        s.states.some((st) => selectedStates.includes(norm(st)))
      )
      .map((s) => s.retailer)
      .filter((x, i, arr) => arr.indexOf(x) === i)
      .sort();
  }, [selectedStates, retailerSummary, availableRetailers]);

  const kingpinSummary = retailerSummary.filter(
    (s) => s.categories.includes("Kingpin") || norm(s.retailer) === "kingpin"
  );

  const normalSummary = retailerSummary.filter(
    (s) =>
      !s.categories.includes("Kingpin") && norm(s.retailer) !== "kingpin"
  );

  /* ==========================================================================
     TRIP ORDER (HOME FIRST)
  ========================================================================== */
  const stopsForRoute = useMemo(() => {
    if (!homeCoords) return tripStops;

    const homeStop = tripStops.find((s) => s.label.startsWith("Home"));
    const rest = tripStops.filter((s) => !s.label.startsWith("Home"));

    return homeStop ? [homeStop, ...rest] : tripStops;
  }, [tripStops, homeCoords]);

  /* ==========================================================================
     UI
  ========================================================================== */
  return (
    <div className="flex h-screen w-screen relative overflow-hidden">
      {/* MOBILE MENU BUTTON */}
      <button
        className="absolute top-3 left-3 z-20 p-2 bg-gray-800 text-white rounded-md md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* SIDEBAR */}
      <aside
        className={`fixed md:static top-0 left-0 h-full w-[600px] bg-gray-100 dark:bg-gray-900 p-4 border-r border-gray-300 dark:border-gray-700 overflow-y-auto z-10 transform transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* LOGO + THEME */}
        <div className="flex flex-col items-center mb-6 gap-3">
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

        {/* HOME ZIP */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">Home ZIP Code</h2>
          <div className="flex space-x-2">
            <input
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
            <p className="mt-2 text-sm text-yellow-400">Home set: {homeZip}</p>
          )}
        </div>

        {/* SEARCH TILE (Option A — sidebar only) */}
        <SearchLocationsTile allStops={allStops} onAddStop={handleAddStop} />

        {/* STATES FILTER */}
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
              className="px-2 py-1 bg-gray-400 text-white rounded text-sm"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1 max-h-32 overflow-y-auto">
            {availableStates.map((st) => {
              const n = norm(st);
              return (
                <label key={st} className="flex items-center space-x-2">
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
                  <span className="text-white">{upper(st)}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* RETAILERS FILTER */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">Retailers</h2>

          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() =>
                setSelectedRetailers(filteredRetailersForSummary.map(norm))
              }
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedRetailers([])}
              className="px-2 py-1 bg-gray-400 text-white rounded text-sm"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-4 max-h-48 overflow-y-auto">
            {availableRetailers.map((r) => {
              const n = norm(r);
              return (
                <label key={r} className="flex items-center space-x-2">
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
                  <span className="text-white">{r}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* SUPPLIERS FILTER */}
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
              className="px-2 py-1 bg-gray-400 text-white rounded text-sm"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-4 max-h-48 overflow-y-auto">
            {availableSuppliers.map((s) => (
              <label key={s} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedSuppliers.includes(s)}
                  onChange={() =>
                    setSelectedSuppliers((prev) =>
                      prev.includes(s)
                        ? prev.filter((x) => x !== s)
                        : [...prev, s]
                    )
                  }
                />
                <span className="text-white">{s}</span>
              </label>
            ))}
          </div>
        </div>

        {/* CATEGORIES FILTER */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">Categories</h2>

          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() =>
                setSelectedCategories(
                  ["Agronomy", "Grain/Feed", "C-Store/Service/Energy", "Distribution"].map(norm)
                )
              }
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedCategories([])}
              className="px-2 py-1 bg-gray-400 text-white rounded text-sm"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {["Agronomy", "Grain/Feed", "C-Store/Service/Energy", "Distribution"].map(
              (cat) => {
                const n = norm(cat);
                return (
                  <label key={cat} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(n)}
                      onChange={() =>
                        setSelectedCategories((prev) =>
                          prev.includes(n)
                            ? prev.filter((c) => c !== n)
                            : [...prev, n]
                        )
                      }
                    />
                    <span className="flex items-center text-white">{cat}</span>
                  </label>
                );
              }
            )}
          </div>
        </div>

        {/* CHANNEL SUMMARY */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 max-h-64 overflow-y-auto text-white">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">
            Channel Summary
          </h2>

          {normalSummary.map((s, i) => (
            <div key={i} className="mb-4 p-2 rounded bg-gray-700/40">
              <strong className="text-yellow-300 text-[17px]">{s.retailer}</strong>
              <br />
              <span>State(s): {s.states.map(upper).join(", ")}</span>
              <br />
              <span>Total Locations: {s.count}</span>
              <br />
              <span>Suppliers: {s.suppliers.join(", ") || "N/A"}</span>
              <br />
              <span>Categories: {s.categories.join(", ")}</span>
            </div>
          ))}

          {kingpinSummary.length > 0 && (
            <div className="mt-4 p-2 rounded bg-gray-800/60">
              <strong className="text-yellow-400">Kingpins:</strong>
              <br />
              <span className="text-yellow-200">
                {kingpinSummary.map((s) => s.retailer).join(", ")}
              </span>
            </div>
          )}
        </div>

        {/* TRIP BUILDER */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mt-4 text-white">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">Trip Optimization</h2>

          <div className="flex space-x-4 mb-3">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                value="entered"
                checked={tripMode === "entered"}
                onChange={() => setTripMode("entered")}
              />
              <span>Map as Entered</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                value="optimize"
                checked={tripMode === "optimize"}
                onChange={() => setTripMode("optimize")}
              />
              <span>Optimize Route</span>
            </label>
          </div>

          {tripStops.length > 0 ? (
            <div className="space-y-3">
              <ol className="ml-5 space-y-3">
                {tripStops.map((s, i) => (
                  <li
                    key={i}
                    className="flex justify-between items-start pb-2 border-b border-gray-300 dark:border-gray-600"
                  >
                    <div>
                      <div className="font-semibold text-yellow-300">{s.label}</div>
                      <div className="text-[14px]">
                        {s.address}
                        <br />
                        {s.city}, {s.state} {s.zip}
                      </div>
                    </div>

                    {!s.label.startsWith("Home") && (
                      <button
                        onClick={() => handleRemoveStop(i)}
                        className="ml-2 text-yellow-400 hover:text-yellow-200 text-[14px]"
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
                    href={buildGoogleMapsUrl(stopsForRoute)!}
                    target="_blank"
                    className="px-2 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                  >
                    Open in Google Maps
                  </a>
                )}

                {buildAppleMapsUrl(stopsForRoute) && (
                  <a
                    href={buildAppleMapsUrl(stopsForRoute)!}
                    target="_blank"
                    className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    Open in Apple Maps
                  </a>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-300">No stops added yet.</p>
          )}
        </div>
      </aside>

      {/* MAP PANEL */}
      <main className="flex-1 relative flex flex-col">
        <div className="w-full flex justify-end pr-6 pt-4 mb-3">
          <h1 className="text-xl font-bold text-yellow-400 tracking-wide">
            Certis Ag-Route Planner
          </h1>
        </div>

        <div className="flex-1">
          <CertisMap
            selectedStates={selectedStates}
            selectedRetailers={selectedRetailers}
            selectedCategories={selectedCategories}
            selectedSuppliers={selectedSuppliers}
            homeCoords={homeCoords}
            tripStops={stopsForRoute}
            routeGeoJSON={null}  {/* routing comes in next milestone */}
            onStatesLoaded={setAvailableStates}
            onRetailersLoaded={setAvailableRetailers}
            onSuppliersLoaded={setAvailableSuppliers}
            onRetailerSummary={setRetailerSummary}
            onAllStopsLoaded={setAllStops}
            onAddStop={handleAddStop}
          />
        </div>
      </main>
    </div>
  );
}
