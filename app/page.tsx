// app/page.tsx
"use client";

import { useState, useMemo } from "react";
import CertisMap, { categoryColors, Stop } from "@/components/CertisMap";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ✅ Normalizer
const norm = (val: string) => (val || "").toString().trim().toLowerCase();

// ✅ Capitalizer for state abbreviations
const capitalizeState = (val: string) => (val || "").toUpperCase();

// ✅ Category label cleanup
const categoryLabels: Record<string, string> = {
  agronomy: "Agronomy",
  grain: "Grain",
  feed: "Feed",
  "grain/feed": "Grain/Feed",
  "office/service": "Office/Service",
  officeservice: "Office/Service", // ✅ safeguard
  distribution: "Distribution",
  kingpin: "Kingpin",
};

// ✅ Clean addresses for export URLs
const cleanAddress = (addr: string) =>
  encodeURIComponent((addr || "").replace(/\s+/g, " ").trim());

// ✅ Build external map URLs
function buildGoogleMapsUrl(stops: Stop[]) {
  if (stops.length < 2) return null;
  const base = "https://www.google.com/maps/dir/?api=1";
  const origin = cleanAddress(stops[0].address);
  const destination = cleanAddress(stops[stops.length - 1].address);
  const waypoints = stops
    .slice(1, -1)
    .map((s) => cleanAddress(s.address))
    .join("|");
  return `${base}&origin=${origin}&destination=${destination}${
    waypoints ? `&waypoints=${waypoints}` : ""
  }`;
}

function buildAppleMapsUrl(stops: Stop[]) {
  if (stops.length < 2) return null;
  const base = "http://maps.apple.com/?dirflg=d";
  const origin = cleanAddress(stops[0].address);
  const daddr = stops
    .slice(1)
    .map((s) => cleanAddress(s.address))
    .join("+to:");
  return `${base}&saddr=${origin}&daddr=${daddr}`;
}

