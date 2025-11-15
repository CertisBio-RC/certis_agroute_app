"use client";

import { useState, useMemo } from "react";
import { Stop } from "@/components/CertisMap";

interface Props {
  allStops: Stop[];              // ★ full retailer dataset provided by page.tsx
  onAddStop: (stop: Stop) => void;
}

export default function SearchLocationsTile({ allStops, onAddStop }: Props) {
  const [query, setQuery] = useState("");

  // Case-insensitive match across label, address, city, state, zip
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return allStops.filter((s) => {
      return (
        s.label.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        (s.city || "").toLowerCase().includes(q) ||
        (s.state || "").toLowerCase().includes(q) ||
        String(s.zip || "").toLowerCase().includes(q)
      );
    });
  }, [query, allStops]);

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-[16px] leading-tight">
      <h2 className="text-lg font-bold text-yellow-400 mb-3">Search Locations</h2>

      <div className="flex space-x-2">
        <input
          type="text"
          value={query}
          placeholder="Search by retailer, address, city, state, supplier, etc."
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700"
        />
      </div>

      <div className="mt-3 max-h-56 overflow-y-auto space-y-2 text-white">
        {results.length === 0 ? (
          <p className="text-gray-300">No matches found.</p>
        ) : (
          results.map((s, i) => (
            <div
              key={i}
              className="p-2 rounded bg-gray-700/40 hover:bg-gray-700/60 cursor-pointer"
              onClick={() => onAddStop(s)}
            >
              <div className="font-semibold text-yellow-300 text-[17px]">
                {s.label}
              </div>
              <div className="text-[14px]">
                {s.address}
                <br />
                {s.city}, {s.state} {s.zip}
              </div>
              <button className="mt-1 px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                Add to Trip
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
