/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
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
