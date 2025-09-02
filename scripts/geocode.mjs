import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import xlsx from "xlsx";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN;
if (!MAPBOX_TOKEN) {
  console.error("Missing Mapbox token in env (NEXT_PUBLIC_MAPBOX_TOKEN or MAPBOX_TOKEN).");
  process.exit(1);
}

const EXCEL_PATH = path.resolve("data/partners.xlsx");
const OUTPUT_PATH = path.resolve("public/data/retailers.geojson");
const CACHE_PATH  = path.resolve("data/geocode-cache.json");

// Helper: sleep
const wait = (ms) => new Promise(res => setTimeout(res, ms));

// Tiny fetch wrapper using https (no extra deps)
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

function addrKey(a) { return a.trim().toLowerCase(); }

async function geocodeAddress(fullAddress, cache) {
  const key = addrKey(fullAddress);
  if (cache[key]) return cache[key];

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json`);
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("limit", "1");
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("country", "US,CA");

  // polite spacing to avoid rate limits
  await wait(150);

  const data = await fetchJson(url.toString());
  if (data?.features?.length) {
    const [lng, lat] = data.features[0].center;
    const result = { lat, lng };
    cache[key] = result;
    return result;
  }
  console.warn("No geocode result for:", fullAddress);
  return null;
}

async function main() {
  // load cache
  let cache = {};
  if (fs.existsSync(CACHE_PATH)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")); } catch {}
  }

  // read excel
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error("Excel file not found at", EXCEL_PATH);
    process.exit(1);
  }
  const wb = xlsx.readFile(EXCEL_PATH);
  const sheet = wb.Sheets["Combined"] || wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  const features = [];
  for (const row of rows) {
    const name = String(row["Name"] || "").trim();
    const retailer = String(row["Retailer"] || "").trim();
    const category = String(row["Category"] || "").trim();
    const supplier = String(row["Supplier(s)"] || "").trim(); // <-- use Supplier(s)
    const addr = String(row["Address"] || "").trim();
    const city = String(row["City"] || "").trim();
    const state = String(row["State"] || "").trim();
    const zip = String(row["Zip"] || "").trim();

    if (!name || !addr || !city || !state) continue;

    const fullAddress = `${addr}, ${city}, ${state} ${zip}`.replace(/\s+/g, " ").trim();

    // If latitude/longitude columns exist, prefer them:
    const lat = row["Latitude"] || row["Lat"] || row["lat"];
    const lng = row["Longitude"] || row["Lon"] || row["lng"] || row["long"];
    let coords = null;

    if (lat && lng) {
      coords = { lat: Number(lat), lng: Number(lng) };
    } else {
      const g = await geocodeAddress(fullAddress, cache);
      if (g) coords = g;
    }

    if (!coords) continue;

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [coords.lng, coords.lat] },
      properties: {
        Name: name,
        Category: category,
        Retailer: retailer,
        Suppliers: supplier, // <-- renamed field
        Address: fullAddress
      }
    });
  }

  const geojson = { type: "FeatureCollection", features };

  // ensure output dir
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geojson, null, 2), "utf8");

  // save cache
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");

  console.log(`Wrote ${features.length} features to ${OUTPUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
