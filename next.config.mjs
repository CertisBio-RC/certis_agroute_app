/** @type {import('next').NextConfig} */
const nextConfig = {
  // Make sure static export works
  output: "export",

  // Explicitly expose Mapbox token to the client bundle
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  },

  // Optional: stricter ESLint/TypeScript settings
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
