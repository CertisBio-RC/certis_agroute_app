// Build public/data/retailers.geojson from data/retailers.xlsx (CommonJS version).
// - Uses direct Lat/Lon if present (case-insensitive).
// - Otherwise geocodes via Mapbox (needs MAPBOX_PUBLIC_TOKEN).
// Usage: node scripts/build-retailers.cjs

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const XLSX = require("xlsx");

const ROOT = process.cwd();
const SRC_XLSX = path.resolve(ROOT, "data", "retailers.xlsx"); // <- canonical source
const OUT_GEOJSON = path.resolve(ROOT, "public", "data", "retailers.geojson");

const TOKEN =
  process.env.MAPBOX_PUBLIC_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  "";

// Node 18+ has global fetch; if not, you’d need node-fetch. We assume Node >=18.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const validLngLat = (c) =>
  Array.isArray(c) &&
  c.length === 2 &&
  Number.isFinite(c[0]) &&
  Number.isFinite(c[1]) &&
  c[0] >= -180 &&
  c[0] <= 180 &&
  c[1] >= -90 &&
  c[1] <= 90;

const addrFrom = (p = {}) =>
  `${p.Address || ""}, ${p.City || ""}, ${p.State || ""} ${p.Zip || ""}, USA`
    .replace(/\s+/g, " ")
    .trim();

async function geocodeOne(q) {
  if (!TOKEN) return null; // no token -> skip geocoding
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    q
  )}.json?access_token=${TOKEN}&limit=1&autocomplete=false&country=US`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const f = j?.features?.[0];
    return f?.center && validLngLat(f.center) ? [f.center[0], f.center[1]] : null;
  } catch {
    return null;
  }
}

function toLowerMap(row) {
  const m = {};
  for (const [k, v] of Object.entries(row)) m[String(k).toLowerCase()] = v;
  return m;
}

(async () => {
  if (!fs.existsSync(SRC_XLSX)) {
    console.error(`Missing spreadsheet: ${SRC_XLSX}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(SRC_XLSX);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  const features = [];
  const cache = new Map();
  let usedDirect = 0,
    geocoded = 0,
    skipped = 0;

  for (const row of rows) {
    const m = toLowerMap(row);
    const props = {
      Retailer: m["retailer"] ?? "",
      Name: m["name"] ?? "",
      Category: m["category"] ?? "",
      State: m["state"] ?? "",
      Address: m["address"] ?? "",
      City: m["city"] ?? "",
      Zip: m["zip"] ?? "",
    };

    // Try direct coordinates first (any common header names)
    let lat =
      Number(m["lat"]) ||
      Number(m["latitude"]) ||
      Number(m["y"]);
    let lon =
      Number(m["lon"]) ||
      Number(m["longitude"]) ||
      Number(m["long"]) ||
      Number(m["x"]);

    let coords = null;
    if (Number.isFinite(lat) && Number.isFinite(lon) && validLngLat([lon, lat])) {
      coords = [lon, lat];
      usedDirect++;
    } else {
      const q = addrFrom(props);
      if (q) {
        const key = q.toLowerCase();
        coords = cache.get(key);
        if (!coords) {
          coords = await geocodeOne(q);
          // be nice to the API (~8 req/s)
          await sleep(125);
          cache.set(key, coords);
          if (coords) geocoded++;
        }
      }
    }

    if (!coords) {
      skipped++;
      continue;
    }

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coords },
      properties: props,
    });
  }

  const fc = { type: "FeatureCollection", features };
  await fsp.mkdir(path.dirname(OUT_GEOJSON), { recursive: true });
  await fsp.writeFile(OUT_GEOJSON, JSON.stringify(fc));

  console.log(
    `Wrote ${features.length} features → ${OUT_GEOJSON} (direct:${usedDirect}, geocoded:${geocoded}, skipped:${skipped})`
  );
  if (!TOKEN) {
    console.log(
      "Note: MAPBOX_PUBLIC_TOKEN was not set; only rows with Lat/Lon could be included."
    );
  }
})();
