/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a static site in /out (replaces "next export" in Next 15)
  output: "export",

  // GH Pages doesn't support Next Image Optimization
  images: { unoptimized: true },

  // Your site is under this subpath on GitHub Pages
  basePath: "/certis_agroute_app",
  assetPrefix: "/certis_agroute_app/",

  // Safer routing for GH Pages
  trailingSlash: true,

  reactStrictMode: true
};

module.exports = nextConfig;
