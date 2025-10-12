// app/page.tsx
"use client";

import { useState, useMemo } from "react";
import CertisMap, { categoryColors, Stop } from "@/components/CertisMap";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ✅ Helpers
const norm = (v: string) => (v || "").toString().trim().toLowerCase();
const capitalizeState = (v: string) => (v || "").toUpperCase();
const formatFullAddress = (s: Stop) =>
  [s.address, s.city, s.state, s.zip ? s.zip.toString() : ""]
    .filter(Boolean)
    .join(", ");
const encodeAddress = (a: string) =>
  encodeURIComponent((a || "").replace(/\s+/g, " ").trim());

const categoryLabels: Record<string, string> = {
  agronomy: "Agronomy",
  grain: "Grain",
  feed: "Feed",
  "grain/feed": "Grain/Feed",
  "office/service": "Office/Service",
  officeservice: "Office/Service",
  distribution: "Distribution",
  kingpin: "Kingpin",
};

// ✅ Build URLs (adds return to Home if set)
function buildGoogleMapsUrl(stops: Stop[], homeZip?: string) {
  if (stops.length < 2) return null;
  let route = [...stops];
  if (homeZip && !stops[stops.length - 1].label.startsWith("Home"))
    route = [...stops, stops[0]];
  const base = "https://www.google.com/maps/dir/?api=1";
  const origin = encodeAddress(formatFullAddress(route[0]));
  const dest = encodeAddress(formatFullAddress(route[route.length - 1]));
  const waypoints = route
    .slice(1, -1)
    .map((s) => encodeAddress(formatFullAddress(s)))
    .join("|");
  return `${base}&origin=${origin}&destination=${dest}${
    waypoints ? `&waypoints=${waypoints}` : ""
  }`;
}

function buildAppleMapsUrl(stops: Stop[], homeZip?: string) {
  if (stops.length < 2) return null;
  let route = [...stops];
  if (homeZip && !stops[stops.length - 1].label.startsWith("Home"))
    route = [...stops, stops[0]];
  const base = "http://maps.apple.com/?dirflg=d";
  const origin = encodeAddress(formatFullAddress(route[0]));
  const daddr = route
    .slice(1)
    .map((s) => encodeAddress(formatFullAddress(s)))
    .join("+to:");
  return `${base}&saddr=${origin}&daddr=${daddr}`;
}

