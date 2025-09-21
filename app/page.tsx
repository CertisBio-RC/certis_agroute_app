"use client";

import { useState } from "react";
import CertisMap from "@/components/CertisMap";

export default function HomePage() {
  // ✅ Sidebar state
  const [homeZip, setHomeZip] = useState("");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [retailerSearch, setRetailerSearch] = useState("");
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [tripStops, setTripStops] = useState<string[]>([]);

  // ✅ Toggle helpers
  const toggleSelection = (
    value: string,
    setFn: React.Dispatch<React.SetStateAction<string[]>>,
    state: string[]
  ) => {
    setFn(
      state.includes(value)
        ? state.filter((v) => v !== value)
        : [...state, value]
    );
  };

  // ✅ Clear all filters
  const clearAll = () => {
    setHomeZip("");
    setSelectedStates([]);
    setSelectedCategories([]);
    setRetailerSearch("");
    setSelectedSuppliers([]);
    setTripStops([]);
  };

  // ✅ Trip logic
  const optimizeTrip = () => {
    alert("🚧 Trip optimization logic coming soon...");
  };

  const sendToGoogleMaps = () => {
    alert("🚧 Google Maps export coming soon...");
  };

  const sendToAppleMaps = () => {
    alert("🚧 Apple Maps export coming soon...");
  };

  // ✅ Handle waypoint add from map
  const handleAddStop = (stop: string) => {
    setTripStops((prev) =>
      prev.includes(stop) ? prev : [...prev, stop]
    );
  };

  return (
    <main className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-96 bg-gray-50 dark:bg-gray-900 border-r border-gray-300 dark:border-gray-700 p-4 overflow-y-auto space-y-6">
        {/* 1. Header Card */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow flex flex-col items-center">
          <a
            href="https://www.certisbio.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="./certis-logo.png"
              alt="Certis Biologicals"
              className="h-12 w-auto mb-2"
            />
          </a>
          <h1 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-100">
            Certis AgRoute Planner
          </h1>
          <button
            onClick={clearAll}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Clear All Filters
          </button>
        </div>

        {/* 2. Home ZIP Code */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-200">
            Home ZIP Code
          </h2>
          <input
            type="text"
            value={homeZip}
            onChange={(e) => setHomeZip(e.target.value)}
            placeholder="Enter ZIP"
            className="w-full p-2 border rounded-md text-gray-800"
          />
        </div>

        {/* 3. State Filter */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-md font-semibold mb-3 text-gray-700 dark:text-gray-200">
            State
          </h2>
          {["IA", "IL", "IN", "MI", "MN", "NE", "ND", "OH", "SD"].map((state) => (
            <label
              key={state}
              className="block mb-2 text-sm text-gray-700 dark:text-gray-300"
            >
              <input
                type="checkbox"
                checked={selectedStates.includes(state)}
                onChange={() =>
                  toggleSelection(state, setSelectedStates, selectedStates)
                }
                className="mr-2 accent-purple-600"
              />
              {state}
            </label>
          ))}
        </div>

        {/* 4. Category Filter */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-md font-semibold mb-3 text-gray-700 dark:text-gray-200">
            Category
          </h2>
          {["Agronomy", "Grain", "Agronomy/Grain", "Office/Service", "Kingpin"].map(
            (category) => (
              <label
                key={category}
                className="block mb-2 text-sm text-gray-700 dark:text-gray-300"
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(category)}
                  onChange={() =>
                    toggleSelection(category, setSelectedCategories, selectedCategories)
                  }
                  className="mr-2 accent-blue-600"
                />
                {category}
              </label>
            )
          )}
        </div>

        {/* 5. Retailer Name Filter */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-200">
            Retailer Name
          </h2>
          <input
            type="text"
            value={retailerSearch}
            onChange={(e) => setRetailerSearch(e.target.value)}
            placeholder="Search by retailer"
            className="w-full p-2 border rounded-md text-gray-800"
          />
        </div>

        {/* 6. Supplier Filter */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-md font-semibold mb-3 text-gray-700 dark:text-gray-200">
            Supplier
          </h2>
          {["Certis", "CHS", "Helena", "Nutrien", "Winfield"].map((supplier) => (
            <label
              key={supplier}
              className="block mb-2 text-sm text-gray-700 dark:text-gray-300"
            >
              <input
                type="checkbox"
                checked={selectedSuppliers.includes(supplier)}
                onChange={() =>
                  toggleSelection(supplier, setSelectedSuppliers, selectedSuppliers)
                }
                className="mr-2 accent-green-600"
              />
              {supplier}
            </label>
          ))}
        </div>

        {/* 7. Trip Builder */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-md font-semibold mb-3 text-gray-700 dark:text-gray-200">
            Trip Builder
          </h2>
          <ul className="mb-3 list-disc list-inside text-sm text-gray-700 dark:text-gray-300">
            {tripStops.length === 0 && <li>No stops selected yet</li>}
            {tripStops.map((stop, idx) => (
              <li key={idx}>{stop}</li>
            ))}
          </ul>
          <div className="space-y-2">
            <button
              onClick={optimizeTrip}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Optimize Trip
            </button>
            <button
              onClick={sendToGoogleMaps}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Send to Google Maps
            </button>
            <button
              onClick={sendToAppleMaps}
              className="w-full px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800"
            >
              Send to Apple Maps
            </button>
          </div>
        </div>
      </aside>

      {/* Map */}
      <div className="flex-1">
        <CertisMap
          selectedCategories={selectedCategories}
          selectedSuppliers={selectedSuppliers}
          selectedStates={selectedStates}
          retailerSearch={retailerSearch}
          onAddStop={handleAddStop}
        />
      </div>
    </main>
  );
}
