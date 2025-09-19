"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import CertisMap from "../components/CertisMap";

const CATEGORY_COLORS: Record<string, string> = {
  Kingpin: "#FF0000",
  Retailer: "#1E90FF",
  Distributor: "#32CD32",
};

export default function HomePage() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [stops, setStops] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-theme") === "dark";
    }
    return false;
  });

  const handleCategoryChange = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const handleAddStop = (stop: string) => {
    setStops((prev) => [...prev, stop]);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebar-theme", darkMode ? "dark" : "light");
    }
  }, [darkMode]);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div
        className={`w-80 p-4 flex flex-col ${
          darkMode ? "bg-gray-900 text-white" : "bg-white text-black"
        }`}
      >
        {/* Header with logo + dark mode toggle */}
        <div className="flex items-center justify-between mb-6">
          <Image
            src="/certis-logo.png"
            alt="Certis Logo"
            width={140}
            height={40}
            priority
          />
          <button
            onClick={() => setDarkMode((prev) => !prev)}
            className="px-3 py-1 rounded bg-gray-300 dark:bg-gray-700 dark:text-white"
          >
            {darkMode ? "Light" : "Dark"}
          </button>
        </div>

        <h2 className="text-lg font-semibold mb-2">Filter by Category</h2>
        {Object.keys(CATEGORY_COLORS).map((category) => (
          <label key={category} className="block mb-1">
            <input
              type="checkbox"
              checked={selectedCategories.includes(category)}
              onChange={() => handleCategoryChange(category)}
              className="mr-2"
            />
            {category}
          </label>
        ))}

        <div className="mt-6 text-sm italic">
          Kingpins are always shown in red with yellow outlines.
        </div>

        <h2 className="text-lg font-semibold mt-6 mb-2">Selected Stops</h2>
        <ul className="list-disc list-inside text-sm">
          {stops.map((stop, idx) => (
            <li key={idx}>{stop}</li>
          ))}
        </ul>
      </div>

      {/* Map */}
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
