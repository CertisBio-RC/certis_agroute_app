// /utils/home.ts
export type HomeLoc = { lng: number; lat: number; label?: string };

const LS_KEY = "agroute_home_v1";

export function saveHome(home: HomeLoc | null) {
  if (!home) return localStorage.removeItem(LS_KEY);
  localStorage.setItem(LS_KEY, JSON.stringify(home));
}

export function loadHome(): HomeLoc | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (typeof j?.lng === "number" && typeof j?.lat === "number")
      return { lng: j.lng, lat: j.lat, label: typeof j?.label === "string" ? j.label : undefined };
    return null;
  } catch {
    return null;
  }
}

// Minimal forward geocoder using Mapbox v5
export async function geocodeAddress(query: string, accessToken: string) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query
  )}.json?limit=5&access_token=${accessToken}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Geocoding failed (${r.status})`);
  const j = await r.json();
  const f = j?.features?.[0];
  if (!f?.center) throw new Error("No results for that address.");
  return {
    lng: Number(f.center[0]),
    lat: Number(f.center[1]),
    label: String(f.place_name || query),
  } as HomeLoc;
}
