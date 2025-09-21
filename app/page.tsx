"use client";

import Image from "next/image";
import CertisMap from "../components/CertisMap";

export default function Page() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header with Certis logo */}
      <header className="p-4 border-b bg-white shadow-sm">
        <a
          href="https://www.certisbio.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            src="/certis-logo.png"
            alt="Certis Biologicals Logo"
            width={180}
            height={40}
            priority
          />
        </a>
      </header>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
        {/* Left: Sidebar with 5 placeholder cards */}
        <aside className="p-4 bg-gray-100 overflow-y-auto">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl shadow p-6 min-h-[100px] flex items-center justify-center text-gray-500"
              >
                Placeholder Card {i + 1}
              </div>
            ))}
          </div>
        </aside>

        {/* Right: Map */}
        <div className="h-[100vh]">
          <CertisMap />
        </div>
      </div>
    </main>
  );
}
