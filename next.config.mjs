/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ Required for GitHub Pages (subfolder hosting)
  output: "export",
  basePath: "/certis_agroute_app",
  assetPrefix: "/certis_agroute_app/",

  // ✅ Expose env vars to client-side
  env: {
    NEXT_PUBLIC_BASE_PATH: "/certis_agroute_app",
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  },
};

export default nextConfig;
