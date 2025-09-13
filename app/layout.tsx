// app/layout.tsx
import './globals.css';

export const metadata = {
  title: 'Certis AgRoute Planner',
  description: 'Filter retailers and plan optimized trips',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-[#0b0f14] text-slate-100 antialiased">
        {/* Header */}
        <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#0b0f14]/90 backdrop-blur">
          <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 h-14 flex items-center">
            <a href="/" className="flex items-center gap-3">
              <img
                src="/certis-logo.png"
                alt="Certis Biologicals"
                className="h-8 w-auto object-contain"
              />
            </a>
            <div className="ml-auto">
              <a
                href="/certis_agroute_app/"
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium hover:bg-white/10"
              >
                Reset Map
              </a>
            </div>
          </div>
        </header>

        {/* App shell */}
        <main className="app-shell">
          {children}
        </main>
      </body>
    </html>
  );
}
