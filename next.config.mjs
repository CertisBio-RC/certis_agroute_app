/** @type {import('next').NextConfig} */

const IS_CI = process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";
const BASE = IS_CI ? "/certis_agroute_app" : "";
const ASSET_PREFIX = IS_CI ? "/certis_agroute_app/" : undefined;

const nextConfig = {
  output: "export",              // for GitHub Pages
  basePath: BASE,                // sub-path
  assetPrefix: ASSET_PREFIX,     // make CSS/JS fetch from the sub-path
  trailingSlash: true,           // safer for static export on Pages
  images: { unoptimized: true }, // no remote loader needed on Pages
  experimental: {
    // keep app router defaults happy
  },
};

export default nextConfig;
