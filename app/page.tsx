"use client";

import { useState } from "react";
import CertisMap, { categoryColors } from "@/components/CertisMap";
import Image from "next/image";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function Page() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-gray-100 dark:bg-gray-900 p-4 overflow-y-auto">
        <div className="flex items-center space-x-2 mb-6">
          <Image
            src={`${basePath}/certis-logo.png`}
            alt="Certis Logo"
            width={150}
            height={50}
            priority
          />
        </div>

        <h2 className="text-lg font-bold mb-2">Categories</h2>
        <ul className="space-y-2">
          {Object.keys(categoryColors).map((cat) => (
            <li key={cat}>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(cat)}
                  onChange={() => toggleCategory(cat)}
                />
                <span
                  className="w-4 h-4 inline-block rounded-full"
                  style={{ backgroundColor: categoryColors[cat] }}
                ></span>
                <span>{cat}</span>
              </label>
            </li>
          ))}
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
