"use client";

import { useState } from "react";
import CertisMap from "@/components/CertisMap";
import Image from "next/image";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function Page() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const handleClear = () => {
    setSelectedCategories([]);
  };

  return (
    <div className="flex h-screen w-screen">
      {/* Sidebar */}
      <div className="w-64 bg-[#0A1E3A] text-white flex flex-col p-4">
        <div className="flex items-center mb-4">
          <Image
            src={`${basePath}/certis-logo.png`}
            alt="Certis Logo"
            width={160}
            height={40}
            priority
          />
        </div>

        <h1 className="text-lg font-bold mb-4">Certis AgRoute Planner</h1>

        <button
          onClick={handleClear}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded mb-4"
        >
          Clear All
        </button>

        {/* Example cards (can be replaced with real filters later) */}
        {["Card 1", "Card 2", "Card 3", "Card 4", "Card 5", "Card 6", "Card 7"].map(
          (card, idx) => (
            <div
              key={idx}
              className="bg-[#112B57] hover:bg-[#1C3F75] rounded p-2 mb-2 cursor-pointer"
            >
              {card}
            </div>
          )
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <CertisMap
          selectedCategories={selectedCategories}
          onAddStop={(stop) =>
            setSelectedCategories((prev) => [...prev, stop])
          }
        />
      </div>
    </div>
  );
}
