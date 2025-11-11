// ================================================================
// 💠 CERTIS AGROUTE – PHASE A.24.4 (GOLD TRUE BASELINE FILTERING)
//   • Blank map on initial load
//   • Selecting State(s) shows locations only in those states
//   • Retailer list dynamically filters to selected states
//   • Checking Retailer(s) filters intersection of State + Retailer
//   • Unchecking all → blank map
//   • Kingpins always visible
//   • Preserves Channel Summary + Trip Builder UI
// ================================================================

"use client";

import { useState, useMemo, useEffect } from "react";
import CertisMap, { Stop } from "@/components/CertisMap";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ---------------------------------------------------------------
// 🧩 Utility Helpers
// ---------------------------------------------------------------
const norm = (val: string) => (val || "").toString().trim().toLowerCase();
const capitalizeState = (val: string) => (val || "").toUpperCase();

// ---------------------------------------------------------------
// 🌍 Map URL Builders
// ---------------------------------------------------------------
function buildGoogleMapsUrl(stops: Stop[]) {
  if (stops.length < 2) return null;
  const base = "https://www.google.com/maps/dir/?api=1";
  const fmt = (s: Stop) =>
    encodeURIComponent([s.address || "", s.label || ""].filter(Boolean).join(", "));
  const origin = fmt(stops[0]);
  const destination = fmt(stops[stops.length - 1]);
  const waypoints = stops.slice(1, -1).map(fmt).join("|");
  return `${base}&origin=${origin}&destination=${destination}${
    waypoints ? `&waypoints=${waypoints}` : ""
  }`;
}

function buildAppleMapsUrl(stops: Stop[]) {
  if (stops.length < 2) return null;
  const base = "http://maps.apple.com/?dirflg=d";
  const fmt = (s: Stop) =>
    encodeURIComponent([s.address || "", s.label || ""].filter(Boolean).join(", "));
  const origin = fmt(stops[0]);
  const daddr = stops.slice(1).map(fmt).join("+to:");
  return `${base}&saddr=${origin}&daddr=${daddr}`;
}

