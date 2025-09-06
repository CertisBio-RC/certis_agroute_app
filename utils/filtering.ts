// /utils/filtering.ts
import type { Feature, FeatureCollection, Point } from "geojson";

type RetailerProps = Record<string, any>;

function getProp(p: Record<string, any> | undefined, names: string[]): string {
  if (!p) return "";
  for (const n of names) {
    const v = p[n];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function toUpper2(s: string) {
  return s.trim().toUpperCase();
}

/* ---------- Readers ---------- */
export function readState(f: Feature<Point, RetailerProps>): string {
  const s = getProp(f.properties, ["state", "State"]);
  return s ? toUpper2(s) : "";
}

export function readRetailer(f: Feature<Point, RetailerProps>): string {
  return getProp(f.properties, ["retailer", "Retailer"]);
}

export function readCategory(f: Feature<Point, RetailerProps>): string {
  return getProp(f.properties, ["category", "Category"]);
}

export function readCity(f: Feature<Point, RetailerProps>): string {
  return getProp(f.properties, ["city", "City"]);
}

export function readName(f: Feature<Point, RetailerProps>): string {
  return getProp(f.properties, ["name", "Name"]);
}

/** Parse Supplier(s) into a clean list: split by comma/semicolon/slash, trim, dedupe, keep case as-is for display */
export function readSuppliersList(f: Feature<Point, RetailerProps>): string[] {
  const p = f.properties || {};
  const raw =
    (typeof p["Supplier(s)"] === "string" && p["Supplier(s)"]) ||
    (typeof p["Suppliers"] === "string" && p["Suppliers"]) ||
    (typeof p["Supplier"] === "string" && p["Supplier"]) ||
    (typeof p["supplier(s)"] === "string" && p["supplier(s)"]) ||
    (typeof p["suppliers"] === "string" && p["suppliers"]) ||
    "";
  if (!raw.trim()) return [];
  const parts = raw
    .split(/[;,/|]/g)
    .map((s) => s.trim())
    .filter(Boolean);
  // Deduplicate case-insensitively but preserve first-cased form
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of parts) {
    const key = s.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

/** Distinct single-value reader */
export function distinctValues(
  fc: FeatureCollection<Point, RetailerProps> | null,
  reader: (f: Feature<Point, RetailerProps>) => string
): string[] {
  if (!fc) return [];
  const set = new Set<string>();
  for (const f of fc.features) {
    const v = reader(f);
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Distinct suppliers across all rows (flattened) */
export function distinctSuppliers(
  fc: FeatureCollection<Point, RetailerProps> | null
): string[] {
  if (!fc) return [];
  const set = new Set<string>();
  for (const f of fc.features) {
    for (const s of readSuppliersList(f)) {
      set.add(s);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/* ---------- Filtering ---------- */
export function applyFilters(
  fc: FeatureCollection<Point, RetailerProps>,
  opts: {
    state?: string;               // single-select state
    states?: Set<string>;         // multi-state chips
    retailer?: string;
    category?: string;
    supplier?: string;            // NEW: single-select supplier
  }
): FeatureCollection<Point, RetailerProps> {
  const wantState = (opts.state || "").trim();
  const chipStates = opts.states ?? new Set<string>();
  const wantRetailer = (opts.retailer || "").trim();
  const wantCategory = (opts.category || "").trim();
  const wantSupplier = (opts.supplier || "").trim().toLowerCase();

  const useChipStates = chipStates.size > 0;

  const out: Feature<Point, RetailerProps>[] = [];
  for (const f of fc.features) {
    const s = readState(f);
    const r = readRetailer(f);
    const c = readCategory(f);

    if (useChipStates) {
      if (!s || !chipStates.has(toUpper2(s))) continue;
    } else if (wantState) {
      if (!s || toUpper2(s) !== toUpper2(wantState)) continue;
    }

    if (wantRetailer && r !== wantRetailer) continue;
    if (wantCategory && c !== wantCategory) continue;

    if (wantSupplier) {
      const suppliers = readSuppliersList(f).map((x) => x.toLowerCase());
      if (!suppliers.includes(wantSupplier)) continue;
    }

    out.push(f);
  }

  return { type: "FeatureCollection", features: out };
}
