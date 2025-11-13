"use client";

import { useState, useMemo } from "react";
import CertisMap, { categoryColors, Stop } from "@/components/CertisMap";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ----------------------------------------------
// 🧭 UTILITIES
// ----------------------------------------------
const norm = (val: string) => (val || "").toString().trim().toLowerCase();
const capitalizeState = (val: string) => (val || "").toUpperCase();

// ----------------------------------------------
// 🌍 EXPORT TO GOOGLE / APPLE MAPS
// ----------------------------------------------
function buildGoogleMapsUrl(stops: Stop[]) {
  if (stops.length < 2) return null;
  const base = "https://www.google.com/maps/dir/?api=1";
  const origin = encodeURIComponent(stops[0].address);
  const destination = encodeURIComponent(stops[stops.length - 1].address);
  const MAX_WAYPOINTS = 8;
  const subset = stops.slice(1, -1).slice(0, MAX_WAYPOINTS).map((s) => encodeURIComponent(s.address));
  return `${base}&origin=${origin}&destination=${destination}${
    subset.length > 0 ? `&waypoints=${subset.join("|")}` : ""
  }`;
}

function buildAppleMapsUrl(stops: Stop[]) {
  if (stops.length < 2) return null;
  const base = "http://maps.apple.com/?dirflg=d";
  const origin = encodeURIComponent(stops[0].address);
  const daddr = stops.slice(1).map((s) => encodeURIComponent(s.address)).join("+to:");
  return `${base}&saddr=${origin}&daddr=${daddr}`;
}

