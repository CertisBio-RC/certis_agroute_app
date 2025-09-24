// app/page.tsx
"use client";

import { useState } from "react";
import CertisMap, { categoryColors } from "@/components/CertisMap";
import Image from "next/image";
import { Menu, X } from "lucide-react"; // icons for hamburger

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// ✅ Temporary supplier list (static placeholder)
const supplierList = [
  "Certis Biologicals",
  "BASF",
  "Bayer",
  "Corteva",
  "Syngenta",
];

// ✅ Normalizer function (matches CertisMap)
const norm = (val: string) => (val || "").toString().trim().toLowerCase();

export default function Page() {
  // ========================================
  // 🎛️ State Hooks
  // ========================================
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [availableRetailers, setAvailableRetailers] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);

  // ✅ New: Retailer Summary from CertisMap
  const [retailerSummary, setRetailerSummary] = useState<
    { state: string; retailer: string; count: number; category?: string }[]
  >([]);

  // ✅ Mobile sidebar toggle
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    const normalized = norm(supplier);
    setSelectedSuppliers((prev) =>
      prev.includes(normalized)
        ? prev.filter((s) => s !== normalized)
        : [...prev, normalized]
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
      {/* ========================================
          📱 Mobile Hamburger Button
      ======================================== */}
      <button
        className="absolute top-3 left-3 z-20 p-2 bg-gray-800 text-white rounded-md md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* ========================================
          📌 Sidebar with Tiles
      ======================================== */}
      <aside
        className={`fixed md:static top-0 left-0 h-full w-72 bg-gray-100 dark:bg-gray-900 p-4 border-r border-gray-300 dark:border-gray-700 overflow-y-auto z-10 transform transition-transform duration-300
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        {/* ✅ Logo */}
        <div className="flex items-center justify-center mb-6">
          <Image
            src={`${basePath}/certis-logo.png`}
            alt="Certis Logo"
            width={180}
            height={60}
            priority
          />
        </div>

        {/* ========================================
            🟦 Tile 1: Home Zip Code
        ======================================== */}
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

        {/* ========================================
            🟦 Tile 2: State Filter
        ======================================== */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            State Filter
          </h2>

          {/* Select All / Clear All buttons */}
          <div className="flex space-x-2 mb-3">
            <button
              onClick={handleSelectAllStates}
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Select All
            </button>
            <button
              onClick={handleClearAllStates}
              className="px-2 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
            >
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
                <span className="text-gray-700 dark:text-gray-300 text-sm">
                  {state}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* ========================================
            🟦 Tile 3: Retailer Filter
        ======================================== */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Retailer Filter
          </h2>

          <div className="flex space-x-2 mb-3">
            <button
              onClick={handleClearAllRetailers}
              className="px-2 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
            >
              Clear All
            </button>
          </div>

          <div className="space-y-2 max-h-32 overflow-y-auto">
            {availableRetailers.map((retailer) => (
              <label key={retailer} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedRetailers.includes(norm(retailer))}
                  onChange={() => handleToggleRetailer(retailer)}
                />
                <span className="text-gray-700 dark:text-gray-300 text-sm">
                  {retailer}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* ========================================
            🟦 Tile 4: Category Filter + Legend
        ======================================== */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Categories
          </h2>

          {/* Select All / Clear All buttons */}
          <div className="flex space-x-2 mb-4">
            <button
              onClick={handleSelectAllCategories}
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Select All
            </button>
            <button
              onClick={handleClearAllCategories}
              className="px-2 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
            >
              Clear All
            </button>
          </div>

          <ul className="space-y-2">
            {Object.entries(categoryColors).map(([cat, style]) => (
              <li key={cat} className="flex items-center">
                <input
                  type="checkbox"
                  id={`filter-${cat}`}
                  checked={selectedCategories.includes(norm(cat))}
                  onChange={() => handleToggleCategory(cat)}
                  className="mr-2"
                  disabled={cat === "Kingpin"} // Kingpins always visible
                />
                <label
                  htmlFor={`filter-${cat}`}
                  className="flex items-center text-gray-700 dark:text-gray-300"
                >
                  <span
                    className="inline-block w-4 h-4 mr-2 rounded-full border"
                    style={{
                      backgroundColor: style.color,
                      borderColor: style.outline || "#000",
                    }}
                  ></span>
                  {cat}
                </label>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-sm text-red-600 dark:text-yellow-400 font-semibold">
            Kingpins are always visible (bright red, yellow border).
          </p>
        </div>

        {/* ========================================
            🟦 Tile 6: Channel Summary
        ======================================== */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Channel Summary
          </h2>

          <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
            <div>
              <strong>Selected States ({selectedStates.length}):</strong>{" "}
              {selectedStates.length > 0
                ? selectedStates.join(", ")
                : "None"}
            </div>
            <div>
              <strong>Selected Retailers ({selectedRetailers.length}):</strong>{" "}
              {selectedRetailers.length > 0
                ? selectedRetailers.join(", ")
                : "None"}
            </div>

            {/* ✅ Always show Kingpins */}
            {kingpinSummary.length > 0 && (
              <div>
                <strong>Kingpins:</strong>
                <ul className="list-disc ml-5">
                  {kingpinSummary.map((s, i) => (
                    <li key={i}>
                      {s.state}, {s.retailer} – {s.count} locations
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <strong>Retailer Summary:</strong>{" "}
              {normalSummary.length > 0 ? (
                <ul className="list-disc ml-5">
                  {normalSummary.map((s, i) => (
                    <li key={i}>
                      {s.state}, {s.retailer} – {s.count} locations
                    </li>
                  ))}
                </ul>
              ) : (
                "None"
              )}
            </div>
          </div>
        </div>

        {/* ========================================
            🟦 Tile 7: Trip Optimization
        ======================================== */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Trip Optimization
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Collect points and optimize route
          </p>
        </div>
      </aside>

      {/* ========================================
          🗺️ Map Area
      ======================================== */}
      <main className="flex-1 relative">
        <CertisMap
          selectedCategories={selectedCategories}
          selectedStates={selectedStates}
          selectedSuppliers={selectedSuppliers}
          selectedRetailers={selectedRetailers}
          onStatesLoaded={setAvailableStates}
          onRetailersLoaded={setAvailableRetailers}
          onRetailerSummary={setRetailerSummary} // ✅ New callback
        />
      </main>
    </div>
  );
}
