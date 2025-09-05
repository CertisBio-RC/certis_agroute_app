// scripts/partners-to-geojson.mjs
// Converts data/partners.xlsx (or .xls/.xlsm) → public/data/retailers.geojson
// If a row has Latitude/Longitude we use them; otherwise we geocode with Mapbox.
// Uses/updates data/geocode-cache.json to avoid re-geocoding the same address.

import fs from "node:fs/promises";
import path from "node:path";
// IMPORTANT: use the ESM module and read() instead of readFile()
import * as XLSX from "xlsx/xlsx.mjs";

/** ---- utilities ---- */
async function readJson(file) {
  try {
    const txt = await fs.readFile(file, "utf8");
    return JSON.parse(txt);
  } catch {
    return {};
  }
}
async function writeJson(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(obj, null, 2), "utf8");
}
function pick(row, keys) {
  for (const k of keys) {
    if (row && row[k] != null && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  return "";
}
function pickNum(row, keys) {
  const v = pick(row, keys);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function addrKey({ name, addr1, city, state, zip }) {
  return [name, addr1, city, state, zip].filter(Boolean).join(", ").toLowerCase();
}
async function geocode(q, token) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    q
  )}.json?limit=1&country=US&access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Geocode failed (${r.status})`);
  const j = await r.json();
  const f = Array.isArray(j.features) && j.features[0];
  if (!f?.center) throw new Error("No match");
  const [lng, lat] = f.center;
  return { lng: Number(lng), lat: Number(lat) };
}

/** ---- main ---- */
async function main() {
  const repoRoot = process.cwd();
  const dataDir = path.join(repoRoot, "data");
  const outFile = path.join(repoRoot, "public", "data", "retailers.geojson");
  const cacheFile = path.join(repoRoot, "data", "geocode-cache.json");

  // find partners workbook
  const entries = await fs.readdir(dataDir);
  const xlsxName =
    entries.find((n) => /^partners\.(xlsx|xlsm|xls)$/i.test(n)) ||
    entries.find((n) => /^partners/i.test(n) && /\.(xlsx|xlsm|xls)$/i.test(n));
  if (!xlsxName) {
    console.log("⚠ No Excel like data/partners.xlsx found. Skipping conversion.");
    return;
  }
  const wbPath = path.join(dataDir, xlsxName);

  // READ using Buffer + XLSX.read (works in ESM)
  const buf = await fs.readFile(wbPath);
  const wb = XLSX.read(buf, { type: "buffer" });
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

  const gc = await readJson(cacheFile); // cache map
  const features = [];
  let skipped = 0,
    geocoded = 0,
    usedCache = 0,
    usedLatLng = 0;

  for (const row of rows) {
    const retailer = pick(row, ["Retailer", "retailer", "Partner", "partner"]);
    const name = pick(row, ["Name", "name", "Location", "location"]);
    const city = pick(row, ["City", "city"]);
    const state = pick(row, ["State", "state", "ST", "st"]);
    const zip = pick(row, ["Zip", "ZIP", "zip", "Postal", "postal"]);
    const category = pick(row, ["Category", "category", "Type", "type"]);
    const addr1 = pick(row, ["Address", "address", "Address1", "Street", "street"]);

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
          await new Promise((r) => setTimeout(r, 120)); // be polite
        } catch {
          // no-op; will skip below
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

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify({ type: "FeatureCollection", features }), "utf8");
  try {
    await writeJson(cacheFile, gc);
  } catch {}

  console.log(`✓ GeoJSON written: ${outFile}`);
  console.log(`  rows: ${rows.length}, features: ${features.length}, skipped: ${skipped}`);
  console.log(`  used lat/lng: ${usedLatLng}, cache: ${usedCache}, geocoded: ${geocoded}`);
}

main().catch((e) => {
  console.error("partners-to-geojson failed:", e?.message || e);
  process.exit(1);
});
