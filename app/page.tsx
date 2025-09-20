// app/page.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import CertisMap from "../components/CertisMap";

export default function Page() {
  const [darkMode, setDarkMode] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    "Kingpin",
    "Retailer",
    "Distributor",
  ]);
  const [selectedStops, setSelectedStops] = useState<string[]>([]);

  const handleCategoryToggle = (category: string) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter((c) => c !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  const handleAddStop = (stop: string) => {
    if (!selectedStops.includes(stop)) {
      setSelectedStops([...selectedStops, stop]);
    }
  };

  return (
    <div className={darkMode ? "bg-gray-900 text-white" : "bg-gray-100 text-black"}>
      {/* Header */}
      <header className="flex justify-between items-center px-4 py-2 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <Image
            src="/certis-logo.png"
            alt="Certis Logo"
            width={40}
            height={40}
            className="object-contain"
          />
          <h1 className="text-xl font-bold">Certis AgRoute Planner</h1>
        </div>
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          {darkMode ? "Light" : "Dark"}
        </button>
      </header>

      <div className="flex h-[calc(100vh-50px)]">
        {/* Sidebar */}
        <aside
          className={`w-64 p-4 border-r ${
            darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
          }`}
        >
          <h2 className="text-lg font-semibold mb-2">Filter by Category</h2>
          {["Kingpin", "Retailer", "Distributor"].map((cat) => (
            <label key={cat} className="flex items-center space-x-2 mb-2">
              <input
                type="checkbox"
                checked={selectedCategories.includes(cat)}
                onChange={() => handleCategoryToggle(cat)}
              />
              <span>{cat}</span>
            </label>
          ))}

          <p className="text-sm italic mt-2 text-red-500">
            Kingpins are always shown in red with yellow outlines.
          </p>

          <h2 className="text-lg font-semibold mt-4">Selected Stops</h2>
          <ul className="list-disc list-inside text-sm">
            {selectedStops.length === 0 ? (
              <li className="text-gray-400">None yet</li>
            ) : (
              selectedStops.map((stop, idx) => <li key={idx}>{stop}</li>)
            )}
          </ul>
        </aside>

        {/* Map */}
        <main className="flex-1">
          <CertisMap
            selectedCategories={selectedCategories}
            onAddStop={handleAddStop}
          />
        </main>
      </div>
    </div>
  );
}
