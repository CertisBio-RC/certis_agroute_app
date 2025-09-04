// /app/layout.tsx
import type { Metadata } from "next";
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
    description:
      "Retailer map & optimized trip builder for Certis.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Certis AgRoute Planner",
    description:
      "Retailer map & optimized trip builder for Certis.",
  },
  icons: { icon: "/favicon.ico" },
  themeColor: "#0ea5e9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900">{children}</body>
    </html>
  );
}
