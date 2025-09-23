// app/page.tsx
"use client";

import { useState } from "react";
import CertisMap, { categoryColors } from "@/components/CertisMap";
import Image from "next/image";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function Page() {
  // ========================================
  // 🎛️ Category Filter State
  // ========================================
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const handleToggle = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const handleSelectAll = () => {
    setSelectedCategories(Object.keys(categoryColors));
  };

  const handleClearAll = () => {
    setSelectedCategories([]);
  };

  return (
    <div className="flex h-screen w-screen">
      {/* ========================================
          📌 Sidebar
      ======================================== */}
      <aside className="w-64 bg-gray-100 dark:bg-gray-900 p-4 border-r border-gray-300 dark:border-gray-700 overflow-y-auto">
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

        {/* ✅ Category Filters */}
        <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">
          Categories
        </h2>

        {/* ✅ Select All / Clear All buttons */}
        <div className="flex space-x-2 mb-4">
          <button
            onClick={handleSelectAll}
            className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Select All
          </button>
          <button
            onClick={handleClearAll}
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
                onChange={() => handleToggle(cat)}
                className="mr-2"
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
      </aside>

      {/* ========================================
          🗺️ Map + Retailer Tiles
      ======================================== */}
      <main className="flex-1 relative">
        <CertisMap selectedCategories={selectedCategories} />
      </main>
    </div>
  );
}
