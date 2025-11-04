"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { Menu, X, ChevronDown, ChevronUp } from "lucide-react";
import CertisMap, { Stop, categoryColors } from "@/components/CertisMap";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/certis_agroute_app";

export default function Page() {
  // ===============================
  // Sidebar + Zip
  // ===============================
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [zipCode, setZipCode] = useState("");
  const [zipConfirmed, setZipConfirmed] = useState(false);

  // ===============================
  // Filters
  // ===============================
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // ===============================
  // Data from Map
  // ===============================
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableRetailers, setAvailableRetailers] = useState<string[]>([]);
  const [retailerStateMap, setRetailerStateMap] = useState<Record<string, string[]>>({});
  const [retailerSummaries, setRetailerSummaries] = useState<
    { retailer: string; count: number; suppliers: string[]; states: string[] }[]
  >([]);

  // ===============================
  // Trip Planner
  // ===============================
  const [tripStops, setTripStops] = useState<Stop[]>([]);
  const [tripMode, setTripMode] = useState<"entered" | "optimize">("entered");
  const [summaryOpen, setSummaryOpen] = useState(false);

  // ===============================
  // Helper Utilities
  // ===============================
  const toggleAll = (setter: any, arr: string[], items: string[]) =>
    setter(arr.length === items.length ? [] : items);
  const clearAll = (setter: any) => setter([]);

  const handleAddStop = (stop: Stop) => {
    if (!tripStops.some((s) => s.label === stop.label)) {
      setTripStops((prev) => [...prev, stop]);
    }
  };
  const handleRemoveStop = (idx: number) =>
    setTripStops((prev) => prev.filter((_, i) => i !== idx));
  const handleClearStops = () => setTripStops([]);

  // ===============================
  // Route Exports (Use Addresses)
  // ===============================
  const exportToGoogleMaps = () => {
    if (!tripStops.length) return;
    const base = "https://www.google.com/maps/dir/";
    const query = tripStops
      .map((s) =>
        encodeURIComponent(
          `${s.address || ""}, ${s.city || ""}, ${s.state || ""} ${s.zip || ""}`
        )
      )
      .join("/");
    window.open(base + query, "_blank");
  };

  const exportToAppleMaps = () => {
    if (!tripStops.length) return;
    const base = "https://maps.apple.com/?daddr=";
    const query = tripStops
      .map((s) =>
        encodeURIComponent(
          `${s.address || ""}, ${s.city || ""}, ${s.state || ""} ${s.zip || ""}`
        )
      )
      .join("+to:");
    window.open(base + query, "_blank");
  };

  // ===============================
  // Filter Retailers by Selected States
  // ===============================
  const filteredRetailers = useMemo(() => {
    if (!selectedStates.length) return availableRetailers;
    return availableRetailers.filter((r) =>
      retailerStateMap[r]?.some((st) => selectedStates.includes(st))
    );
  }, [selectedStates, availableRetailers, retailerStateMap]);

  // ===============================
  // Render
  // ===============================
  return (
    <div className="flex flex-col h-screen w-full bg-gray-950 text-gray-100">
      {/* HEADER */}
      <header className="flex items-center justify-between bg-gray-900 text-white px-4 py-2 shadow-md">
        <div className="flex items-center space-x-3">
          {/* Mobile Toggle */}
          <button
            className="md:hidden p-2 rounded hover:bg-gray-800"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <Image
            src={`${basePath}/certis-logo.png`}
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

      {/* MAIN BODY */}
      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <aside
          className={`${
            sidebarOpen
              ? "fixed inset-y-0 left-0 z-50 w-80 min-w-[20rem] bg-gray-900/80 shadow-lg overflow-y-auto transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0"
              : "hidden md:flex md:flex-col md:w-80 min-w-[20rem] bg-gray-900/80 shadow-lg overflow-y-auto"
          }`}
        >
          <div className="p-4 space-y-4 text-[15px] md:text-[16px]">
            {/* ZIP CODE */}
            <div className="bg-gray-900/80 rounded-xl p-3 shadow-lg">
              <h2 className="text-yellow-400 text-lg font-semibold mb-2">Home ZIP Code</h2>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Enter ZIP"
                  value={zipCode}
                  onChange={(e) => {
                    setZipCode(e.target.value);
                    setZipConfirmed(false);
                  }}
                  className="flex-1 bg-gray-800 text-white px-2 py-1 rounded border border-gray-700 focus:outline-none focus:border-b-2 focus:border-yellow-400"
                />
                <button
                  className="bg-blue-600 px-3 py-1 rounded text-white font-semibold"
                  onClick={() => setZipConfirmed(true)}
                >
                  Set
                </button>
              </div>
              {zipConfirmed && (
                <p className="text-yellow-400 italic text-sm mt-1">
                  ZIP code {zipCode} set as home location.
                </p>
              )}
            </div>

            {/* STATE FILTER */}
            <div className="bg-gray-900/80 rounded-xl p-3 shadow-lg">
              <h2 className="text-yellow-400 text-lg font-semibold mb-2">Select State(s)</h2>
              <div className="flex space-x-2 mb-2">
                <button
                  onClick={() => toggleAll(setSelectedStates, selectedStates, availableStates)}
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
                          prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]
                        )
                      }
                    />
                    <span>{st}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* RETAILER FILTER */}
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
                          prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
                        )
                      }
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* CATEGORY FILTER */}
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
              <div className="flex flex-col space-y-1 text-[15px]">
                {Object.keys(categoryColors)
                  .filter((c) => c !== "Kingpin")
                  .map((c) => (
                    <label key={c} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(c)}
                        onChange={() =>
                          setSelectedCategories((prev) =>
                            prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                          )
                        )}
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

            {/* RETAILER SUMMARY */}
            <div className="bg-gray-900/80 rounded-xl p-3 shadow-lg">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-yellow-400 text-lg font-semibold">Retailer Summary</h2>
                <button
                  className="md:hidden text-gray-300 hover:text-yellow-400"
                  onClick={() => setSummaryOpen(!summaryOpen)}
                >
                  {summaryOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
              <div className={`${summaryOpen ? "block" : "hidden md:block"} max-h-64 overflow-y-auto`}>
                {retailerSummaries.length === 0 ? (
                  <p className="text-gray-400 text-sm">No retailer summary available.</p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-yellow-400 border-b border-gray-700">
                        <th className="text-left py-1">Retailer</th>
                        <th className="text-left py-1">Locs</th>
                        <th className="text-left py-1">Suppliers</th>
                        <th className="text-left py-1">States</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retailerSummaries.map((r, idx) => (
                        <tr key={idx} className="border-b border-gray-800">
                          <td className="py-1">{r.retailer}</td>
                          <td className="py-1">{r.count}</td>
                          <td className="py-1">{r.suppliers.join(", ")}</td>
                          <td className="py-1">{r.states.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* TRIP PLANNER */}
            <div className="bg-gray-900/80 rounded-xl p-3 shadow-lg mb-10">
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

        {/* MAP AREA */}
        <main className="flex-1 relative">
          <CertisMap
            selectedStates={selectedStates}
            selectedRetailers={selectedRetailers}
            selectedCategories={selectedCategories}
            selectedSuppliers={[]} // suppliers filter not yet used in UI
            zipCode={zipConfirmed ? zipCode : undefined} // ✅ Only pass when Set
            onStatesLoaded={setAvailableStates}
            onRetailersLoaded={setAvailableRetailers}
            onSuppliersLoaded={() => {}}
            onRetailerSummary={(summaries) => {
              const normalized = summaries.map((s: any) => ({
                retailer: s.retailer,
                count: s.count,
                suppliers: Array.isArray(s.suppliers) ? s.suppliers : [],
                states: Array.isArray(s.states) ? s.states : [],
              }));
              setRetailerSummaries(normalized);
              const mapping: Record<string, string[]> = {};
              normalized.forEach((s) => (mapping[s.retailer] = s.states));
              setRetailerStateMap(mapping);
            }}
            onAddStop={handleAddStop}
            tripStops={tripStops}
            tripMode={tripMode}
            onOptimizedRoute={setTripStops}
          />
        </main>
      </div>
    </div>
  );
}
