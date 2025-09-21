// app/page.tsx
"use client";

import CertisMap from "@/components/CertisMap";

export default function Page() {
  return (
    <main className="flex flex-col min-h-screen">
      <div className="flex flex-row flex-1">
        {/* Left panel: filters or controls (placeholder for now) */}
        <div className="w-1/4 bg-gray-100 p-4">
          <h2 className="font-bold text-lg mb-2">Filters</h2>
          <p className="text-sm text-gray-600">
            Add category and supplier filters here.
          </p>
        </div>

        {/* Right panel: map */}
        <div className="flex-1 h-[100vh]">
          <CertisMap selectedCategories={[]} />
        </div>
      </div>
    </main>
  );
}