export default function Page() {
  // ========================================
  // 🎛️ State Hooks
  // ========================================
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableRetailers, setAvailableRetailers] = useState<string[]>([]);
  const [availableSuppliers, setAvailableSuppliers] = useState<string[]>([]);

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);

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

  // ✅ Trip Optimization
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [tripMode, setTripMode] = useState<"entered" | "optimize">("entered");
  const [optimizedStops, setOptimizedStops] = useState<Stop[]>([]);

  // ✅ Home Zip
  const [homeZip, setHomeZip] = useState("");
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);

  const handleAddStop = (stop: Stop) => {
    if (!tripStops.some((s) => s.label === stop.label && s.address === stop.address)) {
      setTripStops((prev) => [...prev, stop]);
    }
  };

  const handleRemoveStop = (index: number) => {
    setTripStops((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearStops = () => {
    setTripStops([]);
    setOptimizedStops([]);
  };

  // ✅ Geocode ZIP → coords
  const handleGeocodeZip = async () => {
    if (!homeZip || !mapboxToken) return;
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          homeZip
        )}.json?access_token=${mapboxToken}&limit=1`
      );
      const data = await res.json();
      if (data.features && data.features.length > 0) {
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

  // ✅ Choose correct export list
  const exportStops =
    tripMode === "optimize" && optimizedStops.length > 0
      ? optimizedStops
      : tripStops;

  // ========================================
  // 🔘 Category Handlers
  // ========================================
  const handleToggleCategory = (category: string) => {
    const normalized = norm(category);
    setSelectedCategories((prev) =>
      prev.includes(normalized) ? prev.filter((c) => c !== normalized) : [...prev, normalized]
    );
  };

  const handleSelectAllCategories = () => {
    setSelectedCategories(Object.keys(categoryColors).filter((c) => c !== "Kingpin").map(norm));
  };

  const handleClearAllCategories = () => setSelectedCategories([]);

  // ========================================
  // 🔘 State Handlers
  // ========================================
  const handleToggleState = (state: string) => {
    const normalized = norm(state);
    setSelectedStates((prev) =>
      prev.includes(normalized) ? prev.filter((s) => s !== normalized) : [...prev, normalized]
    );
  };

  const handleSelectAllStates = () => setSelectedStates(availableStates.map(norm));
  const handleClearAllStates = () => setSelectedStates([]);

  // ========================================
  // 🔘 Supplier Handlers
  // ========================================
  const handleToggleSupplier = (supplier: string) => {
    setSelectedSuppliers((prev) =>
      prev.includes(supplier) ? prev.filter((s) => s !== supplier) : [...prev, supplier]
    );
  };
  const handleSelectAllSuppliers = () => setSelectedSuppliers(availableSuppliers);
  const handleClearAllSuppliers = () => setSelectedSuppliers([]);

  // ========================================
  // 🔘 Retailer Handlers
  // ========================================
  const handleToggleRetailer = (retailer: string) => {
    const normalized = norm(retailer);
    setSelectedRetailers((prev) =>
      prev.includes(normalized) ? prev.filter((r) => r !== normalized) : [...prev, normalized]
    );
  };
  const handleSelectAllRetailers = () => setSelectedRetailers(availableRetailers.map(norm));
  const handleClearAllRetailers = () => setSelectedRetailers([]);

  // ========================================
  // 🟦 Derived summaries
  // ========================================
  const kingpinSummary = retailerSummary.filter(
    (s) => s.categories.includes("kingpin") || norm(s.retailer) === "kingpin"
  );

  const normalSummary = retailerSummary.filter(
    (s) => !s.categories.includes("kingpin") && norm(s.retailer) !== "kingpin"
  );

  const filteredRetailersForSummary = useMemo(() => {
    if (selectedStates.length === 0) return availableRetailers;
    return retailerSummary
      .filter((s) => s.states.some((st) => selectedStates.includes(norm(st))))
      .map((s) => s.retailer)
      .filter((r, i, arr) => arr.indexOf(r) === i)
      .sort();
  }, [availableRetailers, retailerSummary, selectedStates]);

  // === PART 1 END ===
  // === PART 2 START ===

  return (
    <div className="flex h-screen w-screen relative">
      {/* 📱 Mobile Hamburger Button */}
      <button
        className="absolute top-3 left-3 z-20 p-2 bg-gray-800 text-white rounded-md md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* 📌 Sidebar */}
      <aside
        className={`fixed md:static top-0 left-0 h-full w-96 bg-gray-100 dark:bg-gray-900 p-4 border-r border-gray-300 dark:border-gray-700 overflow-y-auto z-10 transform transition-transform duration-300
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
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

        {/* 🟦 Tile 1: Home Zip Code */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">Home Zip Code</h2>
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

        {/* 🟦 Tile 2: State Filter */}
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
            {availableStates.map((state) => {
              const normalized = norm(state);
              return (
                <label key={state} className="flex items-center space-x-1">
                  <input
                    type="checkbox"
                    checked={selectedStates.includes(normalized)}
                    onChange={() => handleToggleState(state)}
                  />
                  <span>{capitalizeState(state)}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 🟦 Tile 3: Retailer Filter */}
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
            {availableRetailers.map((retailer) => {
              const normalized = norm(retailer);
              return (
                <label key={retailer} className="flex items-center space-x-1">
                  <input
                    type="checkbox"
                    checked={selectedRetailers.includes(normalized)}
                    onChange={() => handleToggleRetailer(retailer)}
                  />
                  <span>{retailer}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 🟦 Tile 4: Supplier Filter */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">Suppliers</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={handleSelectAllSuppliers}
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
            >
              Select All
            </button>
            <button
              onClick={handleClearAllSuppliers}
              className="px-2 py-1 bg-gray-400 text-white rounded text-xs"
            >
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

        {/* 🟦 Tile 5: Categories (Legend) */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">Categories</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={handleSelectAllCategories}
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
            >
              Select All
            </button>
            <button
              onClick={handleClearAllCategories}
              className="px-2 py-1 bg-gray-400 text-white rounded text-xs"
            >
              Clear
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1 text-sm">
            {Object.entries(categoryColors)
              .filter(([key]) => key !== "Kingpin")
              .map(([key, { color }]) => {
                const label = categoryLabels[norm(key)] || key;
                return (
                  <label key={key} className="flex items-center space-x-1">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(norm(key))}
                      onChange={() => handleToggleCategory(key)}
                    />
                    <span className="flex items-center">
                      <span
                        className="inline-block w-3 h-3 rounded-full mr-1"
                        style={{ backgroundColor: color }}
                      ></span>
                      {label}
                    </span>
                  </label>
                );
              })}
          </div>
        </div>

        {/* 🟦 Tile 6: Channel Summary */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Channel Summary
          </h2>
          <div className="text-sm text-gray-700 dark:text-gray-300 max-h-40 overflow-y-auto">
            {normalSummary.map((s, i) => (
              <div key={i} className="mb-2">
                <strong>
                  {s.retailer} ({s.states.map(capitalizeState).join(", ")})
                </strong>{" "}
                ({s.count} sites) <br />
                Suppliers: {s.suppliers.join(", ") || "N/A"} <br />
                Categories:{" "}
                {s.categories.map((c) => categoryLabels[norm(c)] || c).join(", ") ||
                  "N/A"}
              </div>
            ))}
            {kingpinSummary.length > 0 && (
              <div className="mt-2 text-red-600 dark:text-red-400">
                <strong>Kingpins:</strong>{" "}
                {kingpinSummary.map((s) => s.retailer).join(", ")}
              </div>
            )}
          </div>
        </div>

        {/* 🟦 Tile 7: Trip Optimization */}
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
              <div className="flex flex-col gap-2 mt-3">
                <button
                  onClick={() => {}}
                  className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                >
                  Build Route
                </button>
                {exportStops.length > 1 && (
                  <>
                    <a
                      href={buildGoogleMapsUrl(exportStops) || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 text-center"
                    >
                      Open in Google Maps
                    </a>
                    <a
                      href={buildAppleMapsUrl(exportStops) || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 text-center"
                    >
                      Open in Apple Maps
                    </a>
                    <button
                      onClick={handleClearStops}
                      className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                    >
                      Clear All
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No stops added yet.</p>
          )}
        </div>
      </aside>

      {/* 🗺️ Map Area */}
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
          onRemoveStop={handleRemoveStop}
          tripStops={tripStops}
          tripMode={tripMode}
          onOptimizedRoute={setOptimizedStops}
        />
      </main>
    </div>
  );
}

// === PART 2 END ===
