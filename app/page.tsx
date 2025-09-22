"use client";

import CertisMap from "@/components/CertisMap";
import { useState } from "react";
import Image from "next/image";

export default function Page() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const handleClear = () => setSelectedCategories([]);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="flex flex-col items-center p-4">
          <Image
            src="/certis-logo.png"   // ✅ safe filename
            alt="Certis Logo"
            width={160}
            height={50}
            priority
          />
          <h1 className="text-xl font-bold mt-2">Certis AgRoute Planner</h1>
        </div>
        <button
          onClick={handleClear}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded m-2"
        >
          Clear All
        </button>
        {Array.from({ length: 7 }, (_, i) => (
          <button
            key={i}
            className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded m-2 text-left"
          >
            Card {i + 1}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <CertisMap selectedCategories={selectedCategories} />
      </div>
    </div>
  );
}
