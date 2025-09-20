"use client";

import { useState } from "react";
import CertisMap from "../components/CertisMap";

export default function Page() {
  const [stops, setStops] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const addStop = (name: string) => {
    setStops((prev) => [...prev, name]);
  };

  return (
    <main className="min-h-screen p-4 bg-gray-100 dark:bg-neutral-900">
      <h1 className="text-2xl font-bold mb-4 text-black dark:text-white">
        Certis AgRoute Planner
      </h1>

      <section className="rounded-2xl shadow bg-white dark:bg-neutral-800 p-2">
        <div className="h-[80vh]">
          {/* ✅ FIXED: pass selectedCategories into CertisMap */}
          <CertisMap
            selectedCategories={selectedCategories}
            onAddStop={addStop}
          />
        </div>
      </section>

      <section className="mt-4 p-4 rounded-2xl shadow bg-white dark:bg-neutral-800">
        <h2 className="text-lg font-semibold mb-2 text-black dark:text-white">
          Planned Stops
        </h2>
        {stops.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">
            No stops selected yet. Click a retailer on the map to add one.
          </p>
        ) : (
          <ul className="list-disc pl-5 text-black dark:text-white">
            {stops.map((stop, idx) => (
              <li key={idx}>{stop}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
