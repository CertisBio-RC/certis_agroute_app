/** @type {import("next").NextConfig} */
const isGH = process.env.GITHUB_PAGES === "true";
const repo = "certis_agroute_app";

export default {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isGH ? `/${repo}` : "",
  assetPrefix: isGH ? `/${repo}/` : "",
};
