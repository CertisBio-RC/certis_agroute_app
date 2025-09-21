// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // ✅ required for Next.js 15 static export
  images: {
    unoptimized: true, // ✅ makes next/image work with gh-pages
  },
  experimental: {
    typedRoutes: true,
  },
};

module.exports = nextConfig;
