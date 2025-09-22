"use client";

import Image from "next/image";
import CertisMap from "../components/CertisMap";

export default function Page() {
  return (
    <div className="app-container flex h-screen">
      {/* Sidebar Column */}
      <aside className="sidebar w-80 bg-gray-900 text-white flex flex-col p-4">
        <Image
          src="/certis_agroute_app/certislogo.png"
          alt="Certis Logo"
          width={150}
          height={50}
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

      {/* Map Column with Footer */}
      <main className="map-container flex flex-col flex-1">
        {/* Map fills all space above footer */}
        <div className="flex-1">
          <CertisMap selectedCategories={[]} />
        </div>

        {/* Footer Section */}
        <footer className="bg-gray-900 text-white flex justify-between items-center p-3">
          <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">
            Optimize Trip & Export
          </button>
          <div className="text-sm">
            Status: 0 Kingpins, 0 Agronomy Locations, 0 Retailers
          </div>
        </footer>
      </main>
    </div>
  );
}
