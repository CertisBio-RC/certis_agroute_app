// next.config.mjs
const repo = process.env.NEXT_PUBLIC_REPO_NAME || "certis_agroute_app";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // GitHub Pages needs a static export
  output: "export",

  // Make sure all paths are under /certis_agroute_app
  basePath: `/${repo}`,
  assetPrefix: `/${repo}/`,

  // Disable Next image optimization (GitHub Pages doesn’t support it)
  images: { unoptimized: true },

  // Recommended: ensures /foo/ maps to /foo/index.html on Pages
  trailingSlash: true,
};

export default nextConfig;
