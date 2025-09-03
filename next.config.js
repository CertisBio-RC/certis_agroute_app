/** @type {import('next').NextConfig} */
const repo = process.env.NEXT_PUBLIC_REPO_NAME || "certis_agroute_app";
module.exports = {
  output: "export",
  basePath: `/${repo}`,
  assetPrefix: `/${repo}/`,
};
