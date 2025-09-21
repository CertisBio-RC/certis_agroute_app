"use client";

import { useState } from "react";
import CertisMap from "../components/CertisMap";
import Image from "next/image";

export default function HomePage() {
  // Sidebar state (placeholders for now)
  const [homeZip, setHomeZip] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedRetailer, setSelectedRetailer] = useState("");
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [tripStops, setTripStops] = useState<string[]>([]);

  // Clear all filters
  const clearAll = () => {
    setHomeZip("");
    setSelectedState("");
    setSelectedCategories([]);
    setSelectedRetailer("");
    setSelectedSuppliers([]);
    setTripStops([]);
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Card 1: Logo + Title + Clear All */}
        <div className="sidebar-card sidebar-logo flex flex-col items-center">
          <a
            href="https://www.certisbio.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              src="/certis-logo.png"
              alt="Certis Biologicals"
              width={150}
              height={60}
              className="mb-2"
            />
          </a>
          <h1 className="text-lg font-bold mb-2">Certis AgRoute Planner</h1>
          <button className="btn btn-secondary" onClick={clearAll}>
            Clear All
          </button>
        </div>

        {/* Card 2: Home Zip Code */}
        <div className="sidebar-card">
          <h2>Home Zip Code</h2>
          <input
            type="text"
            placeholder="Enter Zip"
            value={homeZip}
            onChange={(e) => setHomeZip(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-2 py-1"
          />
        </div>

        {/* Card 3: State Filter */}
        <div className="sidebar-card">
          <h2>State</h2>
          <p className="text-sm text-gray-500">[Filter UI coming soon]</p>
        </div>

        {/* Card 4: Category Filter */}
        <div className="sidebar-card">
          <h2>Category</h2>
          <p className="text-sm text-gray-500">[Filter UI coming soon]</p>
        </div>

        {/* Card 5: Retailer Filter */}
        <div className="sidebar-card">
          <h2>Retailer</h2>
          <p className="text-sm text-gray-500">[Filter UI coming soon]</p>
        </div>

        {/* Card 6: Supplier Filter */}
        <div className="sidebar-card">
          <h2>Supplier</h2>
          <p className="text-sm text-gray-500">[Filter UI coming soon]</p>
        </div>

        {/* Card 7: Trip Builder */}
        <div className="sidebar-card">
          <h2>Trip Builder</h2>
          <p className="text-sm text-gray-500">[Stops will appear here]</p>
          <button className="btn btn-primary mt-2">
            Optimize & Export Route
          </button>
        </div>
      </aside>

      {/* Map */}
      <main className="map-container">
        <CertisMap
          selectedCategories={selectedCategories}
          selectedSuppliers={selectedSuppliers}
        />
      </main>
    </div>
  );
}
