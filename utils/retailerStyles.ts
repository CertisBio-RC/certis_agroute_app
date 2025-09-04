// /utils/retailerStyles.ts
// Centralized retailer colors + smart logo resolution for your
// "Full Name of Retailer Logo(.png|.jpg|.jpeg)" convention.

export type RetailerKey = string;

export const retailerColorMap: Record<RetailerKey, string> = {
  "AgState": "#0ea5e9",
  "Nutrien Ag Solutions": "#16a34a",
  "CHS": "#7c3aed",
  "Helena": "#f59e0b",
  "WinField United": "#059669",
  "Growmark FS": "#dc2626",
  "Agriland FS": "#2563eb",
  "AgTegra": "#1d4ed8",
  // add others as needed
};

export function withBasePath(path: string) {
  const repo = process.env.NEXT_PUBLIC_REPO_NAME
    ? `/${process.env.NEXT_PUBLIC_REPO_NAME}`
    : "";
  return `${repo}${path}`;
}

export function colorForRetailer(retailer?: string) {
  const key = (retailer || "").trim();
  return retailerColorMap[key] || hashToColor(key || "Retailer");
}

// Build icon filename candidates from retailer/name/city.
// We then try .png -> .jpg -> .jpeg for each base.
export function iconUrlCandidates(retailer?: string, name?: string, city?: string): string[] {
  const r = (retailer || "").trim();
  const n = (name || "").trim();
  const c = (city || "").trim();
  const nameKey = firstStrongWord(n);

  const bases = dedupe([
    r && `${r} Logo`,
    r && c && `${r} ${c} Logo`,
    r && nameKey && `${r} ${nameKey} Logo`,
    n && `${n} Logo`,
  ].filter(Boolean) as string[]);

  const exts = [".png", ".jpg", ".jpeg"];
  const urls: string[] = [];
  for (const base of bases) {
    for (const ext of exts) {
      urls.push(withBasePath(`/icons/${base}${ext}`));
    }
  }
  return urls;
}

// ---- helpers ----
function firstStrongWord(s: string) {
  const stop = new Set(["agronomy","office","service","center","centre","plant","hq","main","location","retail","retailer","store","shop"]);
  const words = s.split(/[\s\-_,.\/]+/).map(w => w.trim()).filter(Boolean);
  for (const w of words) {
    const t = w.replace(/[^A-Za-z]/g, "");
    if (t && !stop.has(t.toLowerCase())) return capitalize(t);
  }
  return "";
}
function capitalize(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function dedupe<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

function hashToColor(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 45%)`;
}
