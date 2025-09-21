// app/page.tsx
"use client";

import { useState } from "react";
import CertisMap from "../components/CertisMap";

export default function HomePage() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);

  const categories = ["Agronomy", "Grain", "Agronomy/Grain", "Office/Service", "Kingpin"];
  const suppliers = ["Growmark", "CHS", "Helena", "Winfield", "Nutrien"];

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const toggleSupplier = (sup: string) => {
    setSelectedSuppliers((prev) =>
      prev.includes(sup) ? prev.filter((s) => s !== sup) : [...prev, sup]
    );
  };

  return (
    <main className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-black text-white p-4 overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Filters</h2>

        <h3 className="text-lg font-semibold mt-4 mb-2">Categories</h3>
        <div className="space-y-2">
          {categories.map((cat) => (
            <label key={cat} className="block">
              <input
                type="checkbox"
                className="mr-2"
                checked={selectedCategories.includes(cat)}
                onChange={() => toggleCategory(cat)}
              />
              {cat}
            </label>
          ))}
        </div>

        <h3 className="text-lg font-semibold mt-4 mb-2">Suppliers</h3>
        <div className="space-y-2">
          {suppliers.map((sup) => (
            <label key={sup} className="block">
              <input
                type="checkbox"
                className="mr-2"
                checked={selectedSuppliers.includes(sup)}
                onChange={() => toggleSupplier(sup)}
              />
              {sup}
            </label>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
        <CertisMap
          selectedCategories={selectedCategories}
          selectedSuppliers={selectedSuppliers}
        />
      </div>
    </main>
  );
}
