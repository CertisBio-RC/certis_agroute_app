/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",         // required for static export
  distDir: "out",
  basePath: "/certis_agroute_app",
  assetPrefix: "/certis_agroute_app/",
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  },
};

export default nextConfig;
