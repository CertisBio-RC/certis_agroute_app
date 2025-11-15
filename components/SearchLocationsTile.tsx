"use client";

import { useState, useMemo } from "react";
import type { RetailerFeature } from "../types";

interface Props {
  allRetailers: RetailerFeature[];                    // Full GeoJSON dataset (never filtered)
  onAddToTrip: (retailer: RetailerFeature) => void;   // Push into tripStops (page.tsx)
}

export default function SearchLocationsTile({ allRetailers, onAddToTrip }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RetailerFeature[]>([]);
  const [searched, setSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const normalizedIndex = useMemo(() => {
    // Lightweight in-memory index to speed future searches
    return allRetailers.map((r) => {
      const p = r.properties;
      return {
        item: r,
        search: (
          `${p["Long Name"]} ${p["Retailer"]} ${p["Name"]} ` +
          `${p["City"]} ${p["State"]} ${p["Zip"]} ${p["Suppliers"]}`
        ).toLowerCase()
      };
    });
  }, [allRetailers]);

  const runSearch = () => {
    const q = query.trim().toLowerCase();
    setSearched(true);

    if (!q) {
      setResults([]);
      return;
    }

    setIsSearching(true);

    // Lightweight fuzzy match
    const matches = normalizedIndex
      .filter((x) => x.search.includes(q))
      .slice(0, 200)            // Hard stop to prevent UI overload
      .map((x) => x.item);

    setResults(matches);
    setIsSearching(false);
  };

  return (
    <div className="space-y-3 p-4 bg-[#162035] rounded-xl border border-[#2d3b57] select-none">
      {/* ---- Header ---- */}
      <div className="text-[20px] font-bold text-yellow-400">Search Locations</div>

      {/* ---- Search input + button ---- */}
      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 px-3 py-2 rounded-md bg-[#0F172A] text-white text-[16px] border border-gray-600
                     focus:outline-none focus:ring-2 focus:ring-yellow-500"
          placeholder="Retailer, city, or ZIP"
          value={query}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          onClick={runSearch}
          className="px-4 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold"
        >
          Search
        </button>
      </div>

      {/* ---- Search status ---- */}
      {isSearching && (
        <div className="text-gray-300 text-[15px] italic">Searching…</div>
      )}

      {/* ---- No results ---- */}
      {searched && results.length === 0 && !isSearching && (
        <div className="text-gray-300 text-[15px] mt-1">No matches found.</div>
      )}

      {/* ---- Results list ---- */}
      {results.length > 0 && (
        <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1">
          {results.map((r) => {
            const p = r.properties;
            return (
              <div
                key={`${p["Retailer"]}-${p["Name"]}-${p["City"]}-${p["Zip"]}`}
                className="bg-[#0F172A] rounded-md p-3 border border-[#354463]"
              >
                <div className="text-[17px] font-semibold text-white">
                  {p["Retailer"]} — {p["Name"]}
                </div>

                <div className="text-gray-300 text-[14px] leading-tight">
                  {p["Address"]}, {p["City"]}, {p["State"]} {p["Zip"]}
                </div>

                {p["Suppliers"] && (
                  <div className="text-gray-400 text-[13px] mt-1">
                    Suppliers: {p["Suppliers"]}
                  </div>
                )}

                <button
                  onClick={() => onAddToTrip(r)}
                  className="mt-2 w-full rounded-md bg-green-600 hover:bg-green-700 text-white font-semibold py-1"
                >
                  ➕ Add to Trip
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
