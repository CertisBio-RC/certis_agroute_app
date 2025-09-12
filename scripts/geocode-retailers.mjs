// scripts/geocode-retailers.mjs
// Geocode features with missing geometry using Mapbox Forward Geocoding.
// Usage (PowerShell):  node scripts/geocode-retailers.mjs
import fs from "fs/promises";
import path from "path";
import process from "process";

const token =
  process.env.MAPBOX_PUBLIC_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN;

if (!token) {
  console.log("No MAPBOX_PUBLIC_TOKEN in env; cannot geocode.");
  process.exit(1);
}

const dataFile = path.resolve(process.cwd(), "public", "data", "retailers.geojson");

const validLngLat = (c) =>
  Array.isArray(c) &&
  c.length === 2 &&
  Number.isFinite(c[0]) &&
  Number.isFinite(c[1]) &&
  c[0] >= -180 &&
  c[0] <= 180 &&
  c[1] >= -90 &&
  c[1] <= 90;

const addr = (p = {}) =>
  `${p.Address || ""}, ${p.City || ""}, ${p.State || ""} ${p.Zip || ""}, USA`
    .replace(/\s+/g, " ")
    .trim();

async function geocodeOne(q) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    q
  )}.json?access_token=${token}&limit=1&autocomplete=false&country=US`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const f = j?.features?.[0];
  return f?.center && validLngLat(f.center) ? [f.center[0], f.center[1]] : null;
}

(async () => {
  const raw = await fs.readFile(dataFile, "utf8");
  const fc = JSON.parse(raw);
  if (fc?.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    throw new Error("retailers.geojson is not a valid FeatureCollection");
  }

  let already = 0, updated = 0, skipped = 0;
  const cache = new Map();

  for (const f of fc.features) {
    const g = f?.geometry;
    if (g && g.type === "Point" && validLngLat(g.coordinates)) {
      already++; continue;
    }
    const q = addr(f?.properties);
    if (!q) { skipped++; continue; }

    const key = q.toLowerCase();
    let center = cache.get(key);
    if (!center) {
      center = await geocodeOne(q);
      await new Promise((res) => setTimeout(res, 125)); // ~8 req/s
      cache.set(key, center);
    }
    if (center) {
      f.geometry = { type: "Point", coordinates: center };
      updated++;
    } else {
      skipped++;
    }
  }

  await fs.writeFile(dataFile, JSON.stringify(fc));
  console.log(`Geocode complete → already:${already} updated:${updated} skipped:${skipped}`);
})();
