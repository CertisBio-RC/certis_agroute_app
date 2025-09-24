// app/page.tsx
"use client";

import { useState } from "react";
import CertisMap, {
  categoryColors,
  availableStates,
  availableSuppliers,
  availableRetailers,
} from "@/components/CertisMap";
import Image from "next/image";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function Page() {
  // ========================================
  // 🎛️ State Hooks
  // ========================================
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([]);

  // ========================================
  // 🔘 Handlers
  // ========================================
  const toggleSelection = (list: string[], setList: any, item: string) => {
    setList((prev: string[]) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const clearSelection = (setList: any) => setList([]);

  const selectAll = (items: string[], setList: any) => setList([...items]);

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
            🟦 Tile 1: State Filter
        ======================================== */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            State Filter
          </h2>
          <div className="flex space-x-2 mb-3">
            <button
              onClick={() => selectAll(availableStates, setSelectedStates)}
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Select All
            </button>
            <button
              onClick={() => clearSelection(setSelectedStates)}
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
                  checked={selectedStates.includes(state)}
                  onChange={() => toggleSelection(selectedStates, setSelectedStates, state)}
                />
                <span className="text-gray-700 dark:text-gray-300 text-sm">{state}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ========================================
            🟦 Tile 2: Category Filter
        ======================================== */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Categories
          </h2>
          <div className="flex space-x-2 mb-4">
            <button
              onClick={() =>
                setSelectedCategories(Object.keys(categoryColors).filter((c) => c !== "Kingpin"))
              }
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Select All
            </button>
            <button
              onClick={() => clearSelection(setSelectedCategories)}
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
                  checked={selectedCategories.includes(cat)}
                  onChange={() => toggleSelection(selectedCategories, setSelectedCategories, cat)}
                  disabled={cat === "Kingpin"} // Kingpins always visible
                />
                <label className="flex items-center text-gray-700 dark:text-gray-300">
                  <span
                    className="inline-block w-4 h-4 mr-2 rounded-full border"
                    style={{ backgroundColor: style.color, borderColor: style.outline }}
                  ></span>
                  {cat}
                </label>
              </li>
            ))}
          </ul>
        </div>

        {/* ========================================
            🟦 Tile 3: Supplier Filter
        ======================================== */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Suppliers
          </h2>
          <button
            onClick={() => clearSelection(setSelectedSuppliers)}
            className="px-2 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 mb-3"
          >
            Clear All
          </button>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {availableSuppliers.map((supplier) => (
              <label key={supplier} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedSuppliers.includes(supplier)}
                  onChange={() => toggleSelection(selectedSuppliers, setSelectedSuppliers, supplier)}
                />
                <span className="text-gray-700 dark:text-gray-300 text-sm">{supplier}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ========================================
            🟦 Tile 4: Retailer Filter
        ======================================== */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
            Retailers
          </h2>
          <button
            onClick={() => clearSelection(setSelectedRetailers)}
            className="px-2 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 mb-3"
          >
            Clear All
          </button>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {availableRetailers.map((retailer) => (
              <label key={retailer} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedRetailers.includes(retailer)}
                  onChange={() =>
                    toggleSelection(selectedRetailers, setSelectedRetailers, retailer)
                  }
                />
                <span className="text-gray-700 dark:text-gray-300 text-sm">{retailer}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ========================================
            🟦 Debug Info
        ======================================== */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">Debug Info</h2>
          <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
            <div>
              <strong>States:</strong> {selectedStates.join(", ") || "None"}
            </div>
            <div>
              <strong>Categories:</strong> {selectedCategories.join(", ") || "None"}
            </div>
            <div>
              <strong>Suppliers:</strong> {selectedSuppliers.join(", ") || "None"}
            </div>
            <div>
              <strong>Retailers:</strong> {selectedRetailers.join(", ") || "None"}
            </div>
          </div>
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
        />
      </main>
    </div>
  );
}
