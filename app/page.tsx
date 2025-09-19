"use client";

import { useState } from "react";
import Image from "next/image";
import CertisMap from "@/components/CertisMap";

const CATEGORY_COLORS: Record<string, string> = {
  Retailer: "#1E90FF",
  Distributor: "#32CD32",
  Partner: "#FFD700",
};

export default function Page() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between bg-white shadow px-4 py-2">
        <div className="flex items-center space-x-3">
          <Image
            src="/ymslogo3.png"
            alt="Certis Logo"
            width={40}
            height={40}
            priority
          />
          <h1 className="text-xl font-bold">Certis AgRoute Planner</h1>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 bg-gray-50 border-r border-gray-200 p-4 overflow-y-auto">
          <h2 className="text-lg font-semibold mb-2">Categories</h2>
          {Object.entries(CATEGORY_COLORS).map(([category, color]) => (
            <label key={category} className="flex items-center space-x-2 mb-1">
              <input
                type="checkbox"
                checked={selectedCategories.includes(category)}
                onChange={() => toggleCategory(category)}
              />
              <span
                className="w-3 h-3 rounded"
                style={{ backgroundColor: color }}
              ></span>
              <span>{category}</span>
            </label>
          ))}

          {/* Kingpin note */}
          <div className="mt-4 p-2 border border-yellow-400 bg-yellow-50 rounded">
            <strong className="text-red-600">Kingpins:</strong> Always visible,
            bright red with yellow outline.
          </div>
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          <div className="map-canvas absolute inset-0">
            <CertisMap
              categoryColors={CATEGORY_COLORS}
              selectedCategories={selectedCategories}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
