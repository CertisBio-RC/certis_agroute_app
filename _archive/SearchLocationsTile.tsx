"use client";

import { useState, useEffect, useMemo } from "react";
import type { Stop } from "@/components/CertisMap";

interface SearchLocationsTileProps {
  onAddStop?: (stop: Stop) => void;
}

const norm = (v: any) => (v ?? "").toString().trim().toLowerCase();
const cleanAddress = (addr: string): string =>
  (addr || "").replace(/\(.*?\)/g, "").replace(/\bP\.?O\.?\s*Box\b.*$/i, "").trim();

interface GeoFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    Retailer?: string;
    Name?: string;
    Address?: string;
    City?: string;
    State?: string;
    Zip?: string | number;
    DisplayCategory?: string;
    Suppliers?: any;
  };
}

export default function SearchLocationsTile({ onAddStop }: SearchLocationsTileProps) {
  const [allSites, setAllSites] = useState<GeoFeature[]>([]);
  const [query, setQuery] = useState("");

  // -----------------------------
  // Load retailers.geojson
  // -----------------------------
  useEffect(() => {
    const path = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/data/retailers.geojson`;

    fetch(path)
      .then((r) => r.json())
      .then((json) => {
        const valid = (json?.features || []).filter((f: any) => {
          const c = f?.geometry?.coordinates;
          return Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]);
        });
        setAllSites(valid);
      })
      .catch((err) => console.error("SearchLocationsTile load error:", err));
  }, []);

  // -----------------------------
  // Compute results (fuzzy match)
  // -----------------------------
  const results = useMemo(() => {
    if (!query) return [];

    const q = norm(query);
    return allSites
      .filter((f) => {
        const p = f.properties || {};
        const haystack =
          [
            p.Retailer,
            p.Name,
            p.Address,
            p.City,
            p.State,
            p.Zip,
          ]
            .map(norm)
            .join(" ");

        return haystack.includes(q);
      })
      .slice(0, 30); // cap for UI cleanliness
  }, [query, allSites]);

  // -----------------------------
  // Add To Trip Builder
  // -----------------------------
  const handleAdd = (f: GeoFeature) => {
    if (!onAddStop) return;

    const p = f.properties || {};
    const coords = f.geometry?.coordinates || null;

    if (!coords) return;

    onAddStop({
      label: p.Retailer || p.Name || "Unknown",
      address: cleanAddress(p.Address || ""),
      coords,
      city: p.City || "",
      state: p.State || "",
      zip: p.Zip || "",
    });
  };

  // ----------------------------------------------------
  // UI
  // ----------------------------------------------------
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4">
      <h2 className="text-lg font-bold mb-3">Search Locations</h2>

      {/* Search Box */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by retailer, city, address..."
        className="w-full p-2 mb-3 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm"
      />

      {/* Results */}
      {query && results.length === 0 && (
        <p className="text-sm text-gray-500">No matching locations...</p>
      )}

      {results.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-3 text-sm">
          {results.map((f, idx) => {
            const p = f.properties || {};
            return (
              <div
                key={idx}
                className="border border-gray-300 dark:border-gray-600 rounded p-2 bg-gray-50 dark:bg-gray-700"
              >
                <div className="font-semibold text-gray-900 dark:text-gray-200">
                  {p.Retailer || "Unknown Retailer"}
                </div>
                <div className="text-xs text-gray-700 dark:text-gray-300">
                  {p.Name || ""}
                </div>
                <div className="text-xs">
                  {cleanAddress(p.Address || "")}
                  <br />
                  {p.City || ""}, {p.State || ""} {p.Zip || ""}
                </div>

                <button
                  onClick={() => handleAdd(f)}
                  className="mt-2 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                >
                  + Add to Trip
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
