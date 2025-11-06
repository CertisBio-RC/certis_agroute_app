// app/layout.tsx
// ========================================
// 📦 Global Imports
// ========================================
import "./globals.css";
import "mapbox-gl/dist/mapbox-gl.css";  // ✅ Mapbox GL styles
import type { Metadata } from "next";

// ========================================
// 📝 Metadata
// ========================================
export const metadata: Metadata = {
  title: "Certis AgRoute Planner",
  description: "Plan retailer routes with filters, home ZIP, and KINGPIN visibility.",
};

// ========================================
// 🏗️ Root Layout
// ========================================
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
