// utils/token.ts
// Temporary hardcoded Mapbox token for debugging

// TODO: REMOVE after confirming env secret wiring
export const MAPBOX_TOKEN: string =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
  "pk.eyJ1IjoiZG9jamJhaWxleTE5NzEiLCJhIjoiY21ld3lzZTNqMGQwdzJxb2lwNHpjcjNveiJ9.T2O5szdwL-O5nDF9BJmFnw";

if (!MAPBOX_TOKEN || !MAPBOX_TOKEN.startsWith("pk.")) {
  console.error("❌ MAPBOX_TOKEN is missing or invalid.");
  throw new Error("❌ MAPBOX_TOKEN is missing or invalid.");
} else {
  console.log(
    "✅ MAPBOX_TOKEN (hardcoded fallback):",
    MAPBOX_TOKEN.substring(0, 8) + "...(truncated)"
  );
}
