"use client";

import CertisMap from "@/components/CertisMap";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-80 bg-black text-white flex flex-col p-4 space-y-4 overflow-y-auto">
        {/* Logo + Title */}
        <div className="flex flex-col items-center space-y-2">
          <a href="https://www.certisbio.com" target="_blank" rel="noopener noreferrer">
            <Image
              src="/certislogo.png"
              alt="Certis Logo"
              width={150}
              height={150}
              className="object-contain"
            />
          </a>
          <h1 className="text-2xl font-bold text-center">Certis AgRoute Planner</h1>
        </div>

        {/* 7 Sidebar Cards */}
        <div className="bg-neutral-800 p-4 rounded-lg">Card 1</div>
        <div className="bg-neutral-800 p-4 rounded-lg">Card 2</div>
        <div className="bg-neutral-800 p-4 rounded-lg">Card 3</div>
        <div className="bg-neutral-800 p-4 rounded-lg">Card 4</div>
        <div className="bg-neutral-800 p-4 rounded-lg">Card 5</div>
        <div className="bg-neutral-800 p-4 rounded-lg">Card 6</div>
        <div className="bg-neutral-800 p-4 rounded-lg">Card 7</div>
      </aside>

      {/* Map */}
      <main className="flex-1">
        <CertisMap selectedCategories={[]} selectedSuppliers={[]} />
      </main>
    </div>
  );
}
