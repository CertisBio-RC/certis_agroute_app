// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Certis AgRoute Planner",
  description: "Filter retailers and plan optimized trips.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // NOTE: This is a Server Component; no client JS here.
  // Only one header is rendered from this file to avoid duplication.
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="brand">
            <img
              className="brand-logo"
              // Put your correct logo path in /public (e.g., /logo-certis.png)
              src="/logo-certis.png"
              alt="Certis Biologicals"
            />
          </div>
          {/* "Reset Map" lives on the page (client) so it can actually reset state */}
        </header>
        {children}
      </body>
    </html>
  );
}
