// scripts/partners-to-geojson.mjs
// Convert data/partners.xlsx (or .xls/.xlsm) into public/data/retailers.geojson.
// If the sheet has Lat/Lng (or Latitude/Longitude), we use them.
// Otherwise we geocode with Mapbox (using MAPBOX_PUBLIC_TOKEN / NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN).
//
// Also uses/updates an optional local cache file: data/geocode-cache.json
// (Not committed by CI, but helps if you run it locally.)

import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

/** Utility: safe read JSON file (returns {} on missing) */
async function readJson(file) {
  try {
    const txt = await fs.readFile(file, "utf8");
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

/** Utility: write JSON pretty */
async function writeJson(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(obj, null, 2), "utf8");
}

/** Coalesce multiple possible column names */
function pick(row, keys) {
  for (const k of keys) {
    if (row && row[k] != null && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  return "";
}

/** Parse a number if present */
function pickNum(row, keys) {
  const v = pick(row, keys);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalize an address string as cache key */
function addrKey({ name, addr1, city, state, zip }) {
  return [name, addr1, city, state, zip].filter(Boolean).join(", ").toLowerCase();
}

/** Geocode using Mapbox (Node 20 has global fetch) */
async function geocode(q, token) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?limit=1&country=US&access_token=${encodeURIComponent(
    token
  )}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Geocode failed (${r.status})`);
  const j = await r.json();
  const f = Array.isArray(j.features) && j.features[0];
  if (!f?.center) throw new Error("No match");
  const [lng, lat] = f.center;
  return { lng: Number(lng), lat: Number(lat) };
}

async function main() {
  const repoRoot = process.cwd();
  const dataDir = path.join(repoRoot, "data");
  const outFile = path.join(repoRoot, "public", "data", "retailers.geojson");
  const cacheFile = path.join(repoRoot, "data", "geocode-cache.json");

  // Find the partners workbook (partners.* under /data)
  const entries = await fs.readdir(dataDir);
  const xlsxName =
    entries.find((n) => /^partners\.(xlsx|xlsm|xls)$/i.test(n)) ||
    entries.find((n) => /^partners/i.test(n) && /\.(xlsx|xlsm|xls)$/i.test(n));
  if (!xlsxName) {
    console.log("⚠ No Excel like data/partners.xlsx found. Skipping conversion.");
    return;
  }

  const wbPath = path.join(dataDir, xlsxName);
  const wb = XLSX.readFile(wbPath);
  const sheetName = wb.SheetNames[0];
  const sh = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sh, { defval: "" });

  const token =
    process.env.MAPBOX_PUBLIC_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN ||
    "";

  if (!token) {
    console.log("⚠ MAPBOX token not present in env. Rows without lat/lng will be skipped.");
  }

  const gc = await readJson(cacheFile); // { [addrKey] : { lat, lng } }
  const features = [];
  let skipped = 0, geocoded = 0, usedCache = 0, usedLatLng = 0;

  for (const row of rows) {
    const retailer = pick(row, ["Retailer", "retailer", "Partner", "partner"]);
    const name     = pick(row, ["Name", "name", "Location", "location"]);
    const city     = pick(row, ["City", "city"]);
    const state    = pick(row, ["State", "state", "ST", "st"]);
    const zip      = pick(row, ["Zip", "ZIP", "zip", "Postal", "postal"]);
    const category = pick(row, ["Category", "category", "Type", "type"]);
    const addr1    = pick(row, ["Address", "address", "Address1", "Street", "street"]);

    let lat = pickNum(row, ["lat", "Lat", "Latitude", "latitude", "LAT"]);
    let lng = pickNum(row, ["lng", "Lng", "Long", "Lon", "Longitude", "longitude", "LNG"]);

    if (lat != null && lng != null) {
      usedLatLng++;
    } else {
      const key = addrKey({ name, addr1, city, state, zip });
      if (key && gc[key]) {
        lat = gc[key].lat;
        lng = gc[key].lng;
        usedCache++;
      } else if (token && key) {
        try {
          const q = [name, addr1, city, state, zip].filter(Boolean).join(", ");
          const pos = await geocode(q, token);
          lat = pos.lat;
          lng = pos.lng;
          gc[key] = { lat, lng };
          geocoded++;
          // polite tiny delay to avoid rapid-fire
          await new Promise((r) => setTimeout(r, 120));
        } catch {
          // skip row if cannot geocode
        }
      }
    }

    if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
      skipped++;
      continue;
    }

    const props = {
      Retailer: retailer,
      Name: name,
      City: city,
      State: state,
      Zip: zip,
      Category: category,
      Address: addr1,
    };

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: props,
    });
  }

  const fc = { type: "FeatureCollection", features };
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(fc), "utf8");

  // update cache on disk (useful if you run locally)
  try { await writeJson(cacheFile, gc); } catch {}

  console.log(`✓ GeoJSON written: ${outFile}`);
  console.log(`  rows: ${rows.length}, features: ${features.length}, skipped: ${skipped}`);
  console.log(`  used lat/lng: ${usedLatLng}, cache: ${usedCache}, geocoded: ${geocoded}`);
}

main().catch((e) => {
  console.error("partners-to-geojson failed:", e?.message || e);
  process.exit(1);
});
