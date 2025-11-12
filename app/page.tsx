// ================================================================
// 💠 CERTIS AGROUTE "GOLD FINAL" — NON-DESTRUCTIVE FILTER UI
//   • Retailer list now filters based on selected States (correct behavior)
//   • UI lists never destructively shrink when selecting a retailer
//   • Matches CertisMap.tsx non-destructive intersection logic
// ================================================================

"use client";

import { useState, useMemo } from "react";
import CertisMap, { categoryColors, Stop } from "@/components/CertisMap";
import Image from "next/image";
import { Menu, X } from "lucide-react";

// ================================================================
// ENV VARS
// ================================================================
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Normalizer
const norm = (val: string) => (val || "").toString().trim().toLowerCase();

// Capitalizer for abbreviations (IA, NE, SD…)
const capitalizeState = (val: string) => (val || "").toUpperCase();

// ================================================================
// Route builders (trip → Google/Apple Maps external links)
// ================================================================
function buildGoogleMapsUrl(stops: Stop[]) {
  if (stops.length < 2) return null;
  const base = "https://www.google.com/maps/dir/?api=1";
  const origin = encodeURIComponent(stops[0].address);
  const destination = encodeURIComponent(stops[stops.length - 1].address);
  const waypoints = stops
    .slice(1, -1)
    .map((s) => encodeURIComponent(s.address))
    .join("|");

  return `${base}&origin=${origin}&destination=${destination}${
    waypoints ? `&waypoints=${waypoints}` : ""
  }`;
}

function buildAppleMapsUrl(stops: Stop[]) {
  if (stops.length < 2) return null;
  const base = "http://maps.apple.com/?dirflg=d";
  const origin = encodeURIComponent(stops[0].address);
  const daddr = stops
    .slice(1)
    .map((s) => encodeURIComponent(s.address))
    .join("+to:");

  return `${base}&saddr=${origin}&daddr=${daddr}`;
}

