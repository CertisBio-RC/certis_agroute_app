"use client";

import { useEffect, useState } from "react";
import CertisMap from "../components/CertisMap";
import retailersData from "../public/retailers.geojson";

export default function HomePage() {
  const [retailers, setRetailers] = useState<any[]>([]);

  useEffect(() => {
    if (retailersData && retailersData.features) {
      setRetailers(retailersData.features);
    }
  }, []);

  return (
    <main className="flex h-screen">
      {/* Sidebar */}
      <div className="w-80 bg-gray-100 dark:bg-gray-900 p-4 overflow-y-auto flex flex-col space-y-4">
        {/* Card 1: Logo + Title + Clear All */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex flex-col items-center">
          <a
            href="https://www.certisbio.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="/ymslogo3.png"
              alt="Certis Logo"
              width={150}
              height={150}
              className="mb-2"
            />
          </a>
          <h1 className="text-lg font-bold text-center">Certis AgRoute Planner</h1>
          <button className="mt-2 bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded">
            Clear All
          </button>
        </div>

        {/* Card 2: Home Zip */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
          <label className="block text-sm font-medium mb-1">Home Zip Code</label>
          <input
            type="text"
            placeholder="Enter Zip"
            className="w-full border rounded p-2"
          />
        </div>

        {/* Card 3: State */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
          <label className="block text-sm font-medium mb-1">State</label>
          <select className="w-full border rounded p-2">
            <option value="">All States</option>
            {/* TODO: populate unique states dynamically */}
          </select>
        </div>

        {/* Card 4: Category */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
          <label className="block text-sm font-medium mb-1">Category</label>
          <select className="w-full border rounded p-2">
            <option value="">All Categories</option>
            <option value="Agronomy">Agronomy</option>
            <option value="Grain">Grain</option>
            <option value="Agronomy/Grain">Agronomy/Grain</option>
            <option value="Office/Service">Office/Service</option>
            <option value="Kingpin">Kingpin</option>
          </select>
        </div>

        {/* Card 5: Retailer */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
          <label className="block text-sm font-medium mb-1">Retailer</label>
          <input
            type="text"
            placeholder="Search Retailer"
            className="w-full border rounded p-2"
          />
        </div>

        {/* Card 6: Supplier */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
          <label className="block text-sm font-medium mb-1">Supplier</label>
          <select className="w-full border rounded p-2">
            <option value="">All Suppliers</option>
            {/* TODO: populate dynamically from data */}
          </select>
        </div>

        {/* Card 7: Trip Builder */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex flex-col space-y-2">
          <h2 className="text-sm font-medium">Trip Builder</h2>
          <div className="text-xs text-gray-500">
            Waypoints will appear here when selected.
          </div>
          <button className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded">
            Optimize Trip
          </button>
          <button className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded">
            Send to Maps
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
        <CertisMap retailers={retailers} />
      </div>
    </main>
  );
}
