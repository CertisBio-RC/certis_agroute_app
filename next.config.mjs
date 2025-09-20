/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for GitHub Pages static export
  output: "export",

  // Match your repo path for correct asset resolution
  basePath: "/certis_agroute_app",
  assetPrefix: "/certis_agroute_app/",

  // Ensure Next <Image> doesn’t break in static export
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