// =========================================================
// 🌟 MAIN PAGE COMPONENT
// =========================================================
export default function Page() {
  // --------------------------------------
  // 🎛 FILTER STATE
  // --------------------------------------
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

  // --------------------------------------
  // 🚗 TRIP BUILDER
  // --------------------------------------
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [tripMode, setTripMode] = useState<"entered" | "optimize">("entered");

  const [homeZip, setHomeZip] = useState("");
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);

  const [routeSummary, setRouteSummary] = useState<{ distance_m: number; duration_s: number } | null>(
    null
  );

  // ---------------------- Add / Remove Stops ----------------------
  const handleAddStop = (stop: Stop) => {
    setTripStops((prev) => {
      // prevent duplicates
      if (prev.some((s) => s.label === stop.label && s.address === stop.address)) return prev;
      // keep Home at index 0 if exists
      const nonHome = prev.filter((s) => !s.label.startsWith("Home"));
      const home = prev.find((s) => s.label.startsWith("Home"));
      return home ? [home, ...nonHome, stop] : [...prev, stop];
    });
  };

  const handleRemoveStop = (index: number) => {
    setTripStops((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearStops = () => {
    setTripStops((prev) => prev.filter((s) => s.label.startsWith("Home")));
    setRouteSummary(null);
  };

  // ---------------------- Home ZIP → coordinates (Mapbox geocode) ----------------------
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
        const newHome: Stop = {
          label: `Home (${homeZip})`,
          address: homeZip,
          coords: [lng, lat],
        };
        setHomeCoords([lng, lat]);
        setTripStops((prev) => {
          const others = prev.filter((s) => !s.label.startsWith("Home"));
          return [newHome, ...others];
        });
      }
    } catch (err) {
      console.error("Home ZIP geocode error:", err);
    }
  };

  // =========================================================
  // ✅ ALWAYS ENFORCE HOME → STOPS → HOME
  // =========================================================
  const stopsForRoute = useMemo(() => {
    if (!homeCoords) return tripStops;
    const homeStop: Stop = { label: `Home (${homeZip})`, address: homeZip, coords: homeCoords };
    const nonHomeStops = tripStops.filter((s) => !s.label.startsWith("Home"));
    // guarantee both endpoints are Home
    return [homeStop, ...nonHomeStops, homeStop];
  }, [tripStops, homeCoords, homeZip]);

  // =========================================================
  // 🧭 HANDLE OPTIMIZED ROUTE RETURN
  // =========================================================
  const handleOptimizedRoute = (optimizedStops: Stop[]) => {
    // replace middle section with optimized result while keeping Home endpoints
    if (optimizedStops.length < 2) return;
    const start = optimizedStops[0];
    const end = optimizedStops[optimizedStops.length - 1];
    const middle = optimizedStops.slice(1, -1);
    setTripStops([start, ...middle, end]);
  };

  // =========================================================
  // NON-DESTRUCTIVE RETAILER SUMMARY
  // =========================================================
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

  // =========================================================
  // 🖥️ UI
  // =========================================================
  return (
    <div className="flex h-screen w-screen relative">
      {/* Hamburger (Mobile) */}
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

        {/* ====================== HOME ZIP ====================== */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">Home Zip Code</h2>
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
          {homeCoords && <p className="mt-2 text-sm text-green-600">Home set at {homeZip} ✔</p>}
        </div>

        {/* ====================== FILTER PANELS ====================== */}
        {/* STATES */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">States</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button onClick={() => setSelectedStates(availableStates.map(norm))} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Select All</button>
            <button onClick={() => setSelectedStates([])} className="px-2 py-1 bg-gray-400 text-white rounded text-xs">Clear</button>
          </div>
          <div className="grid grid-cols-3 gap-1 text-sm">
            {availableStates.map((state) => {
              const normalized = norm(state);
              return (
                <label key={state} className="flex items-center space-x-1">
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
                  <span>{capitalizeState(state)}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* RETAILERS */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">Retailers</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button onClick={() => setSelectedRetailers(filteredRetailersForSummary.map(norm))} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Select All</button>
            <button onClick={() => setSelectedRetailers([])} className="px-2 py-1 bg-gray-400 text-white rounded text-xs">Clear</button>
          </div>
          <div className="max-h-40 overflow-y-auto text-sm">
            {availableRetailers.map((retailer) => {
              const normalized = norm(retailer);
              return (
                <label key={retailer} className="flex items-center space-x-1">
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
                  <span>{retailer}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* SUPPLIERS */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">Suppliers</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button onClick={() => setSelectedSuppliers(availableSuppliers)} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Select All</button>
            <button onClick={() => setSelectedSuppliers([])} className="px-2 py-1 bg-gray-400 text-white rounded text-xs">Clear</button>
          </div>
          <div className="max-h-40 overflow-y-auto text-sm">
            {availableSuppliers.map((supplier) => (
              <label key={supplier} className="flex items-center space-x-1">
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
                <span>{supplier}</span>
              </label>
            ))}
          </div>
        </div>

        {/* CATEGORIES */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3">Categories</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() =>
                setSelectedCategories(Object.keys(categoryColors).filter((c) => c !== "Kingpin").map(norm))
              }
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
            >
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
                  <span className="flex items-center">
                    <span className="inline-block w-3 h-3 rounded-full mr-1" style={{ backgroundColor: color }} />
                    {key}
                  </span>
                </label>
              ))}
          </div>
        </div>

        {/* CHANNEL SUMMARY */}
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

        {/* TRIP BUILDER */}
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

          {routeSummary && (
            <div className="text-xs text-gray-700 dark:text-gray-300 mb-2 p-2 bg-gray-200 dark:bg-gray-700 rounded">
              <strong>
                {(routeSummary.distance_m / 1609.34).toFixed(1)} miles • {(routeSummary.duration_s / 60).toFixed(0)} minutes
              </strong>
              <br />
              {tripMode === "optimize" ? "Optimized for shortest driving time" : "Mapped in entered order"}
            </div>
          )}

          {tripStops.length > 0 ? (
            <div className="space-y-2">
              <ol className="list-decimal ml-5 text-sm">
                {tripStops.map((stop, i) => (
                  <li key={i} className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{stop.label}</div>
                      <div className="text-xs">{stop.address}</div>
                    </div>
                    {!stop.label.startsWith("Home") && (
                      <button onClick={() => handleRemoveStop(i)} className="ml-2 text-red-600 hover:text-red-800 text-xs">
                      </button>
                    )}
                  </li>
                ))}
              </ol>

              {/* Action buttons */}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleClearStops}
                  className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                >
                  Clear All
                </button>

                {/* ✅ Export using forced [Home, stops, Home] */}
                {buildGoogleMapsUrl(stopsForRoute) && (
                  <a
                    href={buildGoogleMapsUrl(stopsForRoute) || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                  >
                    Open in Google Maps
                  </a>
                )}

                {buildAppleMapsUrl(stopsForRoute) && (
                  <a
                    href={buildAppleMapsUrl(stopsForRoute) || "#"}
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

      {/* =============================== */}
      {/* MAP */}
      {/* =============================== */}
      <main className="flex-1 relative">
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
          tripStops={stopsForRoute}  // ✅ Force Home → Stops → Home
          tripMode={tripMode}
          onRouteSummary={setRouteSummary}
          onOptimizedRoute={handleOptimizedRoute}
        />
      </main>
    </div>
  );
}
