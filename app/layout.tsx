export const metadata = {
  title: "Certis AgRoute Planner",
  description:
    "Filter retailers and plan optimized trips. Double-click map to set Home. Click a point to add stop.",
};

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* globals.css is imported here so Tailwind styles load */}
      <head />
      <body className="bg-[#0B0F14] text-slate-100 antialiased">
        <header className="sticky top-0 z-50 bg-[#0B0F14]/95 border-b border-slate-800">
          <div className="mx-auto max-w-[1800px] px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Use base path so the logo resolves locally and on Pages */}
              <img
                src={`${BASE_PATH}/certis-logo.png`}
                alt="Certis Biologicals"
                className="h-10 w-auto select-none"
                draggable={false}
              />
            </div>

            {/* Right-aligned “Reset Map” as requested */}
            <nav className="flex items-center gap-3">
              <a
                href={`${BASE_PATH}/`}
                className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Reset Map
              </a>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-[1800px] px-4 py-4">{children}</main>
      </body>
    </html>
  );
}

import "./globals.css";
