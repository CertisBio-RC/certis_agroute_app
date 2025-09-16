// app/page.tsx
"use client";

import { useState } from "react";
import CertisMap from "../components/CertisMap";
import { CATEGORY_COLORS } from "../utils/constants";

export default function Page() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [tripStops, setTripStops] = useState<string[]>([]);

  const handleCategoryToggle = (category: string) => {
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
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-80 bg-gray-100 dark:bg-gray-900 p-4 overflow-y-auto">
        <h1 className="text-xl font-bold mb-4">Certis AgRoute Planner</h1>

        {/* Category Filters */}
        <section>
          <h2 className="text-lg font-semibold mb-2">Filter by Category</h2>
          <ul>
            {Object.keys(CATEGORY_COLORS).map((category) => (
              <li key={category} className="mb-2">
                <label className="inline-flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category)}
                    onChange={() => handleCategoryToggle(category)}
                    className="form-checkbox"
                  />
                  <span
                    className="w-3 h-3 inline-block rounded"
                    style={{ backgroundColor: CATEGORY_COLORS[category] }}
                  ></span>
                  <span className="capitalize">{category}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        {/* Trip Builder */}
        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-2">Trip Builder</h2>
          {tripStops.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Click markers on the map to add stops.
            </p>
          ) : (
            <ol className="list-decimal list-inside space-y-1">
              {tripStops.map((stop, i) => (
                <li key={i}>{stop}</li>
              ))}
            </ol>
          )}
        </section>
      </aside>

      {/* Map */}
      <main className="flex-1">
        <CertisMap
          categoryColors={CATEGORY_COLORS}
          selectedCategories={selectedCategories}
          onAddStop={handleAddStop}
        />
      </main>
    </div>
  );
}
