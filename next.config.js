// ========================================
// next.config.js — Phase A.31 Finalized GH Pages Static Export
// ========================================

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
  trailingSlash: true,
  distDir: '.next',

  // ✅ Required for GitHub Pages deployment
  basePath: '/certis_agroute_app',
  assetPrefix: '/certis_agroute_app/',

  // ✅ Ensure Next.js rewrites all internal asset URLs correctly
  compiler: {
    removeConsole: false,
  },

  env: {
    NEXT_PUBLIC_BASE_PATH: '/certis_agroute_app',
    NEXT_PUBLIC_MAPBOX_TOKEN:
      'pk.eyJ1IjoiY2VydGlzLWJpbyIsImEiOiJjbHVsbXo3cnAwM2NwMmlzN3ljbnRtOXFnIn0.K6c8mTn3bQ_cHleO5TiJfg',
  },
};

export default nextConfig;
