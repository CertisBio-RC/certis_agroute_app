"use client";

import { useState } from "react";
import CertisMap from "../components/CertisMap";

export default function Page() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    "Kingpin",
    "Retailer",
    "Distributor",
  ]);
  const [stops, setStops] = useState<
    { name: string; lat: number; lng: number }[]
  >([]);

  const addStop = (stop: { name: string; lat: number; lng: number }) => {
    setStops((prev) => [...prev, stop]);
  };

  return (
    <main className="min-h-screen bg-neutral-100 dark:bg-neutral-900 p-4">
      <header className="flex items-center space-x-4 mb-4">
        {/* Certis Logo */}
        <a
          href="https://www.certisbio.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="/certis-logo.png"
            alt="Certis Logo"
            className="h-12 w-auto"
          />
        </a>
        <h1 className="text-3xl font-bold text-black dark:text-white">
          Certis AgRoute Planner
        </h1>
      </header>

      <section className="rounded-2xl shadow bg-white dark:bg-neutral-800 p-2">
        <div className="h-[70vh]">
          <CertisMap
            selectedCategories={selectedCategories}
            onAddStop={addStop}
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-bold text-black dark:text-white mb-2">
          Trip Stops
        </h2>
        {stops.length === 0 ? (
          <p className="text-neutral-600 dark:text-neutral-400">
            Click a location on the map to add it here.
          </p>
        ) : (
          <ul className="space-y-2">
            {stops.map((stop, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between rounded bg-neutral-200 dark:bg-neutral-700 p-2"
              >
                <span className="text-black dark:text-white">{stop.name}</span>
                <div className="space-x-2">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 underline"
                  >
                    Google Maps
                  </a>
                  <a
                    href={`http://maps.apple.com/?daddr=${stop.lat},${stop.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 underline"
                  >
                    Apple Maps
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
