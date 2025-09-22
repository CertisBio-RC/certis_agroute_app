"use client";

import Image from "next/image";
import CertisMap from "../components/CertisMap";

export default function Page() {
  return (
    <div className="app-container flex flex-col h-screen">
      {/* Main two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Column */}
        <aside className="sidebar w-80 bg-gray-900 text-white flex flex-col p-4">
          <Image
            src="/certis_agroute_app/certislogo.png"
            alt="Certis Logo"
            width={150}
            height={60}
            unoptimized
            className="mb-4"
          />
          <h1 className="text-xl font-bold mb-4">Certis AgRoute Planner</h1>

          <button className="mb-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
            Clear All
          </button>

          <div className="flex-1 overflow-y-auto">
            <div className="card bg-gray-800 p-2 mb-2 rounded">Card 1</div>
            <div className="card bg-gray-800 p-2 mb-2 rounded">Card 2</div>
            <div className="card bg-gray-800 p-2 mb-2 rounded">Card 3</div>
            <div className="card bg-gray-800 p-2 mb-2 rounded">Card 4</div>
            <div className="card bg-gray-800 p-2 mb-2 rounded">Card 5</div>
            <div className="card bg-gray-800 p-2 mb-2 rounded">Card 6</div>
            <div className="card bg-gray-800 p-2 mb-2 rounded">Card 7</div>
          </div>
        </aside>

        {/* Map Column */}
        <main className="map-container flex-1 h-full">
          <CertisMap selectedCategories={[]} />
        </main>
      </div>

      {/* Footer Status Bar */}
      <footer className="flex h-16 bg-gray-800 text-white">
        {/* Left footer: Optimize trip button */}
        <div className="flex items-center justify-center w-1/2 border-r border-gray-700">
          <button className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded">
            Optimize Trip & Export
          </button>
        </div>

        {/* Right footer: Status summary */}
        <div className="flex items-center justify-center w-1/2">
          <p className="text-sm">
            Status: <span className="font-bold">0 Kingpins</span>,{" "}
            <span className="font-bold">0 Agronomy Locations</span>,{" "}
            <span className="font-bold">0 Retailers</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
