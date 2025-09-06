// /app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Certis AgRoute Planner",
    template: "%s — Certis AgRoute Planner",
  },
  description:
    "Retailer map & optimized trip builder for Certis: filter by state/retailer/category and plan efficient legs (≤12 stops/leg).",
  openGraph: {
    title: "Certis AgRoute Planner",
    description: "Retailer map & optimized trip builder for Certis.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Certis AgRoute Planner",
    description: "Retailer map & optimized trip builder for Certis.",
  },
  // no leading slash so it works on GitHub Pages subpath
  icons: { icon: "favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: "#0ea5e9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Build-time inline token so the client can always read it on GitHub Pages */}
        <meta
          name="mapbox-token"
          content={process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ?? ""}
        />
      </head>
      <body className="bg-white text-gray-900">{children}</body>
    </html>
  );
}
