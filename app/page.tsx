"use client";

import CertisMap from "../components/CertisMap";

export default function HomePage() {
  return (
    <div className="flex h-screen bg-black text-white">
      {/* Sidebar */}
      <aside className="w-80 p-4 space-y-4 overflow-y-auto border-r border-gray-700">
        {/* Card 1: Logo */}
        <div className="bg-gray-900 p-4 rounded-lg shadow">
          <a href="https://www.certisbio.com" target="_blank" rel="noopener noreferrer">
            <img
              src="/certis_logo.png"
              alt="Certis Biologicals Logo"
              className="w-[150px] mx-auto"
            />
          </a>
        </div>

        {/* Card 2–7: Placeholders */}
        <div className="bg-gray-900 p-4 rounded-lg shadow">Card 2</div>
        <div className="bg-gray-900 p-4 rounded-lg shadow">Card 3</div>
        <div className="bg-gray-900 p-4 rounded-lg shadow">Card 4</div>
        <div className="bg-gray-900 p-4 rounded-lg shadow">Card 5</div>
        <div className="bg-gray-900 p-4 rounded-lg shadow">Card 6</div>
        <div className="bg-gray-900 p-4 rounded-lg shadow">Card 7</div>
      </aside>

      {/* Map */}
      <main className="flex-1">
        <CertisMap />
      </main>
    </div>
  );
}
