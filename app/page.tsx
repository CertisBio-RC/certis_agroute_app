"use client";

import CertisMap from "@/components/CertisMap";

export default function HomePage() {
  return (
    <div className="flex h-screen bg-black text-white">
      {/* Sidebar */}
      <aside className="w-80 bg-gray-900 p-4 flex flex-col space-y-4 overflow-y-auto">
        {/* Logo + Title */}
        <div className="flex flex-col items-center">
          <a href="https://www.certisbio.com" target="_blank" rel="noopener noreferrer">
            <img
              src="/certis_logo.png"
              alt="Certis Biologicals Logo"
              className="h-[150px] object-contain"
            />
          </a>
          <h1 className="text-2xl font-bold mt-2 text-center">Certis AgRoute Planner</h1>
        </div>

        {/* Sidebar Cards */}
        <div className="bg-gray-800 p-4 rounded-lg">Card 1</div>
        <div className="bg-gray-800 p-4 rounded-lg">Card 2</div>
        <div className="bg-gray-800 p-4 rounded-lg">Card 3</div>
        <div className="bg-gray-800 p-4 rounded-lg">Card 4</div>
        <div className="bg-gray-800 p-4 rounded-lg">Card 5</div>
        <div className="bg-gray-800 p-4 rounded-lg">Card 6</div>
        <div className="bg-gray-800 p-4 rounded-lg">Card 7</div>
      </aside>

      {/* Map */}
      <main className="flex-1">
        <CertisMap />
      </main>
    </div>
  );
}
