// /utils/mapbox.ts

/** Prefer a URL override (?mb=pk.XXXX) for quick testing, then env vars */
export function getPublicToken(): string {
  if (typeof window !== "undefined") {
    const u = new URL(window.location.href);
    const mb = u.searchParams.get("mb");
    if (mb) return mb;
  }
  return (
    (process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN as string) ||
    (process.env.MAPBOX_PUBLIC_TOKEN as string) ||
    ""
  );
}

/** BasePath-safe asset URL builder for GitHub Pages */
export function assetUrl(path: string): string {
  if (typeof window === "undefined") return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  const parts = window.location.pathname.split("/").filter(Boolean);
  const base = parts.length > 0 ? `/${parts[0]}` : "";
  return p.startsWith(`${base}/`) ? p : `${base}${p}`;
}
