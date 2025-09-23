"use client";

import { useState } from "react";
import CertisMap, { categoryColors } from "@/components/CertisMap";
import Image from "next/image";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function Page() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const toggleCategory = (category: string) => {
    if (category === "Kingpin") return; // 🔒 Kingpins always visible
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const categories = Object.keys(categoryColors);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-gray-100 dark:bg-gray-900 p-4 overflow-y-auto">
        <div className="flex items-center mb-6">
          <Image
            src={`${basePath}/certis-logo.png`}
            alt="Certis Logo"
            width={160}
            height={50}
          />
        </div>
        <h2 className="text-lg font-bold mb-2">Categories</h2>
        <ul>
          {categories.map((category) => {
            const color = categoryColors[category].color;
            const stroke = categoryColors[category].stroke;
            const isKingpin = category === "Kingpin";

            return (
              <li key={category} className="flex items-center mb-2">
                <input
                  type="checkbox"
                  checked={isKingpin || selectedCategories.includes(category)}
                  onChange={() => toggleCategory(category)}
                  disabled={isKingpin} // 🔒 Kingpin always on
                  className="mr-2"
                />
                <span
                  className="w-4 h-4 mr-2 rounded-full border"
                  style={{ backgroundColor: color, borderColor: stroke }}
                />
                <span className={isKingpin ? "font-bold text-red-600" : ""}>
                  {category}
                  {isKingpin && " (always visible)"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Map */}
      <div className="flex-1">
        <CertisMap
          selectedCategories={selectedCategories}
          onAddStop={(stop) => console.log("Added stop:", stop)}
        />
      </div>
    </div>
  );
}
