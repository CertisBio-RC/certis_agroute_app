"use client";

import React, { useState } from "react";
import CertisMap from "../components/CertisMap";

const CATEGORY_COLORS: Record<string, string> = {
  Retailer: "#1f77b4",
  Dealer: "#ff7f0e",
  Supplier: "#2ca02c",
  Distributor: "#d62728",
  Other: "#9467bd",
};

export default function Page() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [tripStops, setTripStops] = useState<string[]>([]);

  const handleCategoryChange = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const handleAddStop = (stop: string) => {
    setTripStops((prev) => [...prev, stop]);
  };

  return (
    <main className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white p-4 flex flex-col space-y-6">
        <div>
          <h1 className="text-xl font-bold mb-1">Certis AgRoute Planner</h1>
          <p className="text-sm text-gray-400">Plan retailer visits with ease</p>
        </div>

        {/* Category Filters */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Filter by Category</h2>
          <ul className="space-y-1">
            {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
              <li key={cat} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id={cat}
                  checked={selectedCategories.includes(cat)}
                  onChange={() => handleCategoryChange(cat)}
                />
                <label htmlFor={cat} className="flex items-center space-x-2">
                  <span
                    className="inline-block w-3 h-3 rounded"
                    style={{ backgroundColor: color }}
                  />
                  <span>{cat}</span>
                </label>
              </li>
            ))}
          </ul>

          {/* Kingpin Legend Entry */}
          <div className="mt-3">
            <h3 className="text-sm font-semibold text-gray-300 mb-1">
              Special Category
            </h3>
            <div className="flex items-center space-x-2">
              <span
                className="inline-block w-3 h-3 rounded border-2"
                style={{ backgroundColor: "#FF0000", borderColor: "#FFFF00" }}
              />
              <span>Kingpin (always visible)</span>
            </div>
          </div>
        </div>

        {/* Trip Builder */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Trip Builder</h2>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {tripStops.map((stop, idx) => (
              <li key={idx}>{stop}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
        <CertisMap
          categoryColors={CATEGORY_COLORS}
          selectedCategories={selectedCategories}
          onAddStop={handleAddStop}
        />
      </div>
    </main>
  );
}
