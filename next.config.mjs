/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",               // Single static export
  basePath: "/certis_agroute_app",
  assetPrefix: "/certis_agroute_app/",
  trailingSlash: true,
  images: { unoptimized: true }
};

export default nextConfig;
