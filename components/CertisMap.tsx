// app/page.tsx
"use client";

import { useState } from "react";
import CertisMap, { categoryColors } from "@/components/CertisMap";
import Image from "next/image";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// ✅ States represented in your dataset
const stateList = [
  "IA", "IL", "IN", "MI", "MN", "ND", "NE", "OH", "SD", "WI"
];

export default function Page() {
  // ========================================
  // 🎛️ Filter States
  // ========================================
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);

  // ========================================
  // 🔘 Category Handlers
  // ========================================
  const handleToggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const handleSelectAllCategories = () => {
    setSelectedCategories(Object.keys(categoryColors));
  };

  const handleClearAllCategories = () => {
    setSelectedCategories([]);
  };

  // ========================================
  // 🔘 State Handlers
  // ========================================
  const handleToggleState = (state: string) => {
    setSelectedStates((prev) =>
      prev.includes(state)
        ? prev.filter((s) => s !== state)
        : [...prev, state]
    );
  };

  const handleSelectAllStates = () => {
    setSelectedStates([...stateList]);
  };

  const handleClearAllStates = () => {
    setSelectedStates([]);
  };

  return (
    <div className="flex h-screen w-screen">
      {/* ========================================
          📌 Sidebar with Tiles
      ======================================== */}
      <aside className="w-80 bg-gray-100 dark:bg-gray-900 p-4 border-r border-gray-300 dark:border-gray-700 overflow-y-auto">
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
            {stateList.map((state) => (
              <label key={state} className="flex items-center space-x-1">
                <input
                  type="checkbox"
                  checked={selectedStates.includes(state)}
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
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Filter by retailer name
          </p>
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
                  checked={selectedCategories.includes(cat)}
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
        </div>

        {/* ========================================
            🟦 Tile 5: Supplier Filter
        ======================================== */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Supplier Filter
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Filter by supplier
          </p>
        </div>

        {/* ========================================
            🟦 Tile 6: Debug Card
        ======================================== */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Debug Info
          </h2>

          <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
            <div>
              <strong>Selected States:</strong>{" "}
              {selectedStates.length > 0 ? selectedStates.join(", ") : "None"}
            </div>
            <div>
              <strong>Selected Categories:</strong>{" "}
              {selectedCategories.length > 0
                ? selectedCategories.join(", ")
                : "None"}
            </div>
            <div className="text-red-600 dark:text-yellow-400 font-semibold">
              Kingpins are always visible (bright red, yellow border).
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
        />
      </main>
    </div>
  );
}
