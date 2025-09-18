"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

type Stop = {
  id: number;
  name: string;
  coordinates: [number, number];
};

export default function CertisMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Load saved basemap from localStorage (default = Hybrid)
  const [basemap, setBasemap] = useState(
    () => localStorage.getItem("basemap") || "mapbox://styles/mapbox/satellite-streets-v12"
  );

  const [stops, setStops] = useState<Stop[]>([
    { id: 1, name: "Debug Stop - Map Loaded", coordinates: [0, 0] },
  ]);

  // Initialize map
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: basemap,
        center: [-96, 41.5], // Nebraska/Iowa region
        zoom: 4,
      });

      mapRef.current.on("load", () => {
        console.log("✅ Map loaded with basemap:", basemap);
      });
    }
  }, []);

  // Update map style when basemap changes
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setStyle(basemap);
      console.log("🔄 Basemap updated:", basemap);
    }
    localStorage.setItem("basemap", basemap);
  }, [basemap]);

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      {/* Sidebar */}
      <div className="w-72 p-4 space-y-6 bg-muted/30 border-r border-border">
        <h1 className="text-xl font-bold">Certis AgRoute Planner</h1>
        <p className="text-sm text-muted-foreground">Plan retailer visits with ease</p>

        {/* Basemap Selector */}
        <div>
          <label className="block text-sm font-semibold mb-2">Basemap</label>
          <select
            value={basemap}
            onChange={(e) => setBasemap(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring focus:ring-primary"
          >
            <option value="mapbox://styles/mapbox/satellite-streets-v12">Hybrid</option>
            <option value="mapbox://styles/mapbox/streets-v12">Streets</option>
            <option value="mapbox://styles/mapbox/outdoors-v12">Outdoors</option>
          </select>
        </div>

        {/* Filters */}
        <div>
          <h2 className="text-md font-bold mb-2">Filter by Category</h2>
          <div className="space-y-1 text-sm">
            <label className="flex items-center space-x-2">
              <input type="checkbox" className="form-checkbox" /> <span>Retailer</span>
            </label>
            <label className="flex items-center space-x-2">
              <input type="checkbox" className="form-checkbox" /> <span>Dealer</span>
            </label>
            <label className="flex items-center space-x-2">
              <input type="checkbox" className="form-checkbox" /> <span>Supplier</span>
            </label>
            <label className="flex items-center space-x-2">
              <input type="checkbox" className="form-checkbox" /> <span>Distributor</span>
            </label>
            <label className="flex items-center space-x-2">
              <input type="checkbox" className="form-checkbox" /> <span>Other</span>
            </label>
          </div>
        </div>

        {/* Trip Builder */}
        <div>
          <h2 className="text-md font-bold mb-2">Trip Builder</h2>
          <ul className="list-disc list-inside text-sm space-y-1">
            {stops.map((stop) => (
              <li key={stop.id}>{stop.name}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Map container */}
      <div ref={mapContainerRef} className="flex-1" />
    </div>
  );
}
