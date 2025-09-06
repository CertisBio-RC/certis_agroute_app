// /scripts/partners-to-geojson.ts
// Run with:  npx ts-node scripts/partners-to-geojson.ts
// or add a package.json script: "partners:geojson": "ts-node scripts/partners-to-geojson.ts"

import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { FeatureCollection, Feature, Point } from "geojson";

type Row = Record<string, any>;

const INPUT = process.env.PARTNERS_XLSX || path.join("data", "partners.xlsx");
const OUTPUT = path.join("data", "retailers.geojson");
const SHEET_INDEX = 0;

function getS(row: Row, keys: string[], def = ""): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && !Number.isNaN(v)) return String(v);
  }
  return def;
}

function getN(row: Row, keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function buildFeature(row: Row): Feature<Point, Record<string, any>> | null {
  const lng = getN(row, ["Longitude", "longitude", "Lng", "lng", "Lon", "lon"]);
  const lat = getN(row, ["Latitude", "latitude", "Lat", "lat"]);
  if (lng == null || lat == null) return null; // skip rows without coordinates

  const props: Record<string, any> = {
    Retailer: getS(row, ["Retailer", "retailer"]),
    Name: getS(row, ["Name", "name"]),
    City: getS(row, ["City", "city"]),
    State: getS(row, ["State", "state"]),
    Zip: getS(row, ["Zip", "ZIP", "zip"]),
    Category: getS(row, ["Category", "category"]),
    Address: getS(row, ["Address", "address"]),
  };

  // Include Supplier(s) column (robust to naming variations)
  const suppliers =
    getS(row, ["Supplier(s)", "Suppliers", "Supplier", "supplier(s)", "suppliers"], "");
  if (suppliers) props["Supplier(s)"] = suppliers;

  // "Long Name" can be ignored per user, but if present, include for debugging
  const longName = getS(row, ["Long Name", "LongName", "long name", "longName"], "");
  if (longName) props["Long Name"] = longName;

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [lng, lat],
    },
    properties: props,
  };
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`❌ Input not found: ${INPUT}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(INPUT, { cellDates: false });
  const wsName = wb.SheetNames[SHEET_INDEX];
  const ws = wb.Sheets[wsName];
  const rows: Row[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const feats: Feature<Point, Record<string, any>>[] = [];

  for (const row of rows) {
    const f = buildFeature(row);
    if (f) feats.push(f);
  }

  const fc: FeatureCollection<Point, Record<string, any>> = {
    type: "FeatureCollection",
    features: feats,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(fc, null, 2), "utf8");
  console.log(`✅ Wrote ${feats.length} features to ${OUTPUT}`);
}

main();
