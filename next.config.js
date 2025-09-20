/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for GH Pages
  output: 'export',

  // Required for Next.js images in GH Pages
  images: { unoptimized: true },

  // GitHub Pages subdirectory
  basePath: '/certis_agroute_app',
  assetPrefix: '/certis_agroute_app/',
  trailingSlash: true,

  reactStrictMode: true,

  // Make sure this is available on client + server
  env: {
    NEXT_PUBLIC_BASE_PATH: '/certis_agroute_app'
  }
};

module.exports = nextConfig;
