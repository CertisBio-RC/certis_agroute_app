const repo = process.env.NEXT_PUBLIC_REPO_NAME || "certis_agroute_app";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: `/${repo}`,
  assetPrefix: `/${repo}/`,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  },
};

export default nextConfig;
