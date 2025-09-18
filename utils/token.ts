// utils/token.ts
// Centralized Mapbox token helper

export const MAPBOX_TOKEN: string =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

if (!MAPBOX_TOKEN || !MAPBOX_TOKEN.startsWith("pk.")) {
  console.error("❌ MAPBOX_TOKEN is missing or invalid.");
  throw new Error(
    "❌ MAPBOX_TOKEN is missing or invalid. Check NEXT_PUBLIC_MAPBOX_TOKEN in your environment."
  );
} else {
  // Only log the first few characters for safety
  console.log(
    "✅ MAPBOX_TOKEN loaded:",
    MAPBOX_TOKEN.substring(0, 8) + "...(truncated)"
  );
}
