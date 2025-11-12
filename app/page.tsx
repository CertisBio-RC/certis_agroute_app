// ================================================================
// 💠 CERTIS AGROUTE — WORKING GOLD BASELINE (RESTORED)
//   • Non-destructive filtering (Retailer list never collapses)
//   • Uses Mercator (satellite-streets-v12 controlled in CertisMap.tsx)
//   • Home ZIP → geocode → adds Home marker + first trip stop
//   • ✅ Only modification: homeCoords passed into <CertisMap />
// ================================================================

"use client";

import { useState, useMemo } from "react";
import CertisMap, { categoryColors, Stop } from "@/components/CertisMap";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Normalizer
const norm = (val: string) => (val || "").toString().trim().toLowerCase();

// Capitalize state abbreviations
const capitalizeState = (val: string) => (val || "").toUpperCase();

// External routing URLs
function buildGoogleMapsUrl(stops: Stop[]) {
  if (stops.length < 2) return null;
  const base = "https://www.google.com/maps/dir/?api=1";
  const origin = encodeURIComponent(stops[0].address);
  const destination = encodeURIComponent(stops[stops.length - 1].address);
  const waypoints = stops.slice(1, -1).map((s) => encodeURIComponent(s.address)).join("|");

  return `${base}&origin=${origin}&destination=${destination}${
    waypoints ? `&waypoints=${waypoints}` : ""
  }`;
}

function buildAppleMapsUrl(stops: Stop[]) {
  if (stops.length < 2) return null;
  const base = "http://maps.apple.com/?dirflg=d";
  const origin = encodeURIComponent(stops[0].address);
  const daddr = stops.slice(1).map((s) => encodeURIComponent(s.address)).join("+to:");
  return `${base}&saddr=${origin}&daddr=${daddr}`;
}