// ---------------------------------------------------------------
// 🧭 Main Page Component
// ---------------------------------------------------------------
export default function Page() {
  // 🎛️ Filter + UI State
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableRetailers, setAvailableRetailers] = useState<string[]>([]);
  const [availableSuppliers, setAvailableSuppliers] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [retailerSummary, setRetailerSummary] = useState<
    { retailer: string; count: number; suppliers: string[]; states: string[] }[]
  >([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 🚗 Trip Management
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [tripMode, setTripMode] = useState<"entered" | "optimize">("entered");
  const [homeZip, setHomeZip] = useState("");
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);

  // ---------------------------------------------------------------
  // 🚗 Trip Handlers
  // ---------------------------------------------------------------
  const handleAddStop = (stop: Stop) => {
    if (!tripStops.some((s) => s.label === stop.label && s.address === stop.address)) {
      setTripStops((prev) => [...prev, stop]);
    }
  };
  const handleRemoveStop = (index: number) =>
    setTripStops((prev) => prev.filter((_, i) => i !== index));
  const handleClearStops = () => setTripStops([]);

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
        const [lng, lat] = data.features[0].center;
        setHomeCoords([lng, lat]);
        const homeStop: Stop = {
          label: `Home (${homeZip})`,
          address: homeZip,
          coords: [lng, lat],
        };
        setTripStops((prev) => {
          const withoutHome = prev.filter((s) => !s.label.startsWith("Home"));
          return [homeStop, ...withoutHome];
        });
      }
    } catch (err) {
      console.error("Error geocoding ZIP:", err);
    }
  };

  // ---------------------------------------------------------------
  // 🧭 Filtering Logic (Gold True Baseline)
  // ---------------------------------------------------------------
  // Step 1: Filter retailer list → only those in selected states
  const filteredRetailers = useMemo(() => {
    if (selectedStates.length === 0) return [];
    const filtered = retailerSummary
      .filter((r) => r.states.some((st) => selectedStates.includes(norm(st))))
      .map((r) => r.retailer);
    return Array.from(new Set(filtered)).sort();
  }, [selectedStates, retailerSummary]);

  // Step 2: Ensure selected retailers stay valid when states change
  useEffect(() => {
    setSelectedRetailers((prev) =>
      prev.filter((r) => filteredRetailers.some((fr) => norm(fr) === norm(r)))
    );
  }, [filteredRetailers]);

  // Step 3: If no states selected → map blank (no locations)
  const effectiveSelectedRetailers =
    selectedStates.length === 0
      ? []
      : selectedRetailers.length === 0
      ? [] // none checked → map blank
      : selectedRetailers;

  // ---------------------------------------------------------------
  // 🧭 Filter Handlers
  // ---------------------------------------------------------------
  const handleToggleState = (state: string) => {
    const s = norm(state);
    setSelectedStates((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };
  const handleSelectAllStates = () => setSelectedStates(availableStates.map(norm));
  const handleClearAllStates = () => setSelectedStates([]);

  const handleToggleRetailer = (retailer: string) => {
    const r = norm(retailer);
    setSelectedRetailers((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  };
  const handleSelectAllRetailers = () =>
    setSelectedRetailers(filteredRetailers.map(norm));
  const handleClearAllRetailers = () => setSelectedRetailers([]);

  // ---------------------------------------------------------------
  // 🧭 Render
  // ---------------------------------------------------------------
  return (
    <div className="flex h-screen w-screen relative">
      {/* 📱 Mobile Toggle */}
      <button
        className="absolute top-3 left-3 z-20 p-2 bg-gray-800 text-white rounded-md md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* 📌 Sidebar */}
      <aside
        className={`fixed md:static top-0 left-0 h-full w-[430px] bg-gray-100 dark:bg-gray-900 p-4 border-r border-gray-300 dark:border-gray-700 overflow-y-auto z-10 transform transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* Logo */}
        <div className="flex items-center justify-center mb-6">
          <Image
            src={`${basePath}/certis-logo.png`}
            alt="Certis Logo"
            width={180}
            height={60}
            priority
          />
        </div>

        {/* 🟦 Home ZIP */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Home ZIP Code
          </h2>
          <div className="flex space-x-2">
            <input
              type="text"
              value={homeZip}
              onChange={(e) => setHomeZip(e.target.value)}
              placeholder="Enter ZIP"
              className="flex-1 p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={handleGeocodeZip}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Set
            </button>
          </div>
          {homeCoords && (
            <p className="mt-2 text-sm text-green-600 dark:text-green-400">
              Home set at {homeZip} ✔
            </p>
          )}
        </div>

        {/* 🟦 States */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">States</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={handleSelectAllStates}
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
            >
              Select All
            </button>
            <button
              onClick={handleClearAllStates}
              className="px-2 py-1 bg-gray-400 text-white rounded text-xs"
            >
              Clear
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 text-sm">
            {availableStates.map((s) => {
              const n = norm(s);
              return (
                <label key={s} className="flex items-center space-x-1">
                  <input
                    type="checkbox"
                    checked={selectedStates.includes(n)}
                    onChange={() => handleToggleState(s)}
                  />
                  <span>{capitalizeState(s)}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 🟦 Retailers */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">Retailers</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={handleSelectAllRetailers}
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
            >
              Select All
            </button>
            <button
              onClick={handleClearAllRetailers}
              className="px-2 py-1 bg-gray-400 text-white rounded text-xs"
            >
              Clear
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto text-sm">
            {filteredRetailers.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-xs">
                Select a state to see retailers.
              </p>
            ) : (
              filteredRetailers.map((r) => {
                const n = norm(r);
                return (
                  <label key={r} className="flex items-center space-x-1">
                    <input
                      type="checkbox"
                      checked={selectedRetailers.includes(n)}
                      onChange={() => handleToggleRetailer(r)}
                    />
                    <span>{r}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* 🟦 Channel Summary */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Channel Summary
          </h2>
          {retailerSummary.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No data available.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    <th className="text-left py-2 px-3 border-b border-gray-300 dark:border-gray-600">
                      Retailer
                    </th>
                    <th className="text-left py-2 px-3 border-b border-gray-300 dark:border-gray-600">
                      State(s)
                    </th>
                    <th className="text-left py-2 px-3 border-b border-gray-300 dark:border-gray-600">
                      # Sites
                    </th>
                    <th className="text-left py-2 px-3 border-b border-gray-300 dark:border-gray-600">
                      Suppliers
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...retailerSummary]
                    .sort((a, b) => a.retailer.localeCompare(b.retailer))
                    .map((s, i) => (
                      <tr
                        key={s.retailer}
                        className={`${
                          i % 2 === 0
                            ? "bg-gray-50 dark:bg-gray-900/40"
                            : "bg-white/70 dark:bg-gray-800/40"
                        } hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors`}
                      >
                        <td className="py-2 px-3 font-semibold text-gray-900 dark:text-white">
                          {s.retailer}
                        </td>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                          {s.states.map(capitalizeState).join(", ") || "—"}
                        </td>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                          {s.count}
                        </td>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300 truncate">
                          {s.suppliers.length ? s.suppliers.join(", ") : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 🟦 Trip Optimization */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Trip Optimization
          </h2>
          <div className="flex space-x-4 mb-3 text-sm">
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="radio"
                value="entered"
                checked={tripMode === "entered"}
                onChange={() => setTripMode("entered")}
              />
              <span className="text-gray-700 dark:text-gray-300">Map as Entered</span>
            </label>
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="radio"
                value="optimize"
                checked={tripMode === "optimize"}
                onChange={() => setTripMode("optimize")}
              />
              <span className="text-gray-700 dark:text-gray-300">Optimize Route</span>
            </label>
          </div>

          {tripStops.length > 0 ? (
            <div className="space-y-2">
              <ol className="list-decimal ml-5 text-sm text-gray-700 dark:text-gray-300">
                {tripStops.map((stop, i) => (
                  <li key={i} className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{stop.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {stop.address}
                      </div>
                    </div>
                    {i > 0 && (
                      <button
                        onClick={() => handleRemoveStop(i)}
                        className="ml-2 text-red-600 hover:text-red-800 text-xs"
                      >
                        ❌
                      </button>
                    )}
                  </li>
                ))}
              </ol>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleClearStops}
                  className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                >
                  Clear All
                <button
                  onClick={handleClearStops}
                  className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                >
                  Clear All
                </button>
                {buildGoogleMapsUrl(tripStops) && (
                  <a
                    href={buildGoogleMapsUrl(tripStops) || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                  >
                    Open in Google Maps
                  </a>
                )}
                {buildAppleMapsUrl(tripStops) && (
                  <a
                    href={buildAppleMapsUrl(tripStops) || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                  >
                    Open in Apple Maps
                  </a>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No stops added yet.
            </p>
          )}
        </div>
      </aside>

      {/* 🗺️ Map Area */}
      <main className="flex-1 relative">
        <CertisMap
          selectedStates={selectedStates}
          selectedRetailers={effectiveSelectedRetailers}
          selectedCategories={selectedCategories}
          selectedSuppliers={selectedSuppliers}
          homeCoords={homeCoords ?? undefined}
          onStatesLoaded={setAvailableStates}
          onRetailersLoaded={setAvailableRetailers}
          onSuppliersLoaded={setAvailableSuppliers}
          onRetailerSummary={setRetailerSummary}
          onAddStop={handleAddStop}
          tripStops={tripStops}
          tripMode={tripMode}
        />
      </main>
    </div>
  );
}