export default function Page() {
  // =========================
  // 🎛 State Hooks
  // =========================
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

  // 🧭 Trip
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [tripMode, setTripMode] = useState<"entered" | "optimize">("entered");
  const [optimizedStops, setOptimizedStops] = useState<Stop[]>([]);
  const [homeZip, setHomeZip] = useState("");
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);

  // =========================
  // 🚗 Trip handlers
  // =========================
  const handleAddStop = (stop: Stop) => {
    setTripStops((prev) =>
      prev.some((s) => s.label === stop.label && s.address === stop.address)
        ? prev
        : [...prev, stop]
    );
  };
  const handleRemoveStop = (i: number) =>
    setTripStops((p) => p.filter((_, idx) => idx !== i));
  const handleClearStops = () => {
    setTripStops([]);
    setOptimizedStops([]);
  };

  const handleGeocodeZip = async () => {
    if (!homeZip || !mapboxToken) return;
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          homeZip
        )}.json?access_token=${mapboxToken}&limit=1`
      );
      const d = await res.json();
      if (d.features && d.features.length) {
        const [lng, lat] = d.features[0].center;
        setHomeCoords([lng, lat]);
        const home: Stop = {
          label: `Home (${homeZip})`,
          address: homeZip,
          coords: [lng, lat],
        };
        setTripStops((p) => [
          home,
          ...p.filter((s) => !s.label.startsWith("Home")),
        ]);
      }
    } catch (e) {
      console.error("ZIP geocode error:", e);
    }
  };

  const handleBuildRoute = () => {
    if (tripStops.length < 2) {
      alert("Add at least two stops first.");
      return;
    }
    setTripMode((m) => (m === "entered" ? "optimize" : "entered"));
    setTimeout(
      () => setTripMode((m) => (m === "entered" ? "entered" : "optimize")),
      300
    );
  };

  const exportStops = useMemo(() => {
    const s =
      tripMode === "optimize" && optimizedStops.length
        ? optimizedStops
        : tripStops;
    if (
      homeZip &&
      s.length > 1 &&
      !s[s.length - 1].label.startsWith("Home")
    )
      return [...s, s[0]];
    return s;
  }, [tripMode, optimizedStops, tripStops, homeZip]);

  // =========================
  // 🔘 Filter handlers
  // =========================
  const toggle = (prev: string[], val: string) =>
    prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val];

  const handleToggleCategory = (c: string) =>
    setSelectedCategories((p) => toggle(p, norm(c)));
  const handleSelectAllCategories = () =>
    setSelectedCategories(
      Object.keys(categoryColors).filter((c) => c !== "Kingpin").map(norm)
    );
  const handleClearAllCategories = () => setSelectedCategories([]);

  const handleToggleState = (s: string) => setSelectedStates((p) => toggle(p, norm(s)));
  const handleSelectAllStates = () => setSelectedStates(availableStates.map(norm));
  const handleClearAllStates = () => setSelectedStates([]);

  const handleToggleSupplier = (s: string) =>
    setSelectedSuppliers((p) => toggle(p, s));
  const handleSelectAllSuppliers = () => setSelectedSuppliers(availableSuppliers);
  const handleClearAllSuppliers = () => setSelectedSuppliers([]);

  const handleToggleRetailer = (r: string) =>
    setSelectedRetailers((p) => toggle(p, norm(r)));
  const handleSelectAllRetailers = () =>
    setSelectedRetailers(availableRetailers.map(norm));
  const handleClearAllRetailers = () => setSelectedRetailers([]);

  // =========================
  // 🧮 Derived summaries
  // =========================
  const kingpinSummary = retailerSummary.filter(
    (s) => s.categories.includes("kingpin") || norm(s.retailer) === "kingpin"
  );
  const normalSummary = retailerSummary.filter(
    (s) => !s.categories.includes("kingpin") && norm(s.retailer) !== "kingpin"
  );

  // ✅ NEW: dynamically filtered retailer list for sidebar
  const filteredRetailers = useMemo(() => {
    if (!selectedStates.length) return availableRetailers;
    return retailerSummary
      .filter((s) =>
        s.states.some((st) => selectedStates.includes(norm(st)))
      )
      .map((s) => s.retailer)
      .filter((r, i, arr) => arr.indexOf(r) === i)
      .sort();
  }, [availableRetailers, retailerSummary, selectedStates]);

  // =========================
  // 🖼 Render UI
  // =========================
  return (
    <div className="flex h-screen w-screen relative">
      {/* 📱 Hamburger */}
      <button
        className="absolute top-3 left-3 z-20 p-2 bg-gray-800 text-white rounded-md md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* 📋 Sidebar */}
      <aside
        className={`fixed md:static top-0 left-0 h-full w-96 bg-gray-100 dark:bg-gray-900 p-4 border-r border-gray-300 dark:border-gray-700 overflow-y-auto z-10 transform transition-transform duration-300 ${
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

        {/* 🟦 Tile 1: Home ZIP */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Home Zip Code
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

        {/* 🟦 Tile 2: States */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            States
          </h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button onClick={handleSelectAllStates} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">
              Select All
            </button>
            <button onClick={handleClearAllStates} className="px-2 py-1 bg-gray-400 text-white rounded text-xs">
              Clear
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 text-sm">
            {availableStates.map((s) => (
              <label key={s} className="flex items-center space-x-1">
                <input
                  type="checkbox"
                  checked={selectedStates.includes(norm(s))}
                  onChange={() => handleToggleState(s)}
                />
                <span>{capitalizeState(s)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 🟦 Tile 3: Retailers */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Retailers
          </h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() => setSelectedRetailers(filteredRetailers.map(norm))}
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
            >
              Select All
            </button>
            <button onClick={handleClearAllRetailers} className="px-2 py-1 bg-gray-400 text-white rounded text-xs">
              Clear
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto text-sm">
            {filteredRetailers.map((r) => (
              <label key={r} className="flex items-center space-x-1">
                <input
                  type="checkbox"
                  checked={selectedRetailers.includes(norm(r))}
                  onChange={() => handleToggleRetailer(r)}
                />
                <span>{r}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 🟦 Tile 4: Suppliers */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Suppliers
          </h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button onClick={handleSelectAllSuppliers} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">
              Select All
            </button>
            <button onClick={handleClearAllSuppliers} className="px-2 py-1 bg-gray-400 text-white rounded text-xs">
              Clear
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto text-sm">
            {availableSuppliers.map((s) => (
              <label key={s} className="flex items-center space-x-1">
                <input
                  type="checkbox"
                  checked={selectedSuppliers.includes(s)}
                  onChange={() => handleToggleSupplier(s)}
                />
                <span>{s}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 🟦 Tile 5: Categories */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Categories
          </h2>
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
                {s.categories
                  .map((c) => categoryLabels[norm(c)] || c)
                  .join(", ") || "N/A"}
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
              <span className="text-gray-700 dark:text-gray-300">
                Map as Entered
              </span>
            </label>
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="radio"
                value="optimize"
                checked={tripMode === "optimize"}
                onChange={() => setTripMode("optimize")}
              />
              <span className="text-gray-700 dark:text-gray-300">
                Optimize Route
              </span>
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
                        {formatFullAddress(stop)}
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
                  onClick={handleBuildRoute}
                  className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                >
                  Build Route
                </button>

                {exportStops.length > 1 && (
                  <>
                    <a
                      href={buildGoogleMapsUrl(exportStops, homeZip) || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 text-center"
                    >
                      Open in Google Maps
                    </a>
                    <a
                      href={buildAppleMapsUrl(exportStops, homeZip) || "#"}
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
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No stops added yet.
            </p>
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
          tripStops={tripStops}
          tripMode={tripMode}
          onOptimizedRoute={setOptimizedStops}
        />
      </main>
    </div>
  );
}

// === END OF FILE ===
