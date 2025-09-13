/** @type {import('next').NextConfig} */
const isCI = process.env.GITHUB_ACTIONS === 'true';
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || (isCI ? '/certis_agroute_app' : '');

export default {
  output: 'export', // we deploy to GitHub Pages as a static site
  basePath: BASE_PATH || undefined,
  assetPrefix: BASE_PATH ? `${BASE_PATH}/` : undefined,
  images: { unoptimized: true }, // Pages CDN can’t optimize
  trailingSlash: true,
  reactStrictMode: true,
};
