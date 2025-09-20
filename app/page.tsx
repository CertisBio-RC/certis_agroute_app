// app/page.tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const CertisMap = dynamic(() => import("../components/CertisMap"), { ssr: false });

export default function Page() {
  const [stops, setStops] = useState<string[]>([]);

  const addStop = (name: string) => {
    setStops((prev) => (prev.includes(name) ? prev : [...prev, name]));
  };

  const removeStop = (name: string) => setStops((prev) => prev.filter((s) => s !== name));
  const clearStops = () => setStops([]);

  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 p-4 bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
      {/* Sidebar */}
      <aside className="space-y-4">
        <section className="p-4 rounded-2xl shadow bg-white dark:bg-neutral-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Selected Stops</h2>
            <button
              onClick={clearStops}
              className="text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600"
            >
              Clear
            </button>
          </div>
          {stops.length === 0 ? (
            <p className="text-sm opacity-70">Click markers on the map to add stops.</p>
          ) : (
            <ul className="space-y-2">
              {stops.map((s) => (
                <li key={s} className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2" title={s}>
                    {s}
                  </span>
                  <button
                    onClick={() => removeStop(s)}
                    className="text-xs px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      {/* Map */}
      <section className="rounded-2xl shadow bg-white dark:bg-neutral-800 p-2">
        <div className="h-[80vh]">
          <CertisMap onAddStop={addStop} />
        </div>
      </section>
    </main>
  );
}
