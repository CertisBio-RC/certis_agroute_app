// /utils/filtering.ts
import type { FeatureCollection, Point } from "geojson";

type Props = Record<string, any>;

const STATE_KEYS = [
  "state", "State", "STATE", "st", "St", "ST",
  "state_code", "stateCode", "state_abbrev", "StateAbbrev",
  "postal", "Postal", "abbr", "Abbr"
];
const RETAILER_KEYS = ["retailer", "Retailer"];
const CATEGORY_KEYS = ["category", "Category"];
const NAME_KEYS = ["name", "Name"];
const CITY_KEYS = ["city", "City"];

export function readString(p: Props, keys: string[]): string {
  for (const k of keys) {
    const v = p?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function readState(p: Props): string {
  const v = readString(p, STATE_KEYS);
  return v ? v.trim().toUpperCase() : "";
}
export function readRetailer(p: Props): string { return readString(p, RETAILER_KEYS).trim(); }
export function readCategory(p: Props): string { return readString(p, CATEGORY_KEYS).trim(); }
export function readName(p: Props): string { return readString(p, NAME_KEYS).trim(); }
export function readCity(p: Props): string { return readString(p, CITY_KEYS).trim(); }

export function distinctValues(
  fc: FeatureCollection<Point, Props> | null,
  reader: (p: Props) => string
): string[] {
  if (!fc) return [];
  const s = new Set<string>();
  for (const f of fc.features) {
    const v = reader(f.properties || {});
    if (v) s.add(v);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

export function applyFilters(
  fc: FeatureCollection<Point, Props>,
  opts: {
    state?: string;               // single-select (e.g., "IA")
    states?: Set<string>;         // multi-select set of postal codes
    retailer?: string;
    category?: string;
  }
): FeatureCollection<Point, Props> {
  const wantOne = (val: string, target?: string) =>
    !target || !target.trim() || val === target.trim();

  const wantMany = (val: string, set?: Set<string>) =>
    !set || set.size === 0 || set.has(val);

  const features = fc.features.filter((f) => {
    const p = (f.properties || {}) as Props;
    const st = readState(p);        // normalized to UPPERCASE
    const r  = readRetailer(p);
    const c  = readCategory(p);

    const okState = wantOne(st, opts.state?.toUpperCase()) && wantMany(st, opts.states);
    const okRetailer = wantOne(r, opts.retailer);
    const okCategory = wantOne(c, opts.category);
    return okState && okRetailer && okCategory;
  });

  return { type: "FeatureCollection", features };
}
