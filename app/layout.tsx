// Import Tailwind once at the root so styles always apply
import "./globals.css";

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
      <head />
      <body className="bg-[#0B0F14] text-slate-100 antialiased">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-[#0B0F14]/95 border-b border-slate-800">
          <div className="mx-auto max-w-[1800px] px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Keep the logo sane even if Tailwind failed to load */}
              <img
                src={`${BASE_PATH}/certis-logo.png`}
                alt="Certis Biologicals"
                className="h-10 w-auto select-none"
                style={{ maxHeight: 44, height: "44px", width: "auto" }}
                draggable={false}
              />
            </div>

            {/* Right-aligned as requested */}
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

        {/* Content */}
        <main className="mx-auto max-w-[1800px] px-4 py-4">{children}</main>
      </body>
    </html>
  );
}
