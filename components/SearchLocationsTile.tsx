"use client";

import { useState } from "react";
import { Stop } from "./CertisMap";

type Props = {
  onAddStop: (stop: Stop) => void;
};

// ---------------------------------------------------------------
// 🔍 GOLD BASELINE SEARCH TILE — STATIC MATCHING ONLY
//   • No zoom to search results
//   • Used ONLY to quickly add stops to Trip Builder
//   • Pulls from map Stops array (injected by parent)
// ---------------------------------------------------------------

export default function SearchLocationsTile({ onAddStop }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(false);

  // -----------------------------------------------
  // 🚦 Search Handler
  // -----------------------------------------------
  const handleSearch = async () => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setResults([]);
      return;
    }

    setLoading(true);

    try {
      // Parent supplies window.__AGROUTE_STOPS array via page.tsx
      const globalStops = (window as any).__AGROUTE_STOPS as Stop[] || [];

      const filtered = globalStops.filter((s) => {
        return (
          s.label.toLowerCase().includes(q) ||
          s.address.toLowerCase().includes(q) ||
          s.city.toLowerCase().includes(q) ||
          s.state.toLowerCase().includes(q) ||
          // 🔥 FIXED — ZIP can be a number → convert to string first
          `${s.zip}`.toLowerCase().includes(q)
        );
      });

      setResults(filtered);
    } catch (err) {
      console.error("SearchLocationsTile error:", err);
      setResults([]);
    }

    setLoading(false);
  };

  // -----------------------------------------------
  // 🧱 UI
  // -----------------------------------------------
  return (
    <div className="space-y-3 p-4 bg-[#162035] rounded-xl border border-[#2d3b57] select-none">
      {/* ---- Header ---- */}
      <div className="text-[20px] font-bold text-yellow-400">Search Locations</div>

      {/* ---- Search Bar ---- */}
      <div className="flex space-x-2">
        <input
          type="text"
          value={query}
          placeholder="Retailer, city, or ZIP"
          onChange={(e) => setQuery(e.target.value)}
          className="
            flex-1 p-2 rounded
            bg-[#0f1625] text-white text-[16px]
            border border-[#2d3b57] focus:border-blue-400
            placeholder-gray-400
          "
        />
        <button
          onClick={handleSearch}
          className="
            px-3 py-1 rounded
            bg-blue-600 hover:bg-blue-700
            text-white text-[16px]
          "
        >
          Search
        </button>
      </div>

      {/* ---- Loading ---- */}
      {loading && (
        <div className="text-[16px] text-gray-300">Searching…</div>
      )}

      {/* ---- Results ---- */}
      {!loading && results.length > 0 && (
        <div className="max-h-56 overflow-y-auto space-y-3 pr-1">
          {results.map((item, index) => (
            <div
              key={index}
              className="p-2 rounded bg-[#1f2b45] border border-[#2d3b57]"
            >
              {/* Retailer */}
              <div className="text-[18px] font-bold text-yellow-300 mb-1">
                {item.label}
              </div>

              {/* Address */}
              <div className="text-[16px] text-gray-200 leading-tight">
                {item.address}
                <br />
                {item.city}, {item.state} {item.zip}
              </div>

              {/* Add to Trip Button */}
              <button
                onClick={() => onAddStop(item)}
                className="
                  mt-2 px-2 py-1 rounded text-[14px]
                  bg-green-600 hover:bg-green-700 text-white
                "
              >
                Add to Trip
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ---- No Results ---- */}
      {!loading && query.trim() !== "" && results.length === 0 && (
        <div className="text-[16px] text-gray-300">No matches found.</div>
      )}
    </div>
  );
}
