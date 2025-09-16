"use client";

import { useState } from "react";
import CertisMap from "../components/CertisMap";
import { CATEGORY_COLORS } from "../utils/constants";

export default function Page() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [tripStops, setTripStops] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(true);

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

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle("dark");
    setDarkMode(!darkMode);
  };

  return (
    <div className="page-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <h1>Certis AgRoute Planner</h1>
          <div className="brand-meta">Plan retailer visits with ease</div>
        </div>

        <button
          onClick={toggleDarkMode}
          className="panel"
          style={{ cursor: "pointer" }}
        >
          {darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
        </button>

        {/* Category Filters */}
        <div className="panel">
          <h2>Filter by Category</h2>
          <ul>
            {Object.keys(CATEGORY_COLORS).map((category) => (
              <li key={category}>
                <label className="radio">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category)}
                    onChange={() => handleCategoryToggle(category)}
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
        </div>

        {/* Trip Builder */}
        <div className="panel">
          <h2>Trip Builder</h2>
          {tripStops.length === 0 ? (
            <p className="bullets">Click markers on the map to add stops.</p>
          ) : (
            <ol className="list-decimal list-inside space-y-1">
              {tripStops.map((stop, i) => (
                <li key={i}>{stop}</li>
              ))}
            </ol>
          )}
        </div>
      </aside>

      {/* Content / Map */}
      <div className="content">
        <div className="content-inner">
          <div className="map-card">
            <div className="map-frame">
              <div className="map-canvas">
                <CertisMap
                  categoryColors={CATEGORY_COLORS}
                  selectedCategories={selectedCategories}
                  onAddStop={handleAddStop}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
