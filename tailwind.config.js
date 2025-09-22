/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",       // ✅ app router
    "./pages/**/*.{js,ts,jsx,tsx}",     // ✅ legacy pages (sometimes needed)
    "./components/**/*.{js,ts,jsx,tsx}",// ✅ components
    "./utils/**/*.{js,ts,jsx,tsx}",     // ✅ utilities/helpers
  ],
  theme: {
    extend: {},
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
  ],
  plugins: [],
};