// ================================================================
// PAGE COMPONENT
// ================================================================
export default function Page() {
  // available lists (fed from CertisMap.tsx, updated NON-DESTRUCTIVELY)
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableRetailers, setAvailableRetailers] = useState<string[]>([]);
  const [availableSuppliers, setAvailableSuppliers] = useState<string[]>([]);

  // filters (checked state of UI dropdowns)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);

  // Incoming retailer summary (count, states, suppliers)
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

  // Trip builder state
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [tripMode, setTripMode] = useState<"entered" | "optimize">("entered");

  // Home ZIP → map marker
  const [homeZip, setHomeZip] = useState("");
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);

  // ================================================================
  // 🏠 Home ZIP → geocode → set first trip stop
  // ================================================================
  const handleGeocodeZip = async () => {
    if (!homeZip || !mapboxToken) return;

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
        const withoutOldHome = prev.filter((s) => !s.label.startsWith("Home"));
        return [homeStop, ...withoutOldHome];
      });
    }
  };

  // ================================================================
  // ADD / REMOVE TRIP STOPS
  // ================================================================
  const handleAddStop = (stop: Stop) => {
    if (!tripStops.some((s) => s.label === stop.label && s.address === stop.address)) {
      setTripStops((prev) => [...prev, stop]);
    }
  };

  const handleRemoveStop = (i: number) =>
    setTripStops((prev) => prev.filter((_, idx) => idx !== i));

  const handleClearStops = () => setTripStops([]);

  // ================================================================
  // Category filter (legend)
  // ================================================================
  const handleToggleCategory = (c: string) => {
    const normalized = norm(c);
    setSelectedCategories((prev) =>
      prev.includes(normalized) ? prev.filter((v) => v !== normalized) : [...prev, normalized]
    );
  };

  const handleSelectAllCategories = () =>
    setSelectedCategories(Object.keys(categoryColors).filter((c) => c !== "Kingpin").map(norm));

  const handleClearAllCategories = () => setSelectedCategories([]);

  // ================================================================
  // STATE filter
  // ================================================================
  const handleToggleState = (state: string) => {
    const normalized = norm(state);
    setSelectedStates((prev) =>
      prev.includes(normalized) ? prev.filter((v) => v !== normalized) : [...prev, normalized]
    );
  };

  const handleSelectAllStates = () => setSelectedStates(availableStates.map(norm));
  const handleClearAllStates = () => setSelectedStates([]);

  // ================================================================
  // SUPPLIER filter
  // ================================================================
  const handleToggleSupplier = (supplier: string) =>
    setSelectedSuppliers((prev) =>
      prev.includes(supplier) ? prev.filter((s) => s !== supplier) : [...prev, supplier]
    );

  const handleSelectAllSuppliers = () => setSelectedSuppliers(availableSuppliers);
  const handleClearAllSuppliers = () => setSelectedSuppliers([]);

  // ================================================================
  // RETAILER filter (non-destructive)
  // ================================================================
  const handleToggleRetailer = (retailer: string) => {
    const normalized = norm(retailer);
    setSelectedRetailers((prev) =>
      prev.includes(normalized) ? prev.filter((v) => v !== normalized) : [...prev, normalized]
    );
  };
  const handleClearAllRetailers = () => setSelectedRetailers([]);

  // ================================================================
  // Retailers list must filter ONLY based on selectedStates
  // (NOT selectedRetailers — non-destructive!)
  // ================================================================
  const filteredRetailersForSummary = useMemo(() => {
    if (selectedStates.length === 0) return availableRetailers;

    return retailerSummary
      .filter((s) => s.states.some((st) => selectedStates.includes(norm(st))))
      .map((s) => s.retailer)
      .filter((r, i, arr) => arr.indexOf(r) === i)
      .sort();
  }, [availableRetailers, retailerSummary, selectedStates]);

  // ================================================================
  // UI SECTION
  // ================================================================
  return (
    <div className="flex h-screen w-screen relative">
      {/* 📱 Mobile hamburger */}
      <button
        className="absolute top-3 left-3 z-20 p-2 bg-gray-800 text-white rounded-md md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* SIDEBAR */}
      <aside
        className={`fixed md:static top-0 left-0 h-full w-96 bg-gray-100 dark:bg-gray-900 p-4 border-r border-gray-300 dark:border-gray-700 overflow-y-auto z-10 transform transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        {/* LOGO */}
        <div className="flex items-center justify-center mb-6">
          <Image src={`${basePath}/certis-logo.png`} alt="Certis Logo" width={180} height={60} priority />
        </div>

        {/* 💙 HOME ZIP */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">Home Zip Code</h2>
          <div className="flex space-x-2">
            <input
              type="text"
              value={homeZip}
              onChange={(e) => setHomeZip(e.target.value)}
              placeholder="Enter ZIP"
              className="flex-1 p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700"
            />
            <button onClick={handleGeocodeZip} className="px-3 py-1 bg-blue-600 text-white rounded">
              Set
            </button>
          </div>
        </div>

        {/* 🟦 STATES */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">States</h2>
          <div className="flex gap-2 mb-2">
            <button onClick={handleSelectAllStates} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">
              Select All
            </button>
            <button onClick={handleClearAllStates} className="px-2 py-1 bg-gray-500 text-white rounded text-xs">
              Clear
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 text-sm">
            {availableStates.map((st) => (
              <label key={st} className="flex items-center space-x-1">
                <input
                  type="checkbox"
                  checked={selectedStates.includes(norm(st))}
                  onChange={() => handleToggleState(st)}
                />
                <span>{capitalizeState(st)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 🟦 RETAILERS (non-destructive) */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">Retailers</h2>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setSelectedRetailers(filteredRetailersForSummary.map(norm))}
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
            >
              Select All
            </button>
            <button onClick={handleClearAllRetailers} className="px-2 py-1 bg-gray-500 text-white rounded text-xs">
              Clear
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto text-sm">
            {filteredRetailersForSummary.map((retailer) => (
              <label key={retailer} className="flex items-center space-x-1">
                <input
                  type="checkbox"
                  checked={selectedRetailers.includes(norm(retailer))}
                  onChange={() => handleToggleRetailer(retailer)}
                />
                <span>{retailer}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 🟦 SUPPLIERS */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">Suppliers</h2>
          <div className="flex gap-2 mb-2">
            <button onClick={handleSelectAllSuppliers} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">
              Select All
            </button>
            <button onClick={handleClearAllSuppliers} className="px-2 py-1 bg-gray-500 text-white rounded text-xs">
              Clear
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto text-sm">
            {availableSuppliers.map((supplier) => (
              <label key={supplier} className="flex items-center space-x-1">
                <input
                  type="checkbox"
                  checked={selectedSuppliers.includes(supplier)}
                  onChange={() => handleToggleSupplier(supplier)}
                />
                <span>{supplier}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 🟦 CATEGORIES */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">Categories</h2>

          <div className="flex gap-2 mb-2">
            <button onClick={handleSelectAllCategories} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">
              Select All
            </button>
            <button onClick={handleClearAllCategories} className="px-2 py-1 bg-gray-500 text-white rounded text-xs">
              Clear
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1 text-sm">
            {Object.entries(categoryColors)
              .filter(([key]) => key !== "Kingpin")
              .map(([key, { color }]) => (
                <label key={key} className="flex items-center space-x-1">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(norm(key))}
                    onChange={() => handleToggleCategory(key)}
                  />
                  <span className="flex items-center">
                    <span className="inline-block w-3 h-3 rounded-full mr-1" style={{ backgroundColor: color }} />
                    {key}
                  </span>
                </label>
              ))}
          </div>
        </div>

        {/* 🟦 CHANNEL SUMMARY */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">Channel Summary</h2>
          <div className="text-sm max-h-40 overflow-y-auto">
            {retailerSummary
              .filter((s) => !s.categories.includes("kingpin"))
              .map((s, i) => (
                <div key={i} className="mb-2">
                  <strong>{s.retailer}</strong> ({s.count} sites)
                  <br />
                  States: {s.states.map(capitalizeState).join(", ") || "N/A"}
                  <br />
                  Suppliers: {s.suppliers.join(", ") || "N/A"}
                </div>
              ))}
          </div>
        </div>

        {/* 🟦 TRIP BUILDER */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-3">Trip Optimization</h2>

          <div className="flex gap-4 mb-3 text-sm">
            <label className="flex items-center space-x-1 cursor-pointer">
              <input type="radio" checked={tripMode === "entered"} onChange={() => setTripMode("entered")} />
              <span>Map as Entered</span>
            </label>

            <label className="flex items-center space-x-1 cursor-pointer">
              <input type="radio" checked={tripMode === "optimize"} onChange={() => setTripMode("optimize")} />
              <span>Optimize Route</span>
            </label>
          </div>

          {tripStops.length === 0 ? (
            <p className="text-sm text-gray-500">No stops added yet.</p>
          ) : (
            <div className="space-y-2">
              <ol className="list-decimal ml-5 text-sm">
                {tripStops.map((stop, i) => (
                  <li key={i} className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{stop.label}</div>
                      <div className="text-xs">{stop.address}</div>
                    </div>

                    {i > 0 && (
                      <button onClick={() => handleRemoveStop(i)} className="ml-2 text-red-600 text-xs">
                        ❌
                      </button>
                    )}
                  </li>
                ))}
              </ol>

              <div className="flex gap-2">
                <button onClick={handleClearStops} className="px-2 py-1 bg-red-600 text-white rounded text-xs">
                  Clear All
                </button>

                {buildGoogleMapsUrl(tripStops) && (
                  <a href={buildGoogleMapsUrl(tripStops)!} target="_blank" className="px-2 py-1 bg-green-600 text-white rounded text-xs">
                    Google Maps
                  </a>
                )}

                {buildAppleMapsUrl(tripStops) && (
                  <a href={buildAppleMapsUrl(tripStops)!} target="_blank" className="px-2 py-1 bg-blue-600 text-white rounded text-xs">
                    Apple Maps
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ======================================================= */}
      {/* 🗺 MAP AREA */}
      {/* ======================================================= */}
      <main className="flex-1 relative">
        <CertisMap
          selectedCategories={selectedCategories}
          selectedStates={selectedStates}
          selectedSuppliers={selectedSuppliers}
          selectedRetailers={selectedRetailers}
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
