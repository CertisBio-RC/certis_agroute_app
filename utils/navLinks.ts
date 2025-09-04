// /utils/navLinks.ts
// Build deep links to mobile nav apps from an ordered list of [lng, lat] waypoints.
// We conservatively chunk long legs to avoid URL limits on mobile apps.

type Coord = [number, number];

const fmt = (n: number) => n.toFixed(6); // compact but accurate enough

// ---- Google Maps ----
// Pattern: https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=LAT,LNG&destination=LAT,LNG&waypoints=LAT,LNG|LAT,LNG...
// On mobile, very long URLs or too many waypoints can fail, so we chunk.
// Conservative waypoint cap (excluding origin+dest): 8 per link.
const GMAPS_WAYPOINT_CAP = 8;

export function buildGoogleMapsLinks(coords: Coord[]): string[] {
  if (!coords || coords.length < 2) return [];
  const links: string[] = [];
  let i = 0;

  // We’ll chain segments so dest of previous becomes origin of next
  while (i < coords.length - 1) {
    const origin = coords[i];
    // Take up to CAP waypoints plus a destination
    const remaining = coords.length - 1 - i; // number of edges left
    const takeEdges = Math.min(remaining, GMAPS_WAYPOINT_CAP + 1);
    const slice = coords.slice(i, i + takeEdges + 1); // includes origin...destination

    const originStr = `${fmt(origin[1])},${fmt(origin[0])}`;
    const destinationStr = `${fmt(slice[slice.length - 1][1])},${fmt(slice[slice.length - 1][0])}`;

    const mids = slice.slice(1, -1);
    const waypoints =
      mids.length > 0
        ? "&waypoints=" +
          mids.map((c) => `${fmt(c[1])},${fmt(c[0])}`).join("|")
        : "";

    const url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${originStr}&destination=${destinationStr}${waypoints}`;
    links.push(url);

    i += takeEdges; // hop to the last dest of this chunk
  }
  return links;
}

// ---- Apple Maps ----
// Pattern: https://maps.apple.com/?saddr=LAT,LNG&daddr=LAT,LNG+to:LAT,LNG+to:...
// Also chunk; conservative extra "to:" count: 8.
const APPLE_TO_CAP = 8;
export function buildAppleMapsLinks(coords: Coord[]): string[] {
  if (!coords || coords.length < 2) return [];
  const links: string[] = [];
  let i = 0;

  while (i < coords.length - 1) {
    const origin = coords[i];
    const remaining = coords.length - 1 - i;
    const takeEdges = Math.min(remaining, APPLE_TO_CAP + 1);
    const slice = coords.slice(i, i + takeEdges + 1);

    const saddr = `${fmt(origin[1])},${fmt(origin[0])}`;
    const dparts = slice.slice(1).map((c, idx) => {
      const s = `${fmt(c[1])},${fmt(c[0])}`;
      return idx === 0 ? s : `to:${s}`;
    });
    const daddr = dparts.join("+");

    links.push(`https://maps.apple.com/?dirflg=d&saddr=${saddr}&daddr=${daddr}`);
    i += takeEdges;
  }
  return links;
}

// ---- Waze ----
// Waze deep links are destination-first; multi-stop is not officially supported.
// We return a SEQUENCE of one-tap links: each opens Waze to navigate to next stop.
export function buildWazeStepLinks(coords: Coord[]): string[] {
  if (!coords || coords.length < 2) return [];
  const links: string[] = [];
  for (let i = 1; i < coords.length; i++) {
    const c = coords[i];
    links.push(`https://www.waze.com/ul?ll=${fmt(c[1])},${fmt(c[0])}&navigate=yes`);
  }
  return links;
}
