// /utils/paths.ts
export function withBasePath(path: string) {
  const repo = (process.env.NEXT_PUBLIC_REPO_NAME || process.env.REPO_NAME || "").trim();
  const p = path.startsWith("/") ? path : `/${path}`;
  return repo ? `/${repo}${p}` : p;
}
