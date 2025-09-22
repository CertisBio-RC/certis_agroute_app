"use client";

import { useState } from "react";
import Image from "next/image";
import CertisMap from "@/components/CertisMap";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function Page() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const handleClear = () => setSelectedCategories([]);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white flex flex-col">
        {/* ✅ Logo with basePath */}
        <div className="flex items-center p-4">
          <Image
            src={`${basePath}/certislogo.png`}
            alt="Certis Logo"
            width={40}
            height={40}
            className="mr-2"
          />
          <h1 className="font-bold">Certis AgRoute Planner</h1>
        </div>

        <button
          className="bg-blue-600 hover:bg-blue-700 px-3 py-2 m-2 rounded"
          onClick={handleClear}
        >
          Clear All
        </button>

        {/* Placeholder cards */}
        <div className="flex-1 overflow-y-auto">
          {[...Array(7)].map((_, idx) => (
            <div
              key={idx}
              className="bg-slate-800 hover:bg-slate-700 p-2 m-2 rounded"
            >
              Card {idx + 1}
            </div>
          ))}
        </div>

        <div className="p-4">
          <button className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded w-full">
            Optimize Trip & Export
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
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
