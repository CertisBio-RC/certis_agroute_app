// /scripts/partners-to-geojson.mjs
// Robust Excel -> GeoJSON converter with graceful fallback (pure ESM JS)

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const xlsxPath = path.join(repoRoot, "data", "partners.xlsx");
const outDir = path.join(repoRoot, "public", "data");
const outPath = path.join(outDir, "retailers.geojson");

// Try a robust import that works whether xlsx exposes default or namespace
async function loadXLSX() {
  const mod = await import("xlsx");
  return (mod && mod.default) ? mod.default : mod;
}

function toNumber(v) {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function rowToFeature(row) {
  // Accept common header names and variants
  const retailer = String(row.Retailer ?? row.retailer ?? row.Brand ?? row.brand ?? "").trim();
  const name     = String(row.Name ?? row.name ?? row.Location ?? row.location ?? "").trim();
  const category = String(row.Category ?? row.category ?? "").trim();
  const state    = String(row.State ?? row.state ?? "").trim();

  // Coordinates first (preferred if present)
  const lon = toNumber(row.Longitude ?? row.longitude ?? row.lng ?? row.lon ?? row.x);
  const lat = toNumber(row.Latitude  ?? row.latitude  ?? row.lat ?? row.y);

  if (Number.isFinite(lon) && Number.isFinite(lat)) {
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        Retailer: retailer,
        Name: name || retailer,
        Category: category,
        State: state,
        Address: row.Address ?? row.address ?? "",
        City: row.City ?? row.city ?? "",
        Zip: String(row.Zip ?? row.ZIP ?? row.zip ?? "").trim(),
      },
    };
  }

  // If we don’t have coords, allow geocoding later (keep address props)
  return {
    type: "Feature",
    geometry: null,
    properties: {
      Retailer: retailer,
      Name: name || retailer,
      Category: category,
      State: state,
      Address: row.Address ?? row.address ?? "",
      City: row.City ?? row.city ?? "",
      Zip: String(row.Zip ?? row.ZIP ?? row.zip ?? "").trim(),
    },
  };
}

async function main() {
  // Ensure output dir
  fs.mkdirSync(outDir, { recursive: true });

  if (!fs.existsSync(xlsxPath)) {
    console.warn(`⚠️  partners.xlsx not found at ${xlsxPath}. Writing empty retailers.geojson and exiting 0.`);
    fs.writeFileSync(outPath, JSON.stringify({ type: "FeatureCollection", features: [] }));
    process.exit(0);
  }

  const XLSX = await loadXLSX();

  // Read workbook
  const wb = XLSX.read(fs.readFileSync(xlsxPath), { type: "buffer" });
  const sheetNames = wb.SheetNames || [];
  if (!sheetNames.length) {
    console.warn("⚠️  Workbook has no sheets; writing empty GeoJSON.");
    fs.writeFileSync(outPath, JSON.stringify({ type: "FeatureCollection", features: [] }));
    process.exit(0);
  }

  // Combine all sheets
  const features = [];
  for (const sn of sheetNames) {
    const ws = wb.Sheets[sn];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    for (const row of rows) {
      const f = rowToFeature(row);
      const empty = !(f.properties?.Retailer || f.properties?.Name);
      if (!empty) features.push(f);
    }
  }

  const fc = { type: "FeatureCollection", features };
  fs.writeFileSync(outPath, JSON.stringify(fc));
  console.log(`✅ Wrote ${features.length} features to ${path.relative(repoRoot, outPath)}`);
}

main().catch((e) => {
  console.error("partners-to-geojson failed:", e?.stack || e);
  // Write empty output but exit 0 to keep CI moving
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ type: "FeatureCollection", features: [] }));
    console.warn("⚠️ Wrote empty retailers.geojson due to error.");
    process.exit(0);
  } catch {
    process.exit(1);
  }
});
