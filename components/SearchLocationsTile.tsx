"use client";

import { useState } from "react";
import { Stop } from "./CertisMap";

type SearchResult = {
  label: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string | number;
  coords: [number, number];

  // Retailer search metadata
  states?: string[];              // <-- plural for multi–state retailers
  totalLocations?: number;        // count of locations under that retailer
};

type Props = {
  onAddStop: (stop: Stop) => void;
};

export default function SearchLocationsTile({ onAddStop }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      console.error("SearchLocationsTile error:", err);
      setResults([]);
    }

    setLoading(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 text-[16px] leading-tight">
      {/* Header */}
      <h2 className="text-[18px] font-bold mb-3 dark:text-yellow-400 text-blue-800">
        Search Locations
      </h2>

      {/* Search Bar */}
      <div className="flex space-x-2 mb-3">
        <input
          type="text"
          value={query}
          placeholder="Retailer, city, or ZIP"
          onChange={(e) => setQuery(e.target.value)}
          className="
            flex-1 p-2 rounded border
            border-gray-300 dark:border-gray-600
            bg-gray-50 dark:bg-gray-700
            text-[16px] text-black dark:text-white
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

      {/* Loading */}
      {loading && (
        <p className="text-[16px] text-gray-500 dark:text-gray-300">
          Searching…
        </p>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-3 mt-2">
          {results.map((item, index) => (
            <div
              key={index}
              className="p-2 rounded bg-gray-200 dark:bg-gray-700"
            >
              {/* Retailer Name */}
              <strong
                className="
                  text-[18px] font-bold block mb-1
                  dark:text-yellow-300 text-blue-800
                "
              >
                {item.label}
              </strong>

              {/* Stacked metadata — states + total locations */}
              {(item.states || item.totalLocations !== undefined) && (
                <div className="text-[16px] text-black dark:text-white">
                  {Array.isArray(item.states)
                    ? item.states.join(", ")
                    : item.state ?? ""}
                  {" • "}
                  {item.totalLocations}{" "}
                  {item.totalLocations === 1 ? "location" : "locations"}
                </div>
              )}

              {/* Address Lines — 16px body font */}
              <div className="text-[16px] text-black dark:text-white mt-1">
                {item.address}
                <br />
                {item.city}, {item.state} {item.zip}
              </div>

              {/* Add Stop */}
              <button
                onClick={() =>
                  onAddStop({
                    label: item.label,
                    address: item.address,
                    coords: item.coords,
                    city: item.city,
                    state: item.state,
                    zip: item.zip,
                  })
                }
                className="
                  mt-2 px-2 py-1 rounded text-sm
                  bg-green-600 hover:bg-green-700
                  text-white
                "
              >
                Add Stop
              </button>
            </div>
          ))}
        </div>
      )}

      {/* No Results */}
      {!loading && results.length === 0 && query.trim() !== "" && (
        <p className="text-[16px] text-gray-500 dark:text-gray-300 mt-2">
          No matches found.
        </p>
      )}
    </div>
  );
}
