// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Certis AgRoute Planner",
  description: "Filter retailers and plan optimized trips.",
};

const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH ??
  (typeof window !== "undefined" && (window as any).__NEXT_ROUTER_BASEPATH__) ??
  "";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Single header/logo (avoid duplicates elsewhere) */}
        <header className="site-header">
          <img
            src={`${BASE_PATH}/certis-logo.png`}
            alt="Certis Biologicals"
            className="brand-logo"
            loading="eager"
            decoding="async"
          />
          <nav className="header-nav">
            <button id="reset-map-btn" className="btn">Reset Map</button>
          </nav>
        </header>

        <main>{children}</main>
      </body>
    </html>
  );
}
