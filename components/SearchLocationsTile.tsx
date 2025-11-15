"use client";

import { useState, useEffect } from "react";
import { Stop } from "./CertisMap";

type Props = {
  onAddStop: (stop: Stop) => void;
};

export default function SearchLocationsTile({ onAddStop }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Stop[]>([]);
  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(false);

  // 🔥 Load GeoJSON ONCE at runtime (no import)
  useEffect(() => {
    fetch("/data/retailers.geojson")
      .then((res) => res.json())
      .then((geo) => {
        const parsed: Stop[] = geo.features.map((f: any) => ({
          label: f.properties["Retailer"],
          address: f.properties["Address"],
          city: f.properties["City"],
          state: f.properties["State"],
          zip: f.properties["Zip"],
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
        }));
        setAllStops(parsed);
      })
      .catch((err) => console.error("SearchLocationsTile load error:", err));
  }, []);

  const handleSearch = () => {
    if (!query.trim()) return;
    setLoading(true);

    const q = query.toLowerCase();
    const filtered = allStops.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.state.toLowerCase().includes(q) ||
        s.zip.toLowerCase().includes(q)
    );

    setResults(filtered);
    setLoading(false);
  };

  return (
    <div className="space-y-3 p-4 bg-[#162035] rounded-xl border border-[#2d3b57] select-none">
      <div className="text-[20px] font-bold text-yellow-400">
        Search Locations
      </div>

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
          className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[16px]"
        >
          Search
        </button>
      </div>

      {loading && (
        <div className="text-[16px] text-gray-300">Searching…</div>
      )}

      {!loading && results.length > 0 && (
        <div className="max-h-56 overflow-y-auto space-y-3 pr-1">
          {results.map((item, idx) => (
            <div
              key={idx}
              className="p-2 rounded bg-[#1f2b45] border border-[#2d3b57]"
            >
              <div className="text-[18px] font-bold text-yellow-300 mb-1">
                {item.label}
              </div>

              <div className="text-[16px] text-gray-200 leading-tight">
                {item.address}
                <br />
                {item.city}, {item.state} {item.zip}
              </div>

              <button
                onClick={() => onAddStop(item)}
                className="mt-2 px-2 py-1 rounded text-[14px] bg-green-600 hover:bg-green-700 text-white"
              >
                Add to Trip
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && query.trim() !== "" && results.length === 0 && (
        <div className="text-[16px] text-gray-300">No matches found.</div>
      )}
    </div>
  );
}
