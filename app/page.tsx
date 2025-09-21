"use client";

import { useState } from "react";
import CertisMap, { Stop } from "../components/CertisMap";

export default function HomePage() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);

  const addStop = (stop: Stop) => {
    setStops((prev) => [...prev, stop]);
  };

  return (
    <main className="flex flex-col h-screen">
      <header className="p-4 bg-green-700 text-white text-xl font-bold">
        Certis AgRoute Planner
      </header>

      <section className="flex flex-1">
        <div className="w-2/3">
          <CertisMap
            selectedCategories={selectedCategories}
            onAddStop={addStop}
          />
        </div>

        <aside className="w-1/3 p-4 bg-gray-50 border-l overflow-y-auto">
          <h2 className="text-lg font-semibold mb-2">Stops</h2>
          {stops.length === 0 && (
            <p className="text-sm text-gray-600">Click a marker on the map to add a stop.</p>
          )}
          <ul className="space-y-3">
            {stops.map((stop, idx) => (
              <li key={idx} className="border p-2 rounded bg-white shadow-sm">
                <div className="font-bold">{stop.name}</div>
                <div className="text-xs text-gray-600">
                  {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                </div>
                <div className="flex gap-2 mt-1">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline text-xs"
                  >
                    Google Maps
                  </a>
                  <a
                    href={`http://maps.apple.com/?daddr=${stop.lat},${stop.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline text-xs"
                  >
                    Apple Maps
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </section>
    </main>
  );
}
