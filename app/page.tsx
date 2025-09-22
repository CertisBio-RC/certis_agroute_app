"use client";

import Image from "next/image";
import CertisMap from "../components/CertisMap";

export default function Page() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  return (
    <div className="app-container flex flex-col h-screen">
      {/* Main Content: Sidebar + Map */}
      <div className="flex flex-1">
        {/* Sidebar Column */}
        <aside className="sidebar w-80 bg-gray-900 text-white flex flex-col p-4">
          <Image
            src={`${basePath}/certislogo.png`}
            alt="Certis Biologicals Logo"
            width={180}
            height={60}
            className="mb-4"
          />
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
        <main className="map-container flex-1 flex flex-col">
          <div className="flex-1">
            <CertisMap selectedCategories={[]} />
          </div>
        </main>
      </div>

      {/* Footer: Optimize button (left) + Status summary (right) */}
      <footer className="bg-gray-800 text-white p-3 flex justify-between items-center text-sm">
        <div>
          <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">
            Optimize Trip & Export
          </button>
        </div>
        <div>Status: 0 Kingpins, 0 Agronomy Locations, 0 Retailers</div>
      </footer>
    </div>
  );
}
