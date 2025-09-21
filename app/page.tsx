"use client";

import CertisMap from "../components/CertisMap";

export default function HomePage() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-72 bg-black text-white flex flex-col p-4 space-y-4">
        {/* Logo (150px, clickable) */}
        <a
          href="https://www.certisbio.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="/certislogo.png"
            alt="Certis Biologicals Logo"
            className="w-[150px] mx-auto"
          />
        </a>

        {/* Title */}
        <h1 className="text-xl font-bold text-center">
          Certis AgRoute Planner
        </h1>

        {/* Sidebar cards (7 placeholders) */}
        <div className="space-y-2">
          <div className="p-2 bg-neutral-900 rounded">Card 1</div>
          <div className="p-2 bg-neutral-900 rounded">Card 2</div>
          <div className="p-2 bg-neutral-900 rounded">Card 3</div>
          <div className="p-2 bg-neutral-900 rounded">Card 4</div>
          <div className="p-2 bg-neutral-900 rounded">Card 5</div>
          <div className="p-2 bg-neutral-900 rounded">Card 6</div>
          <div className="p-2 bg-neutral-900 rounded">Card 7</div>
        </div>
      </aside>

      {/* Map */}
      <main className="flex-1">
        <CertisMap />
      </main>
    </div>
  );
}
