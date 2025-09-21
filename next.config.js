// next.config.js
/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  // Force static export for GitHub Pages
  output: "export",

  // GitHub Pages needs a basePath and assetPrefix
  basePath: isProd ? "/certis_agroute_app" : "",
  assetPrefix: isProd ? "/certis_agroute_app/" : "",

  // Ensure trailing slash so relative links resolve correctly
  trailingSlash: true,

  // Allow images like certis-logo.png to work with next/image
  images: {
    unoptimized: true,
  },

  // Keep Next.js strict mode enabled
  reactStrictMode: true,
};

export default nextConfig;
