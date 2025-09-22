"use client";

import Image from "next/image";
import CertisMap from "../components/CertisMap";

export default function Page() {
  return (
    <div className="app-container grid grid-rows-[1fr_auto] h-screen">
      {/* Main Content Row */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="sidebar w-80 bg-gray-900 text-white flex flex-col p-4">
          <div className="logo">
            <Image
              src="/certislogo.png"
              alt="Certis Biologicals Logo"
              width={180}
              height={60}
              priority
            />
          </div>
          <h1 className="text-xl font-bold mb-4">Certis AgRoute Planner</h1>
          <button className="mb-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
            Clear All
          </button>
          <div className="flex-1 overflow-y-auto">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="card bg-gray-800 p-2 mb-2 rounded"
              >{`Card ${i + 1}`}</div>
            ))}
          </div>
        </aside>

        {/* Map Column */}
        <main className="map-container flex-1 h-full">
          <CertisMap selectedCategories={[]} />
        </main>
      </div>

      {/* Footer Row */}
      <footer className="footer">
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
          Optimize Trip & Export
        </button>
        <div>Status: 0 Kingpins, 0 Agronomy Locations, 0 Retailers</div>
      </footer>
    </div>
  );
}
