// Build public/data/retailers.geojson from data/retailers.xlsx.
// - Reads the first sheet
// - Expected columns (case-insensitive): Retailer, Name, Category, State, Address, City, Zip
// - Optional columns: Lat, Lon (if present, used directly)
// - Otherwise geocodes with Mapbox Forward Geocoding (needs MAPBOX_PUBLIC_TOKEN)
//
// Usage:
//   MAPBOX_PUBLIC_TOKEN=pk_xxx node scripts/build-retailers.mjs

import path from "path";
import fs from "fs/promises";
import * as fsNode from "fs";
import process from "process";
import * as XLSX from "xlsx/xlsx.mjs";
XLSX.set_fs(fsNode);

const ROOT = process.cwd();
const SRC_XLSX = path.resolve(ROOT, "data", "retailers.xlsx"); // <— canonical
const OUT_GEOJSON = path.resolve(ROOT, "public", "data", "retailers.geojson");

const token =
  process.env.MAPBOX_PUBLIC_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN;

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
  if (!token) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    q
  )}.json?access_token=${token}&limit=1&autocomplete=false&country=US`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const f = j?.features?.[0];
  return f?.center && validLngLat(f.center) ? [f.center[0], f.center[1]] : null;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] != null) out[k] = obj[k];
  return out;
}

function canonKey(s) {
  return String(s || "").toLowerCase().trim();
}

(async () => {
  if (!fsNode.existsSync(SRC_XLSX)) {
    console.error(`Source spreadsheet not found: ${SRC_XLSX}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(SRC_XLSX);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  const wantKeys = ["Retailer", "Name", "Category", "State", "Address", "City", "Zip"];
  const optionalCoords = ["Lat", "Latitude", "LAT", "Lon", "Longitude", "LON", "Long"];

  let updated = 0,
    usedDirect = 0,
    skipped = 0;

  const features = [];
  const geoCache = new Map();

  for (const row of rows) {
    // remap headers in a case-insensitive way
    const map = {};
    for (const [k, v] of Object.entries(row)) map[canonKey(k)] = v;

    const props = {
      Retailer: map["retailer"] ?? "",
      Name: map["name"] ?? "",
      Category: map["category"] ?? "",
      State: map["state"] ?? "",
      Address: map["address"] ?? "",
      City: map["city"] ?? "",
      Zip: map["zip"] ?? "",
    };

    // Try direct coordinates first
    let lat =
      Number(map["lat"]) ||
      Number(map["latitude"]) ||
      Number(map["Lat"]) ||
      Number(map["Latitude"]);
    let lon =
      Number(map["lon"]) ||
      Number(map["longitude"]) ||
      Number(map["Lon"]) ||
      Number(map["Longitude"]);

    let coords = null;
    if (Number.isFinite(lat) && Number.isFinite(lon) && validLngLat([lon, lat])) {
      coords = [lon, lat];
      usedDirect++;
    } else {
      const q = addrFrom(props);
      if (q) {
        const key = q.toLowerCase();
        coords = geoCache.get(key);
        if (!coords) {
          coords = await geocodeOne(q);
          await sleep(125); // ~8 req/s
          geoCache.set(key, coords);
          if (coords) updated++;
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
      properties: pick(props, wantKeys),
    });
  }

  const fc = { type: "FeatureCollection", features };
  await fs.mkdir(path.dirname(OUT_GEOJSON), { recursive: true });
  await fs.writeFile(OUT_GEOJSON, JSON.stringify(fc));
  console.log(
    `Wrote ${features.length} features to ${OUT_GEOJSON} (direct:${usedDirect}, geocoded:${updated}, skipped:${skipped})`
  );
})();
