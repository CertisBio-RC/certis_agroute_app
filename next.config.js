/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/certis_agroute_app",
  assetPrefix: "/certis_agroute_app/",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
