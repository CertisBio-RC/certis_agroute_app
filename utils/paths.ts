// utils/paths.ts
/**
 * withBasePath() — prefixes local asset/data paths so they work on GitHub Pages.
 * Rules:
 * - Absolute http(s) URLs are returned unchanged.
 * - If path already has the repo base, return as-is.
 * - In local dev (no '/{repo}' in pathname), return the plain path.
 */
export function withBasePath(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;

  const repo = process.env.NEXT_PUBLIC_REPO_NAME || "certis_agroute_app";
  const base = `/${repo}`;

  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (typeof window !== "undefined") {
    const inRepo = window.location.pathname.startsWith(base);
    // If we’re already under /{repo}, ensure prefix; otherwise (local dev), don’t.
    if (inRepo) {
      if (normalized.startsWith(base + "/")) return normalized;
      return `${base}${normalized}`;
    } else {
      // local dev or alternate host path
      return normalized;
    }
  }

  // SSR/Build-time fallback: keep it prefixed so static export links are correct
  if (normalized.startsWith(base + "/")) return normalized;
  return `${base}${normalized}`;
}
