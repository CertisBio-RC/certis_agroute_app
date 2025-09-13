/** @type {import('next').NextConfig} */

const IS_CI = process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";

// Use ONLY basePath for GitHub Pages.
// assetPrefix can conflict on static export and produce `/_next/...` links.
const BASE = IS_CI ? "/certis_agroute_app" : "";

const nextConfig = {
  output: "export",
  basePath: BASE,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
