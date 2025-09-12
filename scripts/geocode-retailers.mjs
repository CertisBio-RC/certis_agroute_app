// scripts/geocode-retailers.mjs
// Geocode retailers with missing geometry using Mapbox Forward Geocoding.
// Requires: Node 20+ (built-in fetch), MAPBOX_PUBLIC_TOKEN in env.
// Usage: node scripts/geocode-retailers.mjs

import fs from "fs/promises";
import path from "path";
import process from "process";

const token =
  process.env.MAPBOX_PUBLIC_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN;

if (!token) {
  console.log("No MAPBOX_PUBLIC_TOKEN in env; skipping geocode.");
  process.exit(0);
}

const dataFile = path.resolve(process.cwd(), "public", "data", "retailers.geojson");

function validLngLat(coords) {
  return (
    Array.isArray(coords) &&
    coords.length === 2 &&
    Number.isFinite(coords[0]) &&
    Number.isFinite(coords[1]) &&
    coords[0] >= -180 &&
    coords[0] <= 180 &&
    coords[1] >= -90 &&
    coords[1] <= 90
  );
}

function addrStr(props = {}) {
  const a = props.Address || "";
  const city = props.City || "";
  const st = props.State || "";
  const zip = props.Zip || "";
  return `${a}, ${city}, ${st} ${zip}, USA`.replace(/\s+/g, " ").trim();
}

async function geocodeOne(q) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    q
  )}.json?access_token=${token}&limit=1&autocomplete=false&country=US`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const f = j?.features?.[0];
  if (!f?.center || !validLngLat(f.center)) return null;
  return [f.center[0], f.center[1]];
}

(async () => {
  const raw = await fs.readFile(dataFile, "utf8");
  const json = JSON.parse(raw);
  if (!json || json.type !== "FeatureCollection" || !Array.isArray(json.features)) {
    throw new Error("retailers.geojson is not a valid FeatureCollection");
  }

  let already = 0,
    updated = 0,
    skipped = 0;
  const cache = new Map();

  for (const f of json.features) {
    const geom = f?.geometry;
    if (geom && geom.type === "Point" && validLngLat(geom.coordinates)) {
      already++;
      continue;
    }

    const q = addrStr(f?.properties);
    if (!q) {
      skipped++;
      continue;
    }

    const key = q.toLowerCase();
    let center = cache.get(key);
    if (!center) {
      center = await geocodeOne(q);
      // simple rate-limit to ~8 req/s
      await new Promise((res) => setTimeout(res, 125));
      cache.set(key, center);
    }

    if (center) {
      f.geometry = { type: "Point", coordinates: center };
      updated++;
    } else {
      skipped++;
    }
  }

  await fs.writeFile(dataFile, JSON.stringify(json));
  console.log(
    `Geocode complete. Already had: ${already}, updated: ${updated}, skipped: ${skipped}. File written: ${dataFile}`
  );
})();
