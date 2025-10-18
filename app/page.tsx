// app/page.tsx  — Part 1 of 2
"use client";

import { useState, useMemo } from "react";
import CertisMap, { categoryColors, Stop } from "@/components/CertisMap";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ✅ Utility helpers
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
  "agronomy/grain": "Agronomy/Grain",
  grain: "Grain",
  feed: "Feed",
  "grain/feed": "Grain/Feed",
  "office/service": "Office/Service",
  officeservice: "Office/Service",
  distribution: "Distribution",
  kingpin: "Kingpin",
};

// ✅ Build external map URLs
function buildGoogleMapsUrl(stops: Stop[], homeZip?: string) {
  if (stops.length < 2) return null;
  const base = "https://www.google.com/maps/dir/?api=1";
  const origin = encodeAddress(formatFullAddress(stops[0]));
  const dest = encodeAddress(formatFullAddress(stops[stops.length - 1]));
  const waypoints = stops
    .slice(1, -1)
    .map((s) => encodeAddress(formatFullAddress(s)))
    .join("|");
  return `${base}&origin=${origin}&destination=${dest}${
    waypoints ? `&waypoints=${waypoints}` : ""
  }`;
}
function buildAppleMapsUrl(stops: Stop[], homeZip?: string) {
  if (stops.length < 2) return null;
  const base = "http://maps.apple.com/?dirflg=d";
  const origin = encodeAddress(formatFullAddress(stops[0]));
  const daddr = stops
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

  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);

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

  // 🧭 Trip builder
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [tripMode, setTripMode] = useState<"entered" | "optimize">("entered");
  const [optimizedStops, setOptimizedStops] = useState<Stop[]>([]);
  const [homeZip, setHomeZip] = useState("");
  const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);

  // =========================
  // 🚗 Trip handlers
  // =========================
  const handleAddStop = (stop: Stop) =>
    setTripStops((p) =>
      p.some((s) => s.label === stop.label && s.address === stop.address)
        ? p
        : [...p, stop]
    );
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
      if (d.features?.length) {
        const [lng, lat] = d.features[0].center;
        setHomeCoords([lng, lat]);
        const home: Stop = {
          label: `Home (${homeZip})`,
          address: homeZip,
          coords: [lng, lat],
        };
        setTripStops((p) => [home, ...p.filter((s) => !s.label.startsWith("Home"))]);
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

  // =========================
  // 🔘 Filter handlers
  // =========================
  const toggle = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

  const handleToggleState = (s: string) => setSelectedStates((p) => toggle(p, norm(s)));
  const handleSelectAllStates = () => setSelectedStates(availableStates.map(norm));
  const handleClearAllStates = () => setSelectedStates([]);

  const handleToggleRetailer = (r: string) => {
    const key = norm(r);
    setSelectedRetailers((prev) => {
      const updated = prev.includes(key)
        ? prev.filter((x) => x !== key)
        : [...prev, key];

      // ✅ When retailer(s) selected, default categories → Agronomy + Agronomy/Grain
      if (updated.length > 0 && selectedCategories.length === 0) {
        setSelectedCategories(["agronomy", "agronomy/grain"]);
      }
      return updated;
    });
  };
  const handleSelectAllRetailers = () => setSelectedRetailers(availableRetailers.map(norm));
  const handleClearAllRetailers = () => setSelectedRetailers([]);

  const handleToggleCategory = (c: string) =>
    setSelectedCategories((p) => toggle(p, norm(c)));
  const handleSelectAllCategories = () =>
    setSelectedCategories(
      Object.keys(categoryColors).filter((c) => c !== "Kingpin").map(norm)
    );
  const handleClearAllCategories = () => setSelectedCategories([]);

  const handleToggleSupplier = (s: string) =>
    setSelectedSuppliers((p) => toggle(p, s));
  const handleSelectAllSuppliers = () => setSelectedSuppliers(availableSuppliers);
  const handleClearAllSuppliers = () => setSelectedSuppliers([]);

  // =========================
  // 🧮 Derived data
  // =========================
  const filteredRetailers = useMemo(() => {
    if (!selectedStates.length) return availableRetailers;
    return retailerSummary
      .filter((s) => s.states.some((st) => selectedStates.includes(norm(st))))
      .map((s) => s.retailer)
      .filter((r, i, arr) => arr.indexOf(r) === i)
      .sort();
  }, [availableRetailers, retailerSummary, selectedStates]);
// app/page.tsx  — Part 2 of 2

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

        {/* 🟦 ZIP */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-base">
          <h2 className="text-xl font-bold mb-3 text-gray-800 dark:text-gray-200">
            ① Home Zip Code
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
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-base">
          <h2 className="text-xl font-bold mb-3 text-gray-800 dark:text-gray-200">
            ② Select State(s)
          </h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={handleSelectAllStates}
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm"
            >
              Select All
            </button>
            <button
              onClick={handleClearAllStates}
              className="px-2 py-1 bg-gray-400 text-white rounded text-sm"
            >
              Clear
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 text-base">
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

        {/* 🟦 Retailers */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-base">
          <h2 className="text-xl font-bold mb-3 text-gray-800 dark:text-gray-200">
            ③ Select Retailer(s)
          </h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={handleSelectAllRetailers}
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm"
            >
              Select All
            </button>
            <button
              onClick={handleClearAllRetailers}
              className="px-2 py-1 bg-gray-400 text-white rounded text-sm"
            >
              Clear
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto text-base">
            {filteredRetailers.map((r) => {
              const key = norm(r);
              return (
                <label key={key} className="flex items-center space-x-1">
                  <input
                    type="checkbox"
                    checked={selectedRetailers.includes(key)}
                    onChange={() => handleToggleRetailer(r)}
                  />
                  <span>{r}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 🟦 Suppliers */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-base">
          <h2 className="text-xl font-bold mb-3 text-gray-800 dark:text-gray-200">
            ④ Select Supplier(s)
          </h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={handleSelectAllSuppliers}
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm"
            >
              Select All
            </button>
            <button
              onClick={handleClearAllSuppliers}
              className="px-2 py-1 bg-gray-400 text-white rounded text-sm"
            >
              Clear
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto text-base">
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

        {/* 🟦 Categories */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-base">
          <h2 className="text-xl font-bold mb-3 text-gray-800 dark:text-gray-200">
            ⑤ Select Additional Category(ies)
          </h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={handleSelectAllCategories}
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm"
            >
              Select All
            </button>
            <button
              onClick={handleClearAllCategories}
              className="px-2 py-1 bg-gray-400 text-white rounded text-sm"
            >
              Clear
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1 text-base">
            {Object.entries(categoryColors)
              .filter(([k]) => k !== "Kingpin")
              .map(([k, { color }]) => {
                const label = categoryLabels[norm(k)] || k;
                return (
                  <label key={k} className="flex items-center space-x-1">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(norm(k))}
                      onChange={() => handleToggleCategory(k)}
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

        {/* 🟦 Trip Optimization */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow text-base">
          <h2 className="text-xl font-bold mb-3 text-gray-800 dark:text-gray-200">
            ⑥ Trip Optimization
          </h2>
          {tripStops.length > 0 ? (
            <div className="space-y-2">
              <ol className="list-decimal ml-5 text-base text-gray-700 dark:text-gray-300">
                {tripStops.map((stop, i) => (
                  <li key={i} className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{stop.label}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {formatFullAddress(stop)}
                      </div>
                    </div>
                    {i > 0 && (
                      <button
                        onClick={() => handleRemoveStop(i)}
                        className="ml-2 text-red-600 hover:text-red-800 text-sm"
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
                  className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Build Route
                </button>

                {tripStops.length > 1 && (
                  <>
                    <a
                      href={buildGoogleMapsUrl(tripStops, homeZip) || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 text-center"
                    >
                      Open in Google Maps
                    </a>
                    <a
                      href={buildAppleMapsUrl(tripStops, homeZip) || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 text-center"
                    >
                      Open in Apple Maps
                    </a>
                    <button
                      onClick={handleClearStops}
                      className="px-2 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
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