export default function Page() {
  // ========================================
  // 🎛️ UI / FILTER STATE
  // ========================================
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

  // ========================================
  // 🚗 Trip Builder / Home ZIP
  // ========================================
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [tripMode, setTripMode] = useState<"entered" | "optimize">("entered");

  const [homeZip, setHomeZip] = useState("");
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);

  // Add stop (no duplicates)
  const handleAddStop = (stop: Stop) => {
    if (!tripStops.some((s) => s.label === stop.label && s.address === stop.address)) {
      setTripStops((prev) => [...prev, stop]);
    }
  };

  const handleRemoveStop = (index: number) => {
    setTripStops((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearStops = () => setTripStops([]);

  // Geocode ZIP → Home coords
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

        // Ensure only one home marker exists
        setTripStops((prev) => [homeStop, ...prev.filter((s) => !s.label.startsWith("Home"))]);
      }
    } catch (err) {
      console.error("Home ZIP geocode error:", err);
    }
  };

  // ========================================
  // FILTER LOGIC (non-destructive)
  // ========================================
  const handleToggleCategory = (c: string) => {
    const normalized = norm(c);
    setSelectedCategories((prev) =>
      prev.includes(normalized) ? prev.filter((cat) => cat !== normalized) : [...prev, normalized]
    );
  };

  const handleToggleState = (state: string) => {
    const normalized = norm(state);
    setSelectedStates((prev) =>
      prev.includes(normalized) ? prev.filter((s) => s !== normalized) : [...prev, normalized]
    );
  };

  const handleToggleSupplier = (supplier: string) => {
    setSelectedSuppliers((prev) =>
      prev.includes(supplier) ? prev.filter((s) => s !== supplier) : [...prev, supplier]
    );
  };

  const handleToggleRetailer = (retailer: string) => {
    const normalized = norm(retailer);
    setSelectedRetailers((prev) =>
      prev.includes(normalized) ? prev.filter((r) => r !== normalized) : [...prev, normalized]
    );
  };

  // NON-DESTRUCTIVE retailer list based ONLY on selected states
  const filteredRetailersForSummary = useMemo(() => {
    if (selectedStates.length === 0) return availableRetailers;

    return retailerSummary
      .filter((s) => s.states.some((st) => selectedStates.includes(norm(st))))
      .map((s) => s.retailer)
      .filter((r, i, arr) => arr.indexOf(r) === i)
      .sort();
  }, [availableRetailers, retailerSummary, selectedStates]);

  const kingpinSummary = retailerSummary.filter(
    (s) => s.categories.includes("kingpin") || norm(s.retailer) === "kingpin"
  );

  const normalSummary = retailerSummary.filter(
    (s) => !s.categories.includes("kingpin") && norm(s.retailer) !== "kingpin"
  );

  // ========================================
  // UI LAYOUT
  // ========================================
  return (
    <div className="flex h-screen w-screen relative">
      {/* Mobile hamburger */}
      <button
        className="absolute top-3 left-3 z-20 p-2 bg-gray-800 text-white rounded-md md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed md:static top-0 left-0 h-full w-96 bg-gray-100 dark:bg-gray-900 p-4 border-r border-gray-300 dark:border-gray-700 overflow-y-auto z-10 transform transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* Logo */}
        <div className="flex items-center justify-center mb-6">
          <Image src={`${basePath}/certis-logo.png`} alt="Certis Logo" width={180} height={60} priority />
        </div>

        {/* Home ZIP */}
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
            <button onClick={handleGeocodeZip} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
              Set
            </button>
          </div>

          {homeCoords && (
            <p className="mt-2 text-sm text-green-600 dark:text-green-400">Home set at {homeZip} ✔</p>
          )}
        </div>

        {/* States */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">States</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button onClick={() => setSelectedStates(availableStates.map(norm))} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">
              Select All
            </button>
            <button onClick={() => setSelectedStates([])} className="px-2 py-1 bg-gray-400 text-white rounded text-xs">
              Clear
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1 text-sm">
            {availableStates.map((state) => {
              const normalized = norm(state);
              return (
                <label key={state} className="flex items-center space-x-1">
                  <input type="checkbox" checked={selectedStates.includes(normalized)} onChange={() => handleToggleState(state)} />
                  <span>{capitalizeState(state)}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Retailers */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">Retailers</h2>

          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() => setSelectedRetailers(filteredRetailersForSummary.map(norm))}
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
            >
              Select All
            </button>
            <button onClick={() => setSelectedRetailers([])} className="px-2 py-1 bg-gray-400 text-white rounded text-xs">
              Clear
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto text-sm">
            {availableRetailers.map((retailer) => {
              const normalized = norm(retailer);
              return (
                <label key={retailer} className="flex items-center space-x-1">
                  <input type="checkbox" checked={selectedRetailers.includes(normalized)} onChange={() => handleToggleRetailer(retailer)} />
                  <span>{retailer}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Suppliers */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">Suppliers</h2>

          <div className="flex flex-wrap gap-2 mb-2">
            <button onClick={() => setSelectedSuppliers(availableSuppliers)} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">
              Select All
            </button>
            <button onClick={() => setSelectedSuppliers([])} className="px-2 py-1 bg-gray-400 text-white rounded text-xs">
              Clear
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto text-sm">
            {availableSuppliers.map((supplier) => (
              <label key={supplier} className="flex items-center space-x-1">
                <input type="checkbox" checked={selectedSuppliers.includes(supplier)} onChange={() => handleToggleSupplier(supplier)} />
                <span>{supplier}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Categories (legend) */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">Categories</h2>

          <div className="flex flex-wrap gap-2 mb-2">
            <button onClick={() => setSelectedCategories(Object.keys(categoryColors).filter((c) => c !== "Kingpin").map(norm))} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">
              Select All
            </button>
            <button onClick={() => setSelectedCategories([])} className="px-2 py-1 bg-gray-400 text-white rounded text-xs">
              Clear
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1 text-sm">
            {Object.entries(categoryColors)
              .filter(([key]) => key !== "Kingpin")
              .map(([key, { color }]) => (
                <label key={key} className="flex items-center space-x-1">
                  <input type="checkbox" checked={selectedCategories.includes(norm(key))} onChange={() => handleToggleCategory(key)} />
                  <span className="flex items-center">
                    <span className="inline-block w-3 h-3 rounded-full mr-1" style={{ backgroundColor: color }} />
                    {key}
                  </span>
                </label>
              ))}
          </div>
        </div>

        {/* Channel Summary */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">Channel Summary</h2>

          <div className="text-sm max-h-40 overflow-y-auto">
            {normalSummary.map((s, i) => (
              <div key={i} className="mb-2">
                <strong>
                  {s.retailer} ({s.states.map(capitalizeState).join(", ")})
                </strong>{" "}
                ({s.count} sites)
                <br />
                Suppliers: {s.suppliers.join(", ") || "N/A"}
                <br />
                Categories: {s.categories.join(", ") || "N/A"}
              </div>
            ))}

            {kingpinSummary.length > 0 && (
              <div className="mt-2 text-red-600 dark:text-red-400">
                <strong>Kingpins:</strong> {kingpinSummary.map((s) => s.retailer).join(", ")}
              </div>
            )}
          </div>
        </div>

        {/* Trip Optimizer */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-3">Trip Optimization</h2>

          <div className="flex space-x-4 mb-3 text-sm">
            <label className="flex items-center space-x-1 cursor-pointer">
              <input type="radio" value="entered" checked={tripMode === "entered"} onChange={() => setTripMode("entered")} />
              <span>Map as Entered</span>
            </label>

            <label className="flex items-center space-x-1 cursor-pointer">
              <input type="radio" value="optimize" checked={tripMode === "optimize"} onChange={() => setTripMode("optimize")} />
              <span>Optimize Route</span>
            </label>
          </div>

          {tripStops.length > 0 ? (
            <div className="space-y-2">
              <ol className="list-decimal ml-5 text-sm">
                {tripStops.map((stop, i) => (
                  <li key={i} className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{stop.label}</div>
                      <div className="text-xs">{stop.address}</div>
                    </div>

                    {i > 0 && (
                      <button onClick={() => handleRemoveStop(i)} className="ml-2 text-red-600 hover:text-red-800 text-xs">
                        ❌
                      </button>
                    )}
                  </li>
                ))}
              </ol>

              <div className="flex gap-2 mt-2">
                <button onClick={handleClearStops} className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">
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
            <p className="text-sm text-gray-500 dark:text-gray-400">No stops added yet.</p>
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
          homeCoords={homeCoords}            // ✅ ONLY CHANGE REQUIRED
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
