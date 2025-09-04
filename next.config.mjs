/** @type {import('next').NextConfig} */
const repo = 'certis_agroute_app';

const nextConfig = {
  // Static export for GitHub Pages
  output: 'export',

  // Ensure all routes and assets work under /certis_agroute_app/
  basePath: `/${repo}`,
  assetPrefix: `/${repo}/`,

  // Optional: if you use images with next/image, this avoids broken loaders on GH Pages
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
