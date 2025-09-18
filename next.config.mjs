/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  distDir: "out",
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN:
      process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
      "pk.eyJ1IjoiZG9jamJhaWxleTE5NzEiLCJhIjoiY21ld3lzZTNqMGQwdzJxb2lwNHpjcjNveiJ9.T2O5szdwL-O5nDF9BJmFnw",
  },
};

module.exports = nextConfig;
