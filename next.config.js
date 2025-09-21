// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // ✅ static export for GitHub Pages
  images: {
    unoptimized: true, // ✅ so next/image works without optimization server
  },
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig; // ✅ ESM export
