"use client";

import { useState } from "react";
import CertisMap from "@/components/CertisMap";

export default function HomePage() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);

  const toggleValue = (value: string, current: string[], setter: (val: string[]) => void) => {
    setter(
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
    );
  };

  return (
    <main className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-100 dark:bg-gray-900 border-r overflow-y-auto p-4">
        <h1 className="text-xl font-bold mb-4">Filters</h1>

        {/* Category Filter */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Category</h2>
          {["Agronomy", "Grain", "Agronomy/Grain", "Office/Service", "Kingpin"].map((cat) => (
            <label key={cat} className="flex items-center space-x-2 mb-1">
              <input
                type="checkbox"
                checked={selectedCategories.includes(cat)}
                onChange={() => toggleValue(cat, selectedCategories, setSelectedCategories)}
              />
              <span>{cat}</span>
            </label>
          ))}
        </div>

        {/* State Filter */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">State</h2>
          {["IA", "IL", "IN", "MI", "MN", "ND", "NE", "OH", "SD", "WI"].map((state) => (
            <label key={state} className="flex items-center space-x-2 mb-1">
              <input
                type="checkbox"
                checked={selectedStates.includes(state)}
                onChange={() => toggleValue(state, selectedStates, setSelectedStates)}
              />
              <span>{state}</span>
            </label>
          ))}
        </div>

        {/* Supplier Filter */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Supplier</h2>
          {["Growmark", "CHS", "Helena", "Nutrien", "Winfield", "Certis"].map((sup) => (
            <label key={sup} className="flex items-center space-x-2 mb-1">
              <input
                type="checkbox"
                checked={selectedSuppliers.includes(sup)}
                onChange={() => toggleValue(sup, selectedSuppliers, setSelectedSuppliers)}
              />
              <span>{sup}</span>
            </label>
          ))}
        </div>
      </aside>

      {/* Map */}
      <div className="flex-1">
        <CertisMap
          selectedCategories={selectedCategories}
          selectedStates={selectedStates}
          selectedSuppliers={selectedSuppliers}
        />
      </div>
    </main>
  );
}
