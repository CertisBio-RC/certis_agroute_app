// next.config.mjs

const repo = process.env.NEXT_PUBLIC_REPO_NAME || "certis_agroute_app";
const isCI = !!process.env.GITHUB_ACTIONS || !!process.env.CI;

const basePath = isCI ? `/${repo}` : (process.env.NEXT_PUBLIC_BASE_PATH || "");
const assetPrefix = isCI
  ? `/${repo}/`
  : (process.env.NEXT_PUBLIC_BASE_PATH
      ? `${process.env.NEXT_PUBLIC_BASE_PATH.replace(/\/?$/, "/")}`
      : "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath,
  assetPrefix,
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath || "",
  },
};

export default nextConfig;
