// next.config.js

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for GitHub Pages (static HTML export)
  output: "export",

  // Your site is served under /certis_agroute_app
  basePath: "/certis_agroute_app",

  // Ensures all URLs have trailing slashes for consistent routing
  trailingSlash: true,

  // Disable Next.js image optimization (not supported with static export)
  images: {
    unoptimized: true,
  },

  // Optional but recommended: catch build-time basePath issues
  assetPrefix: "/certis_agroute_app/",
};

export default nextConfig;
