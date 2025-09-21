// app/page.tsx
"use client";

import { useState } from "react";
import CertisMap from "@/components/CertisMap";

export default function Page() {
  // State to hold selected categories
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Example categories (replace with real ones from your dataset if needed)
  const categories = [
    "Corn",
    "Soybeans",
    "Wheat",
    "Retailer",
    "Supplier",
  ];

  // Toggle selection
  const handleCategoryChange = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  return (
    <main className="flex min-h-screen bg-gray-100">
      {/* Sidebar Filters */}
      <div className="w-80 bg-white shadow-md p-4 overflow-y-auto">
        <h2 className="font-bold text-lg mb-4">Filters</h2>
        <p className="text-sm text-gray-600 mb-4">
          Select categories to display on the map.
        </p>

        <form className="space-y-2">
          {categories.map((category) => (
            <label
              key={category}
              className="flex items-center space-x-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedCategories.includes(category)}
                onChange={() => handleCategoryChange(category)}
                className="h-4 w-4 text-blue-600"
              />
              <span className="text-gray-800">{category}</span>
            </label>
          ))}
        </form>
      </div>

      {/* Map Section */}
      <div className="flex-1 h-screen">
        <CertisMap selectedCategories={selectedCategories} />
      </div>
    </main>
  );
}
