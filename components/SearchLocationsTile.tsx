"use client";

import { useState, useMemo } from "react";
import { Stop } from "@/components/CertisMap";

interface Props {
  allStops: Stop[]; // Full retailer dataset (not tripStops)
  onAddStop: (stop: Stop) => void;
}

export default function SearchLocationsTile({ allStops, onAddStop }: Props) {
  const [query, setQuery] = useState("");

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

  const handleAdd = (stop: Stop) => {
    onAddStop(stop);
    setQuery(""); // Clear after selection
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-[16px] leading-tight">
      <h2 className="text-lg font-bold text-yellow-400 mb-3">Search Locations</h2>

      <input
        type="text"
        value={query}
        placeholder="Search by retailer, address, city, state, ZIP"
        onChange={(e) => setQuery(e.target.value)}
        className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 mb-3"
      />

      {query && results.length === 0 && (
        <p className="text-gray-300 text-[15px]">No matches found.</p>
      )}

      <div className="max-h-56 overflow-y-auto space-y-2">
        {results.map((s, i) => (
          <div
            key={i}
            className="p-2 rounded bg-gray-700/40 hover:bg-gray-700/60 cursor-pointer"
            onClick={() => handleAdd(s)}
          >
            <div className="font-semibold text-yellow-300 text-[17px]">
              {s.label}
            </div>
            <div className="text-[14px] text-white leading-tight">
              {s.address}
              <br />
              {s.city}, {s.state} {s.zip}
            </div>

            <button
              onClick={() => handleAdd(s)}
              className="mt-2 px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Add to Trip
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
