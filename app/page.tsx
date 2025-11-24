"use client";

import { useState, useMemo, useEffect } from "react";
import CertisMap, { categoryColors, Stop } from "@/components/CertisMap";
import SearchLocationsTile from "@/components/SearchLocationsTile";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

/* ----------------------------------------------
   🌓 THEME HANDLER
---------------------------------------------- */
function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const initial = stored ? (stored as "light" | "dark") : "dark";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return { theme, toggleTheme };
}

/* ----------------------------------------------
   🧭 HELPERS
---------------------------------------------- */
const norm = (val: string) => (val || "").toString().trim().toLowerCase();
const capitalizeState = (val: string) => (val || "").toUpperCase();

/* ----------------------------------------------
   🌍 GOOGLE MAPS EXPORT
---------------------------------------------- */
function buildGoogleMapsUrl(stops: Stop[]) {
  if (!stops || stops.length < 2) return null;

  const origin = encodeURIComponent(
    `${stops[0].address}, ${stops[0].city}, ${stops[0].state} ${stops[0].zip}`
  );
  const destination = encodeURIComponent(
    `${stops[stops.length - 1].address}, ${stops[stops.length - 1].city} ${
      stops[stops.length - 1].state
    } ${stops[stops.length - 1].zip}`
  );

  const MAX_WAYPOINTS = 8;
  const waypoints = stops
    .slice(1, -1)
    .slice(0, MAX_WAYPOINTS)
    .map((s) => `${s.address}, ${s.city}, ${s.state} ${s.zip}`)
    .map(encodeURIComponent)
    .join("|");

  return waypoints
    ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}`
    : `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
}

/* ----------------------------------------------
   🍏 APPLE MAPS EXPORT
---------------------------------------------- */
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

