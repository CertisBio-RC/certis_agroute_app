// app/page.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import CertisMap from "@/components/CertisMap";

export default function Page() {
  const [stops, setStops] = useState<string[]>([]);
  const [selectedCategories] = useState<string[]>([]);

  const addStop = (name: string) => {
    setStops((prev) => [...prev, name]);
  };

  return (
    <main className="flex min-h-screen flex-col p-4 gap-4 bg-gray-50 dark:bg-neutral-900">
      {/* Header with Certis logo */}
      <header className="flex justify-between items-center bg-white dark:bg-neutral-800 rounded-xl shadow p-4">
        <a
          href="https://www.certisbio.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            src="/certis-logo.png"
            alt="Certis Logo"
            width={140}
            height={50}
            priority
          />
        </a>
        <h1 className="text-xl font-bold text-neutral-800 dark:text-neutral-100">
          Certis AgRoute Planner
        </h1>
      </header>

      {/* Map */}
      <section className="rounded-2xl shadow bg-white dark:bg-neutral-800 p-2">
        <div className="h-[80vh]">
          <CertisMap
            selectedCategories={selectedCategories}
            onAddStop={addStop}
          />
        </div>
      </section>

      {/* Sidebar / stop list */}
      <aside className="rounded-2xl shadow bg-white dark:bg-neutral-800 p-4">
        <h2 className="text-lg font-semibold mb-2 text-neutral-900 dark:text-neutral-100">
          Trip Stops
        </h2>
        {stops.length === 0 ? (
          <p className="text-neutral-600 dark:text-neutral-300">
            Click a location on the map to add it here.
          </p>
        ) : (
          <ul className="space-y-2">
            {stops.map((stop, idx) => {
              const gmap = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                stop
              )}`;
              const amap = `http://maps.apple.com/?q=${encodeURIComponent(stop)}`;
              return (
                <li
                  key={idx}
                  className={`flex flex-col rounded-lg p-2 ${
                    idx === 0
                      ? "bg-yellow-100 dark:bg-yellow-800 border-2 border-yellow-400"
                      : "bg-neutral-100 dark:bg-neutral-700"
                  }`}
                >
                  <span className="font-medium text-neutral-800 dark:text-neutral-100">
                    {stop}
                  </span>
                  <div className="flex gap-3 text-sm">
                    <a
                      href={gmap}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 underline"
                    >
                      Google Maps
                    </a>
                    <a
                      href={amap}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 dark:text-green-400 underline"
                    >
                      Apple Maps
                    </a>
                  </div>
                  {idx === 0 && (
                    <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 mt-1">
                      Kingpin (Primary Stop)
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </main>
  );
}
