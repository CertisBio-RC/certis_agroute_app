/** @type {import('next').NextConfig} */
const repo = 'certis_agroute_app';

const nextConfig = {
  // Static export for GitHub Pages
  output: 'export',

  // Serve the app under /certis_agroute_app on GitHub Pages
  basePath: `/${repo}`,
  assetPrefix: `/${repo}/`,

  // Next/Image has no optimizer on GH Pages
  images: { unoptimized: true },

  // Helpful in case something still references process.env on client
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
