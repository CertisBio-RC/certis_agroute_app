// ========================================
// next.config.js — GH Pages Compatibility Fix (Next 15+)
// ========================================

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
  trailingSlash: true,
  distDir: '.next',

  // ✅ Remove basePath; keep only assetPrefix
  assetPrefix: '/certis_agroute_app/',

  // ✅ Critical: manually correct the exportPathMap
  exportPathMap: async function () {
    return {
      '/': { page: '/' },
    };
  },

  env: {
    NEXT_PUBLIC_BASE_PATH: '/certis_agroute_app',
    NEXT_PUBLIC_MAPBOX_TOKEN:
      'pk.eyJ1IjoiY2VydGlzLWJpbyIsImEiOiJjbHVsbXo3cnAwM2NwMmlzN3ljbnRtOXFnIn0.K6c8mTn3bQ_cHleO5TiJfg',
  },
};

export default nextConfig;
