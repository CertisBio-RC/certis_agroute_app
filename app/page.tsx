"use client";

import { useState } from "react";
import CertisMap from "../components/CertisMap";

// Category color legend (Kingpin + other categories)
const CATEGORY_COLORS: Record<string, string> = {
  Kingpin: "#ff0000",
  Retailer: "#1d4ed8",
  Dealer: "#059669",
  Distributor: "#f59e0b",
};

export default function HomePage() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [stops, setStops] = useState<string[]>([]);

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const handleAddStop = (stop: string) => {
    setStops((prev) => [...prev, stop]);
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-gray-100 dark:bg-gray-800 p-4 overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">Filters</h2>

        {/* Category filters */}
        {Object.entries(CATEGORY_COLORS).map(([category, color]) => (
          <label key={category} className="flex items-center space-x-2 mb-2">
            <input
              type="checkbox"
              checked={selectedCategories.includes(category)}
              onChange={() => handleCategoryToggle(category)}
            />
            <span
              className="w-3 h-3 inline-block rounded"
              style={{ backgroundColor: color }}
            ></span>
            <span>{category}</span>
          </label>
        ))}

        {/* Stops */}
        <h2 className="text-lg font-bold mt-6 mb-2">Stops</h2>
        <ul className="list-disc ml-5">
          {stops.map((stop, idx) => (
            <li key={idx}>{stop}</li>
          ))}
        </ul>

        {/* Kingpin note */}
        <div className="mt-6 p-2 border rounded bg-yellow-50 dark:bg-yellow-900">
          <strong>Note:</strong> Kingpin locations are always shown in bright red
          with yellow outlines.
        </div>
      </div>

      {/* Map area */}
      <div className="flex-1">
        <CertisMap
          categoryColors={CATEGORY_COLORS}
          selectedCategories={selectedCategories}
          onAddStop={handleAddStop}
        />
      </div>
    </div>
  );
}
