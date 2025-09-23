"use client";

import { useState } from "react";
import CertisMap from "@/components/CertisMap";
import Image from "next/image";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

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
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-gray-100 dark:bg-gray-800 p-4 overflow-y-auto">
        <div className="flex items-center mb-6">
          <Image
            src={`${basePath}/certis-logo.png`}
            alt="Certis Logo"
            width={160}
            height={40}
            priority
          />
        </div>
        <h2 className="text-lg font-semibold mb-2">Filter by Category</h2>
        {[
          "Agronomy",
          "Agronomy/Grain",
          "Distribution",
          "Feed",
          "Grain",
          "Grain/Feed",
          "Kingpin",
          "Office/Service",
        ].map((category) => (
          <div key={category} className="mb-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedCategories.includes(category)}
                onChange={() => toggleCategory(category)}
              />
              <span>{category}</span>
            </label>
          </div>
        ))}
      </div>

      {/* Map */}
      <div className="flex-1">
        <CertisMap selectedCategories={selectedCategories} />
      </div>
    </div>
  );
}
