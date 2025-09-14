// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Certis AgRoute Planner",
  description:
    "Filter retailers and plan optimized trips. Double-click map to set Home. Click a point to add a stop.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // No header logo here. The Certis mark is rendered INSIDE the map frame
  // (components/CertisMap.tsx) so it always works with GitHub Pages basePath
  // and never interferes with map interactions.
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
