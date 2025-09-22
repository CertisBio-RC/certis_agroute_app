/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // we EXTEND instead of replace, so defaults (like bg-gray-800) stay available
    },
  },
  safelist: [
    "page-shell",
    "sidebar",
    "brand",
    "brand-meta",
    "panel",
    "radio-row",
    "radio",
    "bullets",
    "content",
    "content-inner",
    "map-card",
    "map-frame",
    "map-canvas",
    "map-overlay",
    // explicitly safelist the ones failing
    "bg-gray-800",
    "bg-gray-900",
    "text-white",
  ],
  plugins: [],
};