/* =========================================================
   🌟 MAIN PAGE COMPONENT
========================================================= */
export default function Page() {
  const { theme, toggleTheme } = useTheme();

  /* 🎛 FILTER STATE */
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableRetailers, setAvailableRetailers] = useState<string[]>([]);
  const [availableSuppliers, setAvailableSuppliers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [retailerSummary, setRetailerSummary] = useState<
    { retailer: string; count: number; suppliers: string[]; categories: string[]; states: string[] }[]
  >([]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allStops, setAllStops] = useState<Stop[]>([]);

  /* 🚗 TRIP BUILDER */
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [tripMode, setTripMode] = useState<"entered" | "optimize">("entered");
  const [homeZip, setHomeZip] = useState("");
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);
  const [routeSummary, setRouteSummary] = useState<{
    distance_m: number;
    duration_s: number;
  } | null>(null);

  /* ➕ ADD STOP */
  const handleAddStop = (stop: Stop) => {
    setTripStops((prev) => {
      if (prev.some((s) => s.label === stop.label && s.address === stop.address))
        return prev;

      const nonHome = prev.filter((s) => !s.label.startsWith("Home"));
      const home = prev.find((s) => s.label.startsWith("Home"));
      return home ? [home, ...nonHome, stop] : [...prev, stop];
    });
  };

  /* ❌ REMOVE STOP */
  const handleRemoveStop = (index: number) => {
    setTripStops((prev) => prev.filter((_, i) => i !== index));
  };

  /* 🗑 CLEAR EXCEPT HOME */
  const handleClearStops = () => {
    setTripStops((prev) => prev.filter((s) => s.label.startsWith("Home")));
    setRouteSummary(null);
  };

  /* 🏠 ZIP GEOCODE */
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

        const newHome: Stop = {
          label: `Home (${homeZip})`,
          address: homeZip,
          coords: [lng, lat],
          city,
          state,
          zip: homeZip,
        };

        setHomeCoords([lng, lat]);
        setTripStops((prev) => {
          const others = prev.filter((s) => !s.label.startsWith("Home"));
          return [newHome, ...others];
        });
      }
    } catch {}
  };

  /* ROUTE ORDER */
  const stopsForRoute = useMemo(() => {
    if (!homeCoords) return tripStops;
    const homeStop = tripStops.find((s) => s.label.startsWith("Home"));
    const nonHome = tripStops.filter((s) => !s.label.startsWith("Home"));
    return homeStop ? [homeStop, ...nonHome, homeStop] : tripStops;
  }, [tripStops, homeCoords]);

  /* CALLBACK FOR OPTIMIZER */
  const handleOptimizedRoute = (optimizedStops: Stop[]) => {
    if (optimizedStops.length < 2) return;
    const start = optimizedStops[0];
    const end = optimizedStops[optimizedStops.length - 1];
    const middle = optimizedStops.slice(1, -1);
    setTripStops([start, ...middle, end]);
  };

  /* RETAILER SUMMARY (non-destructive) */
  const filteredRetailersForSummary = useMemo(
    () =>
      selectedStates.length === 0
        ? availableRetailers
        : retailerSummary
            .filter((s) =>
              s.states.some((st) => selectedStates.includes(norm(st)))
            )
            .map((s) => s.retailer)
            .filter((r, i, arr) => arr.indexOf(r) === i)
            .sort(),
    [availableRetailers, retailerSummary, selectedStates]
  );

  const kingpinSummary = retailerSummary.filter(
    (s) => s.categories.includes("kingpin") || norm(s.retailer) === "kingpin"
  );
  const normalSummary = retailerSummary.filter(
    (s) =>
      !s.categories.includes("kingpin") && norm(s.retailer) !== "kingpin"
  );

  /* ===================== UI ===================== */
  return (
    <div className="flex h-screen w-screen relative overflow-hidden">
      {/* Mobile Hamburger */}
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
        {/* Logo + Theme Toggle */}
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

        {/* HOME ZIP */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-[16px] leading-tight">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">Home Zip Code</h2>
          <div className="flex space-x-2">
            <input
              type="text"
              value={homeZip}
              onChange={(e) => setHomeZip(e.target.value)}
              placeholder="Enter ZIP"
              className="flex-1 p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-[16px]"
            />
            <button
              onClick={handleGeocodeZip}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-[16px]"
            >
              Set
            </button>
          </div>
          {homeCoords && (
            <p className="mt-2 text-sm text-yellow-400">Home set at {homeZip} ✔</p>
          )}
        </div>

        {/* SEARCH TILE */}
        <SearchLocationsTile allStops={allStops} onAddStop={handleAddStop} />

        {/* STATES */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-[16px] leading-tight">
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
          <div className="grid grid-cols-3 gap-1 text-[16px]">
            {availableStates.map((state) => {
              const normalized = norm(state);
              return (
                <label key={state} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedStates.includes(normalized)}
                    onChange={() =>
                      setSelectedStates((prev) =>
                        prev.includes(normalized)
                          ? prev.filter((s) => s !== normalized)
                          : [...prev, normalized]
                      )
                    }
                  />
                  <span className="text-white">{capitalizeState(state)}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* RETAILERS */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-[16px] leading-tight">
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
          <div className="grid grid-cols-2 gap-x-4 max-h-48 overflow-y-auto text-[16px]">
            {availableRetailers.map((retailer) => {
              const normalized = norm(retailer);
              return (
                <label key={retailer} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedRetailers.includes(normalized)}
                    onChange={() =>
                      setSelectedRetailers((prev) =>
                        prev.includes(normalized)
                          ? prev.filter((r) => r !== normalized)
                          : [...prev, normalized]
                      )
                    }
                  />
                  <span className="text-white">{retailer}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* SUPPLIERS */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-[16px] leading-tight">
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
          <div className="grid grid-cols-2 gap-x-4 max-h-48 overflow-y-auto text-[16px]">
            {availableSuppliers.map((supplier) => (
              <label key={supplier} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedSuppliers.includes(supplier)}
                  onChange={() =>
                    setSelectedSuppliers((prev) =>
                      prev.includes(supplier)
                        ? prev.filter((s) => s !== supplier)
                        : [...prev, supplier]
                    )
                  }
                />
                <span className="text-white">{supplier}</span>
              </label>
            ))}
          </div>
        </div>

        {/* CATEGORIES — FINAL LOCKED VERSION (OPTION A) */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-[16px] leading-tight">
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
              className="px-2 py-1 bg-gray-400 text-white rounded text-sm"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[16px]">
            {["Agronomy", "Grain/Feed", "C-Store/Service/Energy", "Distribution"].map(
              (key) => (
                <label key={key} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(norm(key))}
                    onChange={() =>
                      setSelectedCategories((prev) =>
                        prev.includes(norm(key))
                          ? prev.filter((c) => c !== norm(key))
                          : [...prev, norm(key)]
                      )
                    }
                  />
                  <span className="flex items-center text-white">
                    <span
                      className="inline-block w-3 h-3 rounded-full mr-1"
                      style={{
                        backgroundColor: categoryColors[key].color,
                      }}
                    />
                    {key}
                  </span>
                </label>
              )
            )}
          </div>
        </div>

        {/* CHANNEL SUMMARY */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-[16px] leading-tight">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">Channel Summary</h2>
          <div className="text-[15px] max-h-48 overflow-y-auto text-white">
            {normalSummary.map((s, i) => (
              <div key={i} className="mb-4 p-2 rounded bg-gray-700/40">
                <strong className="text-yellow-300 text-[17px]">{s.retailer}</strong>
                <br />
                <span className="text-white text-[15px]">
                  State(s): {s.states.map(capitalizeState).join(", ") || "N/A"}
                </span>
                <br />
                <span className="text-white text-[15px]">
                  Total Locations: {s.count}
                </span>
                <br />
                <span className="text-white text-[15px]">
                  Suppliers: {s.suppliers.join(", ") || "N/A"}
                </span>
                <br />
                <span className="text-white text-[15px]">
                  Categories: {s.categories.join(", ") || "N/A"}
                </span>
              </div>
            ))}

            {kingpinSummary.length > 0 && (
              <div className="mt-4 p-2 rounded bg-gray-800/60">
                <strong className="text-yellow-400 text-[17px]">Kingpins:</strong>
                <br />
                <span className="text-yellow-200 text-[15px]">
                  {kingpinSummary.map((s) => s.retailer).join(", ")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* TRIP BUILDER */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow text-[16px] leading-tight mt-4">
          <h2 className="text-lg font-bold text-yellow-400 mb-3">Trip Optimization</h2>

          <div className="flex space-x-4 mb-3 text-[15px]">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                value="entered"
                checked={tripMode === "entered"}
                onChange={() => setTripMode("entered")}
              />
              <span className="text-white">Map as Entered</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                value="optimize"
                checked={tripMode === "optimize"}
                onChange={() => setTripMode("optimize")}
              />
              <span className="text-white">Optimize Route</span>
            </label>
          </div>

          {routeSummary && (
            <div className="text-[14px] text-gray-900 dark:text-gray-200 mb-3 p-2 bg-gray-200 dark:bg-gray-700 rounded">
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

          {tripStops.length > 0 ? (
            <div className="space-y-3">
              <ol className="ml-5 space-y-3 text-[15px]">
                {tripStops.map((stop, i) => (
                  <li
                    key={i}
                    className="flex justify-between items-start pb-2 border-b border-gray-300 dark:border-gray-600"
                  >
                    <div>
                      <div className="font-semibold text-yellow-300">
                        {stop.label}
                      </div>
                      <div className="text-[14px] text-white dark:text-gray-200">
                        {stop.address}
                        <br />
                        {stop.city}, {stop.state} {stop.zip}
                      </div>
                    </div>
                    {!stop.label.startsWith("Home") && (
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
            <p className="text-[15px] text-gray-500 dark:text-gray-300">
              No stops added yet.
            </p>
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
