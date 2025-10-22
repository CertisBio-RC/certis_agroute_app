// app/page.tsx
"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import CertisMap, { Stop, categoryColors } from "@/components/CertisMap";

const norm = (v: string) => (v || "").toString().trim().toLowerCase();

export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableRetailers, setAvailableRetailers] = useState<string[]>([]);
  const [availableSuppliers, setAvailableSuppliers] = useState<string[]>([]);

  // Map of retailer -> [states]
  const [retailerStateMap, setRetailerStateMap] = useState<Record<string, string[]>>({});

  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [tripMode, setTripMode] = useState<"entered" | "optimize">("entered");

  // ========================================
  // Helpers
  // ========================================
  const toggleAll = (setter: any, arr: string[], items: string[]) =>
    setter(arr.length === items.length ? [] : items);
  const clearAll = (setter: any) => setter([]);

  // ========================================
  // Trip Handling
  // ========================================
  const handleAddStop = (stop: Stop) => {
    if (!tripStops.some((s) => s.label === stop.label)) {
      setTripStops((prev) => [...prev, stop]);
    }
  };

  const handleClearStops = () => setTripStops([]);
  const handleRemoveStop = (idx: number) =>
    setTripStops((prev) => prev.filter((_, i) => i !== idx));

  // ========================================
  // Export
  // ========================================
  const exportToGoogleMaps = () => {
    if (!tripStops.length) return;
    const base = "https://www.google.com/maps/dir/";
    const query = tripStops.map((s) => encodeURIComponent(s.address)).join("/");
    window.open(base + query, "_blank");
  };

  const exportToAppleMaps = () => {
    if (!tripStops.length) return;
    const base = "https://maps.apple.com/?daddr=";
    const query = tripStops.map((s) => encodeURIComponent(s.address)).join("+to:");
    window.open(base + query, "_blank");
  };

  // ========================================
  // State → Retailer Cascade
  // ========================================
  const filteredRetailers = useMemo(() => {
    if (!selectedStates.length) return availableRetailers;
    return availableRetailers.filter((r) =>
      retailerStateMap[r]?.some((st) => selectedStates.includes(st))
    );
  }, [selectedStates, availableRetailers, retailerStateMap]);

  // ========================================
  // UI Rendering
  // ========================================
  return (
    <div className="flex flex-col h-screen w-full bg-gray-950 text-gray-100">
      <header className="flex items-center justify-between bg-gray-900 text-white px-4 py-2 shadow-md">
        <div className="flex items-center space-x-3">
          <button
            className="md:hidden p-2 rounded hover:bg-gray-800"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <Image
            src="/certis-logo.png"
            alt="Certis Biologicals"
            width={160}
            height={40}
            priority
          />
        </div>
        <h1 className="hidden md:block text-xl font-semibold text-yellow-400">
          Certis AgRoute Planner
        </h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen
              ? "fixed inset-y-0 left-0 z-50 w-72 bg-gray-900/80 shadow-lg overflow-y-auto transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0"
              : "hidden md:flex md:flex-col md:w-72 bg-gray-900/80 shadow-lg overflow-y-auto"
          }`}
        >
          <div className="p-4 space-y-4 text-[15px] md:text-[16px]">
            {/* Home ZIP */}
            <div className="bg-gray-900/80 rounded-xl p-3 shadow-lg">
              <h2 className="text-yellow-400 text-lg font-semibold mb-2">Home ZIP Code</h2>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Enter ZIP"
                  className="flex-1 bg-gray-800 text-white px-2 py-1 rounded border border-gray-700 focus:outline-none"
                />
                <button className="bg-blue-600 px-3 py-1 rounded text-white font-semibold">
                  Set
                </button>
              </div>
            </div>

            {/* States */}
            <div className="bg-gray-900/80 rounded-xl p-3 shadow-lg">
              <h2 className="text-yellow-400 text-lg font-semibold mb-2">Select State(s)</h2>
              <div className="flex space-x-2 mb-2">
                <button
                  onClick={() =>
                    toggleAll(setSelectedStates, selectedStates, availableStates)
                  }
                  className="bg-blue-600 text-white px-2 py-1 rounded text-sm"
                >
                  Select All
                </button>
                <button
                  onClick={() => clearAll(setSelectedStates)}
                  className="bg-gray-600 text-white px-2 py-1 rounded text-sm"
                >
                  Clear
                </button>
              </div>
              <div className="grid grid-cols-3 gap-x-2">
                {availableStates.map((st) => (
                  <label key={st} className="flex items-center space-x-1">
                    <input
                      type="checkbox"
                      checked={selectedStates.includes(st)}
                      onChange={() =>
                        setSelectedStates((prev) =>
                          prev.includes(st)
                            ? prev.filter((x) => x !== st)
                            : [...prev, st]
                        )
                      }
                    />
                    <span>{st}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Retailers */}
            <div className="bg-gray-900/80 rounded-xl p-3 shadow-lg">
              <h2 className="text-yellow-400 text-lg font-semibold mb-2">Select Retailer(s)</h2>
              <div className="flex space-x-2 mb-2">
                <button
                  onClick={() =>
                    toggleAll(setSelectedRetailers, selectedRetailers, filteredRetailers)
                  }
                  className="bg-blue-600 text-white px-2 py-1 rounded text-sm"
                >
                  Select All
                </button>
                <button
                  onClick={() => clearAll(setSelectedRetailers)}
                  className="bg-gray-600 text-white px-2 py-1 rounded text-sm"
                >
                  Clear
                </button>
              </div>
              <div className="h-48 overflow-y-auto space-y-1">
                {filteredRetailers.map((r) => (
                  <label key={r} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedRetailers.includes(r)}
                      onChange={() =>
                        setSelectedRetailers((prev) =>
                          prev.includes(r)
                            ? prev.filter((x) => x !== r)
                            : [...prev, r]
                        )
                      }
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Suppliers */}
            <div className="bg-gray-900/80 rounded-xl p-3 shadow-lg">
              <h2 className="text-yellow-400 text-lg font-semibold mb-2">Select Supplier(s)</h2>
              <div className="flex space-x-2 mb-2">
                <button
                  onClick={() =>
                    toggleAll(setSelectedSuppliers, selectedSuppliers, availableSuppliers)
                  }
                  className="bg-blue-600 text-white px-2 py-1 rounded text-sm"
                >
                  Select All
                </button>
                <button
                  onClick={() => clearAll(setSelectedSuppliers)}
                  className="bg-gray-600 text-white px-2 py-1 rounded text-sm"
                >
                  Clear
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
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
                    <span>{s}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Categories */}
            <div className="bg-gray-900/80 rounded-xl p-3 shadow-lg">
              <h2 className="text-yellow-400 text-lg font-semibold mb-2">Select Categories</h2>
              <div className="flex space-x-2 mb-2">
                <button
                  onClick={() =>
                    toggleAll(
                      setSelectedCategories,
                      selectedCategories,
                      Object.keys(categoryColors).filter((c) => c !== "Kingpin")
                    )
                  }
                  className="bg-blue-600 text-white px-2 py-1 rounded text-sm"
                >
                  Select All
                </button>
                <button
                  onClick={() => clearAll(setSelectedCategories)}
                  className="bg-gray-600 text-white px-2 py-1 rounded text-sm"
                >
                  Clear
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[15px]">
                {Object.keys(categoryColors)
                  .filter((c) => c !== "Kingpin")
                  .map((c) => (
                    <label key={c} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(c)}
                        onChange={() =>
                          setSelectedCategories((prev) =>
                            prev.includes(c)
                              ? prev.filter((x) => x !== c)
                              : [...prev, c]
                          )
                        }
                      />
                      <span
                        className="flex items-center space-x-1"
                        style={{ color: categoryColors[c].color }}
                      >
                        <span
                          className="inline-block w-3 h-3 rounded-full"
                          style={{ backgroundColor: categoryColors[c].color }}
                        ></span>
                        <span>{c}</span>
                      </span>
                    </label>
                  ))}
              </div>
            </div>

            {/* Trip Optimization */}
            <div className="bg-gray-900/80 rounded-xl p-3 shadow-lg">
              <h2 className="text-yellow-400 text-lg font-semibold mb-2">Trip Optimization</h2>
              <div className="flex space-x-3 mb-3">
                <label className="flex items-center space-x-1">
                  <input
                    type="radio"
                    name="tripMode"
                    checked={tripMode === "entered"}
                    onChange={() => setTripMode("entered")}
                  />
                  <span>Map as Entered</span>
                </label>
                <label className="flex items-center space-x-1">
                  <input
                    type="radio"
                    name="tripMode"
                    checked={tripMode === "optimize"}
                    onChange={() => setTripMode("optimize")}
                  />
                  <span>Optimized Route</span>
                </label>
              </div>

              {tripStops.length === 0 ? (
                <p className="text-gray-400 text-sm">No stops added yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {tripStops.map((stop, idx) => (
                    <li
                      key={idx}
                      className="flex justify-between items-center border-b border-gray-700 pb-1"
                    >
                      <span>{stop.label}</span>
                      <button
                        onClick={() => handleRemoveStop(idx)}
                        className="text-red-400 hover:text-red-300 text-xs font-semibold"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-col space-y-2 mt-3">
                <button
                  onClick={exportToGoogleMaps}
                  className="bg-green-600 text-white px-3 py-1 rounded font-semibold"
                >
                  Send to Google Maps
                </button>
                <button
                  onClick={exportToAppleMaps}
                  className="bg-yellow-600 text-white px-3 py-1 rounded font-semibold"
                >
                  Send to Apple Maps
                </button>
                <button
                  onClick={handleClearStops}
                  className="bg-gray-600 text-white px-3 py-1 rounded font-semibold"
                >
                  Clear Stops
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Map Area */}
        <main className="flex-1 relative">
          <CertisMap
            selectedStates={selectedStates}
            selectedRetailers={selectedRetailers}
            selectedSuppliers={selectedSuppliers}
            selectedCategories={selectedCategories}
            onStatesLoaded={setAvailableStates}
            onRetailersLoaded={(r) => {
              setAvailableRetailers(r);
              // ✅ Map each retailer to its associated states from the loaded GeoJSON
              setRetailerStateMap((prev) => {
                const newMap = { ...prev };
                r.forEach((ret) => {
                  if (!newMap[ret]) newMap[ret] = [];
                });
                return newMap;
              });
            }}
            onSuppliersLoaded={setAvailableSuppliers}
            onRetailerSummary={(summaries) => {
              // Build retailer→state map for cascade
              const newMap: Record<string, string[]> = {};
              summaries.forEach((entry) => {
                if (!newMap[entry.retailer]) newMap[entry.retailer] = [];
                entry.states.forEach((s: string) => {
                  if (!newMap[entry.retailer].includes(s))
                    newMap[entry.retailer].push(s);
                });
              });
              setRetailerStateMap(newMap);
            }}
            onAddStop={handleAddStop}
            tripStops={tripStops}
            tripMode={tripMode}
            onOptimizedRoute={(stops) => setTripStops(stops)}
          />
        </main>
      </div>
    </div>
  );
}
