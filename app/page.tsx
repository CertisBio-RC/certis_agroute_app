// app/page.tsx
"use client";

import React, { useCallback, useMemo, useState } from "react";
import CertisMap from "@/components/CertisMap";
import { withBasePath } from "@/utils/paths";

type Stop = { id: string; name: string; lon: number; lat: number };

export default function Page() {
  const [zip, setZip] = useState("");
  const [styleMode, setStyleMode] = useState<"hybrid" | "street">("hybrid");
  const [roundTrip, setRoundTrip] = useState(true);
  const [stops, setStops] = useState<Stop[]>([]);

  const onAddStop = useCallback((s: Stop) => {
    setStops((prev) => (prev.find(p => p.id === s.id) ? prev : [...prev, s]));
  }, []);

  const clearStops = useCallback(() => setStops([]), []);
  const undoStop = useCallback(() => setStops((prev) => prev.slice(0, -1)), []);

  // Simple route builders (placeholders preserved from your utilities)
  const routeLinks = useMemo(() => {
    if (stops.length < 2) return { google: "", apple: "", waze: "" };

    const coords = stops.map(s => `${s.lat},${s.lon}`);
    const origin = coords[0];
    const destination = roundTrip ? coords[0] : coords[coords.length - 1];
    const waypoints = roundTrip ? coords.slice(1, -1).join("|") : coords.slice(1, -1).join("|");

    const google = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}`;
    const apple = `https://maps.apple.com/?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(destination)}${waypoints ? `&dirflg=d&addr=${encodeURIComponent(waypoints)}` : ""}`;
    const waze  = `https://waze.com/ul?ll=${encodeURIComponent(destination)}&from=${encodeURIComponent(origin)}`;

    return { google, apple, waze };
  }, [stops, roundTrip]);

  return (
    <main className="h-screen grid grid-cols-[320px_1fr] gap-4 p-2">
      {/* Sidebar */}
      <aside className="sticky top-2 self-start h-[calc(100vh-1rem)] overflow-auto px-3 py-2 rounded-lg bg-[#0c1624] border border-[#1b2a41]">
        {/* Logo */}
        <div className="flex items-center h-8 mb-3">
          <img
            src={withBasePath("certis_logo_small.png")}
            alt="CERTIS"
            className="h-6 w-auto"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        </div>

        {/* Home ZIP */}
        <div className="mb-4">
          <div className="text-lg font-semibold mb-1">Home (ZIP)</div>
          <div className="flex gap-2">
            <input
              className="px-2 py-1 rounded bg-[#0b1220] border border-[#1c2a3a] outline-none"
              placeholder="e.g., 50309"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
            <button
              className="px-2 py-1 rounded bg-[#1e40af] hover:bg-[#1b3a9a] text-white"
              onClick={() => {/* reserved for geocode-to-home later */}}
            >
              Set
            </button>
          </div>
        </div>

        {/* Map Style */}
        <div className="mb-4">
          <div className="text-lg font-semibold mb-1">Map Style</div>
          <div className="flex flex-col gap-1">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="style"
                checked={styleMode === "hybrid"}
                onChange={() => setStyleMode("hybrid")}
              />
              Hybrid
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="style"
                checked={styleMode === "street"}
                onChange={() => setStyleMode("street")}
              />
              Street
            </label>
          </div>
        </div>

        {/* (Legend lives here; kept minimal to honor your existing UI) */}
        <div className="mb-4">
          <div className="text-lg font-semibold mb-1">Location Types</div>
          <ul className="space-y-1 text-sm opacity-90">
            <li>🟢 Agronomy</li>
            <li>🟢 Agronomy/Grain</li>
            <li>🟣 Distribution</li>
            <li>🔵 Grain</li>
            <li>🟢 Grain/Feed</li>
            <li>🔴 Kingpin</li>
            <li>🟡 Office/Service</li>
          </ul>
        </div>

        {/* Trip Builder */}
        <div className="mb-2">
          <div className="text-lg font-semibold mb-1">Trip Builder</div>
          <div className="text-xs mb-2 opacity-80">Hover to preview, click to add a stop.</div>

          <label className="inline-flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={roundTrip}
              onChange={(e) => setRoundTrip(e.target.checked)}
            />
            Round trip
          </label>

          <div className="space-y-1 mb-2">
            {stops.map((s, i) => (
              <div key={s.id} className="text-sm truncate">
                {i + 1}. {s.name}
              </div>
            ))}
            {stops.length === 0 && (
              <div className="text-sm opacity-70">No stops yet.</div>
            )}
          </div>

          <div className="flex gap-2">
            <button className="px-2 py-1 rounded bg-[#374151] text-white" onClick={undoStop} disabled={stops.length === 0}>Undo</button>
            <button className="px-2 py-1 rounded bg-[#6b7280] text-white" onClick={clearStops} disabled={stops.length === 0}>Clear</button>
          </div>

          {/* Route links */}
          <div className="mt-3 flex flex-col gap-1 text-sm">
            <a className={`link ${routeLinks.google ? "" : "pointer-events-none opacity-40"}`} href={routeLinks.google || "#"} target="_blank" rel="noreferrer">Open in Google Maps</a>
            <a className={`link ${routeLinks.apple ? "" : "pointer-events-none opacity-40"}`} href={routeLinks.apple || "#"} target="_blank" rel="noreferrer">Open in Apple Maps</a>
            <a className={`link ${routeLinks.waze ? "" : "pointer-events-none opacity-40"}`} href={routeLinks.waze || "#"} target="_blank" rel="noreferrer">Open in Waze</a>
          </div>
        </div>
      </aside>

      {/* Map */}
      <section className="rounded-lg overflow-hidden border border-[#1b2a41]">
        <CertisMap styleMode={styleMode} onAddStop={onAddStop} />
      </section>
    </main>
  );
}
