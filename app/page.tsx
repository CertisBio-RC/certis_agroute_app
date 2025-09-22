"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useState } from "react";

const CertisMap = dynamic(() => import("../components/CertisMap"), {
  ssr: false,
});

export default function Page() {
  const [selectedCards, setSelectedCards] = useState<string[]>([]);

  const toggleCard = (card: string) => {
    setSelectedCards((prev) =>
      prev.includes(card) ? prev.filter((c) => c !== card) : [...prev, card]
    );
  };

  const clearAll = () => setSelectedCards([]);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white p-4 flex flex-col">
        <div className="flex items-center space-x-2 mb-6">
          <Image
            src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/certislogo.png`}
            alt="Certis Logo"
            width={40}
            height={40}
            priority
          />
          <h1 className="text-lg font-bold">Certis AgRoute Planner</h1>
        </div>

        <button
          onClick={clearAll}
          className="mb-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded"
        >
          Clear All
        </button>

        <div className="space-y-2">
          {["Card 1", "Card 2", "Card 3", "Card 4", "Card 5", "Card 6", "Card 7"].map(
            (card) => (
              <button
                key={card}
                onClick={() => toggleCard(card)}
                className={`w-full text-left px-3 py-2 rounded ${
                  selectedCards.includes(card)
                    ? "bg-blue-500 text-white"
                    : "bg-slate-800 hover:bg-slate-700"
                }`}
              >
                {card}
              </button>
            )
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <CertisMap selectedCategories={selectedCards} />
      </div>
    </div>
  );
}
