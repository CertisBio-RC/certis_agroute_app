// next.config.mjs
/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  output: "export",
  basePath: isProd ? "/certis_agroute_app" : "",
  assetPrefix: isProd ? "/certis_agroute_app/" : "",

  env: {
    NEXT_PUBLIC_BASE_PATH: isProd ? "/certis_agroute_app" : "",
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  },
};

export default nextConfig;
