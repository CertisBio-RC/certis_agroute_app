import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Certis AgRoute Planner',
  description: 'Filter retailers and plan optimized trips.',
};

export const viewport: Viewport = {
  themeColor: '#0b0f13',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0b0f13] text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
