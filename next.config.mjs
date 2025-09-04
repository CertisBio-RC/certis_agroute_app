/** @type {import('next').NextConfig} */
const repo = process.env.NEXT_PUBLIC_REPO_NAME || "certis_agroute_app";

export default {
  output: "export",
  basePath: `/${repo}`,
  assetPrefix: `/${repo}/`,
};
