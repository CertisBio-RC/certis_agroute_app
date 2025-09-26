// app/page.tsx
"use client";

import { useState } from "react";
import CertisMap, { categoryColors } from "@/components/CertisMap";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// ✅ Normalizer (for states/retailers/categories only)
const norm = (val: string) => (val || "").toString().trim().toLowerCase();

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
    { state: string; retailer: string; count: number; suppliers: string[]; category?: string }[]
  >([]);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ✅ Trip Optimization
  const [tripStops, setTripStops] = useState<string[]>([]);
  const handleAddStop = (stop: string) => {
    if (!tripStops.includes(stop)) {
      setTripStops((prev) => [...prev, stop]);
    }
  };
  const handleClearStops = () => setTripStops([]);

  // ========================================
  // 🔘 Category Handlers
  // ========================================
  const handleToggleCategory = (category: string) => {
    const normalized = norm(category);
    setSelectedCategories((prev) =>
      prev.includes(normalized)
        ? prev.filter((c) => c !== normalized)
        : [...prev, normalized]
    );
  };

  const handleSelectAllCategories = () => {
    setSelectedCategories(
      Object.keys(categoryColors)
        .filter((c) => c !== "Kingpin")
        .map(norm)
    );
  };

  const handleClearAllCategories = () => {
    setSelectedCategories([]);
  };

  // ========================================
  // 🔘 State Handlers
  // ========================================
  const handleToggleState = (state: string) => {
    const normalized = norm(state);
    setSelectedStates((prev) =>
      prev.includes(normalized)
        ? prev.filter((s) => s !== normalized)
        : [...prev, normalized]
    );
  };

  const handleSelectAllStates = () => {
    setSelectedStates(availableStates.map(norm));
  };

  const handleClearAllStates = () => {
    setSelectedStates([]);
  };

  // ========================================
  // 🔘 Supplier Handlers
  // ========================================
  const handleToggleSupplier = (supplier: string) => {
    setSelectedSuppliers((prev) =>
      prev.includes(supplier)
        ? prev.filter((s) => s !== supplier)
        : [...prev, supplier]
    );
  };

  const handleClearAllSuppliers = () => {
    setSelectedSuppliers([]);
  };

  // ========================================
  // 🔘 Retailer Handlers
  // ========================================
  const handleToggleRetailer = (retailer: string) => {
    const normalized = norm(retailer);
    setSelectedRetailers((prev) =>
      prev.includes(normalized)
        ? prev.filter((r) => r !== normalized)
        : [...prev, normalized]
    );
  };

  const handleClearAllRetailers = () => {
    setSelectedRetailers([]);
  };

  // ========================================
  // 🟦 Derived summaries
  // ========================================
  const kingpinSummary = retailerSummary.filter(
    (s) => norm(s.retailer) === "kingpin" || norm(s.category || "") === "kingpin"
  );
  const normalSummary = retailerSummary.filter(
    (s) => norm(s.retailer) !== "kingpin" && norm(s.category || "") !== "kingpin"
  );

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
        className={`fixed md:static top-0 left-0 h-full w-72 bg-gray-100 dark:bg-gray-900 p-4 border-r border-gray-300 dark:border-gray-700 overflow-y-auto z-10 transform transition-transform duration-300
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
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Home Zip Code
          </h2>
          <input
            type="text"
            placeholder="Enter ZIP"
            className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>

        {/* 🟦 Tile 2: State Filter */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            State Filter
          </h2>
          <div className="flex space-x-2 mb-3">
            <button onClick={handleSelectAllStates} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">
              Select All
            </button>
            <button onClick={handleClearAllStates} className="px-2 py-1 bg-gray-600 text-white rounded text-sm">
              Clear All
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {availableStates.map((state) => (
              <label key={state} className="flex items-center space-x-1">
                <input
                  type="checkbox"
                  checked={selectedStates.includes(norm(state))}
                  onChange={() => handleToggleState(state)}
                  className="mr-1"
                />
                <span className="text-gray-700 dark:text-gray-300 text-sm">{state}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 🟦 Tile 3: Retailer Filter */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Retailer Filter
          </h2>
          <div className="flex space-x-2 mb-3">
            <button onClick={handleClearAllRetailers} className="px-2 py-1 bg-gray-600 text-white rounded text-sm">
              Clear All
            </button>
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {availableRetailers.map((longName) => (
              <label key={longName} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedRetailers.includes(norm(longName))}
                  onChange={() => handleToggleRetailer(longName)}
                />
                <span className="text-gray-700 dark:text-gray-300 text-sm">{longName}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 🟦 Tile 4: Supplier Filter */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Supplier Filter
          </h2>
          <div className="flex space-x-2 mb-3">
            <button onClick={handleClearAllSuppliers} className="px-2 py-1 bg-gray-600 text-white rounded text-sm">
              Clear All
            </button>
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {availableSuppliers.map((supplier) => (
              <label key={supplier} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedSuppliers.includes(supplier)}
                  onChange={() => handleToggleSupplier(supplier)}
                />
                <span className="text-gray-700 dark:text-gray-300 text-sm">{supplier}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 🟦 Tile 5: Categories (Legend) */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">Categories</h2>
          <div className="flex space-x-2 mb-4">
            <button onClick={handleSelectAllCategories} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">
              Select All
            </button>
            <button onClick={handleClearAllCategories} className="px-2 py-1 bg-gray-600 text-white rounded text-sm">
              Clear All
            </button>
          </div>
          <ul className="space-y-2">
            {Object.entries(categoryColors).map(([cat, style]) => (
              <li key={cat} className="flex items-center">
                {cat !== "Kingpin" ? (
                  <>
                    <input
                      type="checkbox"
                      id={`filter-${cat}`}
                      checked={selectedCategories.includes(norm(cat))}
                      onChange={() => handleToggleCategory(cat)}
                      className="mr-2"
                    />
                    <label htmlFor={`filter-${cat}`} className="flex items-center text-gray-700 dark:text-gray-300">
                      <span
                        className="inline-block w-4 h-4 mr-2 rounded-full border"
                        style={{ backgroundColor: style.color, borderColor: style.outline || "#000" }}
                      ></span>
                      {cat}
                    </label>
                  </>
                ) : (
                  <div className="flex items-center text-gray-700 dark:text-gray-300 ml-1">
                    <span
                      className="inline-block w-4 h-4 mr-2 rounded-full border"
                      style={{ backgroundColor: style.color, borderColor: style.outline || "#000" }}
                    ></span>
                    {cat}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-red-600 dark:text-yellow-400 font-semibold">
            Kingpins are always visible (bright red, yellow border).
          </p>
        </div>

        {/* 🟦 Tile 6: Channel Summary */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">Channel Summary</h2>
          <div className="text-sm text-gray-700 dark:text-gray-300 space-y-3">
            {/* States Selected */}
            <div>
              <strong>States Selected ({selectedStates.length}):</strong>{" "}
              {selectedStates.length > 0 ? selectedStates.join(", ") : "None"}
            </div>

            {/* Retailers Selected */}
            <div>
              <strong>Retailers Selected ({selectedRetailers.length}):</strong>
              {selectedRetailers.length > 0 ? (
                <ul className="list-disc ml-5">
                  {availableRetailers
                    .filter((r) => selectedRetailers.includes(norm(r)))
                    .map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                </ul>
              ) : (
                " None"
              )}
            </div>

            {/* Location Summaries */}
            <div>
              <strong>Location Summaries:</strong>
              {normalSummary.length > 0 ? (
                <ul className="list-disc ml-5">
                  {normalSummary.map((s, i) => (
                    <li key={i}>
                      {s.retailer} – {s.count} locations
                    </li>
                  ))}
                </ul>
              ) : (
                " None"
              )}
            </div>

            {/* Supplier Summaries */}
            <div>
              <strong>Supplier Summaries:</strong>
              {normalSummary.length > 0 ? (
                <ul className="list-disc ml-5">
                  {normalSummary.map((s, i) => (
                    <li key={i}>
                      {s.retailer} –{" "}
                      {s.suppliers && s.suppliers.length > 0 ? s.suppliers.join(", ") : "N/A"}
                    </li>
                  ))}
                </ul>
              ) : (
                " None"
              )}
            </div>
          </div>
        </div>

        {/* 🟦 Tile 7: Trip Optimization */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">Trip Optimization</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Selected stops will appear below:
          </p>
          {tripStops.length > 0 ? (
            <div className="space-y-2">
              <ol className="list-decimal ml-5 text-sm text-gray-700 dark:text-gray-300">
                {tripStops.map((stop, i) => (
                  <li key={i}>{stop}</li>
                ))}
              </ol>
              <button
                onClick={handleClearStops}
                className="mt-2 px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
              >
                Clear All
              </button>
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
        />
      </main>
    </div>
  );
}
