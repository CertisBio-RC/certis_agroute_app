// next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  distDir: "out",
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  },
};

export default nextConfig;
