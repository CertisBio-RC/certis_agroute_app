"use client";

import { useState } from "react";
import CertisMap from "../components/CertisMap";

export default function Page() {
  const [homeZip, setHomeZip] = useState("");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedRetailer, setSelectedRetailer] = useState("");
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [tripStops, setTripStops] = useState<string[]>([]);

  const clearAll = () => {
    setHomeZip("");
    setSelectedStates([]);
    setSelectedCategories([]);
    setSelectedRetailer("");
    setSelectedSuppliers([]);
    setTripStops([]);
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-neutral-900">
      {/* Sidebar */}
      <aside className="w-72 p-4 overflow-y-auto bg-white dark:bg-neutral-800 shadow-lg">
        {/* Logo + Title + Clear */}
        <div className="flex flex-col items-center mb-6">
          <a href="https://www.certisbio.com" target="_blank" rel="noopener noreferrer">
            <img src="/certis_logo.png" alt="Certis Biologicals" className="w-[150px] mb-2" />
          </a>
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Certis AgRoute Planner</h1>
          <button
            onClick={clearAll}
            className="mt-2 px-3 py-1 text-sm rounded bg-red-600 text-white hover:bg-red-700"
          >
            Clear All Filters
          </button>
        </div>

        {/* Home ZIP */}
        <div className="rounded-lg shadow-md p-4 mb-4 bg-gray-50 dark:bg-neutral-700">
          <label className="block text-sm font-bold mb-1">Home ZIP Code</label>
          <input
            type="text"
            value={homeZip}
            onChange={(e) => setHomeZip(e.target.value)}
            placeholder="Enter ZIP"
            className="w-full px-2 py-1 rounded border text-black"
          />
        </div>

        {/* State */}
        <div className="rounded-lg shadow-md p-4 mb-4 bg-gray-50 dark:bg-neutral-700">
          <label className="block text-sm font-bold mb-2">State</label>
          {["IA", "IL", "IN", "MI", "MN", "ND", "OH", "SD"].map((state) => (
            <label key={state} className="block text-sm">
              <input
                type="checkbox"
                checked={selectedStates.includes(state)}
                onChange={(e) => {
                  if (e.target.checked) setSelectedStates([...selectedStates, state]);
                  else setSelectedStates(selectedStates.filter((s) => s !== state));
                }}
              />{" "}
              {state}
            </label>
          ))}
        </div>

        {/* Category */}
        <div className="rounded-lg shadow-md p-4 mb-4 bg-gray-50 dark:bg-neutral-700">
          <label className="block text-sm font-bold mb-2">Category</label>
          {["Agronomy", "Grain", "Agronomy/Grain", "Office/Service", "Kingpin"].map((cat) => (
            <label key={cat} className="block text-sm">
              <input
                type="checkbox"
                checked={selectedCategories.includes(cat)}
                onChange={(e) => {
                  if (e.target.checked) setSelectedCategories([...selectedCategories, cat]);
                  else setSelectedCategories(selectedCategories.filter((c) => c !== cat));
                }}
              />{" "}
              {cat}
            </label>
          ))}
        </div>

        {/* Retailer */}
        <div className="rounded-lg shadow-md p-4 mb-4 bg-gray-50 dark:bg-neutral-700">
          <label className="block text-sm font-bold mb-1">Retailer Name</label>
          <input
            type="text"
            value={selectedRetailer}
            onChange={(e) => setSelectedRetailer(e.target.value)}
            placeholder="Search by retailer"
            className="w-full px-2 py-1 rounded border text-black"
          />
        </div>

        {/* Supplier */}
        <div className="rounded-lg shadow-md p-4 mb-4 bg-gray-50 dark:bg-neutral-700">
          <label className="block text-sm font-bold mb-2">Supplier</label>
          {["Certis", "CHS", "Helena", "Nutrien", "Winfield"].map((sup) => (
            <label key={sup} className="block text-sm">
              <input
                type="checkbox"
                checked={selectedSuppliers.includes(sup)}
                onChange={(e) => {
                  if (e.target.checked) setSelectedSuppliers([...selectedSuppliers, sup]);
                  else setSelectedSuppliers(selectedSuppliers.filter((s) => s !== sup));
                }}
              />{" "}
              {sup}
            </label>
          ))}
        </div>

        {/* Trip Builder */}
        <div className="rounded-lg shadow-md p-4 mb-4 bg-gray-50 dark:bg-neutral-700">
          <label className="block text-sm font-bold mb-2">Trip Builder</label>
          {tripStops.length === 0 ? (
            <p className="text-sm text-gray-500">No stops selected yet</p>
          ) : (
            <ul className="text-sm list-disc list-inside">
              {tripStops.map((stop, i) => (
                <li key={i}>{stop}</li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-col gap-2">
            <button className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">
              Optimize Trip
            </button>
            <button className="px-3 py-1 rounded bg-green-600 text-white text-sm hover:bg-green-700">
              Send to Google Maps
            </button>
            <button className="px-3 py-1 rounded bg-gray-600 text-white text-sm hover:bg-gray-700">
              Send to Apple Maps
            </button>
          </div>
        </div>
      </aside>

      {/* Map */}
      <main className="flex-1 relative">
        <CertisMap
          selectedStates={selectedStates}
          selectedCategories={selectedCategories}
          selectedRetailer={selectedRetailer}
          selectedSuppliers={selectedSuppliers}
          tripStops={tripStops}
          setTripStops={setTripStops}
        />
      </main>
    </div>
  );
}
