"use client";

import { useState } from "react";
import CertisMap from "@/components/CertisMap";

export default function HomePage() {
  // Sidebar state
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [searchRetailer, setSearchRetailer] = useState("");
  const [homeZip, setHomeZip] = useState("");
  const [tripStops, setTripStops] = useState<string[]>([]);

  // Clear all filters
  const clearAll = () => {
    setSelectedStates([]);
    setSelectedCategories([]);
    setSelectedSuppliers([]);
    setSearchRetailer("");
    setHomeZip("");
    setTripStops([]);
  };

  // Add stop from map click
  const handleAddStop = (stop: string) => {
    if (!tripStops.includes(stop)) {
      setTripStops([...tripStops, stop]);
    }
  };

  // Dummy arrays (TODO: load dynamically if needed)
  const allStates = ["IA", "IL", "IN", "MI", "MN", "ND", "NE", "OH", "SD", "WI"];
  const allCategories = ["Agronomy", "Grain", "Agronomy/Grain", "Office/Service", "Kingpin"];
  const allSuppliers = ["Certis", "CHS", "Helena", "Nutrien", "Winfield"]; // example

  return (
    <main className="flex h-screen">
      {/* Sidebar */}
      <aside className="sidebar">
        
        {/* Card 1: Logo + Title + Clear All */}
        <div className="card flex flex-col items-center text-center">
          <a
            href="https://www.certisbio.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="./certis-logo.png"
              alt="Certis Logo"
              className="logo"
            />
          </a>
          <h1 className="text-lg font-bold mt-2">Certis AgRoute Planner</h1>
          <button
            onClick={clearAll}
            className="mt-2 bg-red-600 text-white text-sm px-3 py-1 rounded hover:bg-red-700"
          >
            Clear All
          </button>
        </div>

        {/* Card 2: Home Zip Code */}
        <div className="card">
          <label className="block text-sm font-medium mb-1">Home Zip Code</label>
          <input
            type="text"
            value={homeZip}
            onChange={(e) => setHomeZip(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="Enter ZIP"
          />
        </div>

        {/* Card 3: State Filter */}
        <div className="card">
          <label className="block text-sm font-medium mb-1">Filter by State</label>
          <select
            multiple
            value={selectedStates}
            onChange={(e) =>
              setSelectedStates(Array.from(e.target.selectedOptions, (o) => o.value))
            }
            className="w-full p-2 border rounded"
          >
            {allStates.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </div>

        {/* Card 4: Category Filter */}
        <div className="card">
          <label className="block text-sm font-medium mb-1">Filter by Category</label>
          <select
            multiple
            value={selectedCategories}
            onChange={(e) =>
              setSelectedCategories(Array.from(e.target.selectedOptions, (o) => o.value))
            }
            className="w-full p-2 border rounded"
          >
            {allCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Card 5: Retailer Name Search */}
        <div className="card">
          <label className="block text-sm font-medium mb-1">Search Retailer</label>
          <input
            type="text"
            value={searchRetailer}
            onChange={(e) => setSearchRetailer(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="Enter retailer name"
          />
        </div>

        {/* Card 6: Supplier Filter */}
        <div className="card">
          <label className="block text-sm font-medium mb-1">Filter by Supplier</label>
          <select
            multiple
            value={selectedSuppliers}
            onChange={(e) =>
              setSelectedSuppliers(Array.from(e.target.selectedOptions, (o) => o.value))
            }
            className="w-full p-2 border rounded"
          >
            {allSuppliers.map((sup) => (
              <option key={sup} value={sup}>
                {sup}
              </option>
            ))}
          </select>
        </div>

        {/* Card 7: Trip Stops */}
        <div className="card">
          <h2 className="font-semibold mb-2">Trip Stops</h2>
          <ul className="text-sm mb-2">
            {tripStops.map((stop, idx) => (
              <li key={idx}>{stop}</li>
            ))}
          </ul>
          {tripStops.length > 0 && (
            <button
              className="bg-blue-600 text-white text-sm px-3 py-1 rounded hover:bg-blue-700"
              onClick={() => alert("TODO: Optimize route and export to Maps")}
            >
              Optimize & Export Route
            </button>
          )}
        </div>
      </aside>

      {/* Map */}
      <section className="map-section">
        <CertisMap
          selectedStates={selectedStates}
          selectedCategories={selectedCategories}
          selectedSuppliers={selectedSuppliers}
          searchRetailer={searchRetailer}
          onAddStop={handleAddStop}
        />
      </section>
    </main>
  );
}
