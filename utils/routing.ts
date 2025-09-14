// /utils/routing.ts
// Route helpers: simple optimizer (NN + 2-opt) and link builders for Google/Apple/Waze.
// Now supports an optional { roundTrip?: boolean } in the link builders.

export type Position = [number, number];
export type Stop = { name: string; coord: Position };

type Options = { roundTrip?: boolean };

const toLatLng = (c: Position) => `${c[1]},${c[0]}`; // "lat,lng"

// ---- distances (fast equirectangular) ----
const R = 6371; // km
function dist(a: Position, b: Position): number {
  const [lng1, lat1] = a.map((v) => (v * Math.PI) / 180) as [number, number];
  const [lng2, lat2] = b.map((v) => (v * Math.PI) / 180) as [number, number];
  const x = (lng2 - lng1) * Math.cos((lat1 + lat2) / 2);
  const y = lat2 - lat1;
  return Math.sqrt(x * x + y * y) * R;
}

// ---- simplest heuristic: nearest neighbor ----
export function nearestNeighbor(stops: Stop[], origin: Position): Stop[] {
  if (stops.length <= 1) return stops.slice();
  const remaining = stops.slice();
  const ordered: Stop[] = [];
  let here = origin;

  while (remaining.length) {
    let bestIdx = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const d = dist(here, remaining[i].coord);
      if (d < bestD) { bestD = d; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    here = next.coord;
  }
  return ordered;
}

// ---- 2-opt improvement ----
export function twoOpt(order: Stop[], origin: Position): Stop[] {
  const path = order.slice();
  if (path.length < 3) return path;

  const total = (arr: Stop[]) => {
    let t = 0;
    let prev = origin;
    for (const s of arr) { t += dist(prev, s.coord); prev = s.coord; }
    return t;
  };

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < path.length - 1; i++) {
      for (let k = i + 1; k < path.length; k++) {
        const newPath = path.slice(0, i).concat(path.slice(i, k + 1).reverse(), path.slice(k + 1));
        if (total(newPath) + 1e-9 < total(path)) {
          path.splice(0, path.length, ...newPath);
          improved = true;
        }
      }
    }
  }
  return path;
}

// ---- Link builders (with optional roundTrip) ----

// Overloads for TS friendliness
export function buildGoogleMapsLink(origin: string, coords: Position[]): string;
export function buildGoogleMapsLink(origin: string, coords: Position[], opts?: Options): string;
export function buildGoogleMapsLink(origin: string, coords: Position[], opts?: Options): string {
  const roundTrip = !!opts?.roundTrip;
  const pts = coords.map(toLatLng);
  if (roundTrip && pts.length) pts.push(origin); // return to start

  const destination = pts.length ? pts[pts.length - 1] : origin;
  const waypoints = pts.length > 1 ? pts.slice(0, -1).join("|") : "";

  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("travelmode", "driving");
  u.searchParams.set("origin", origin);
  u.searchParams.set("destination", destination);
  if (waypoints) u.searchParams.set("waypoints", waypoints);
  return u.toString();
}

export function buildAppleMapsLink(origin: string, coords: Position[]): string;
export function buildAppleMapsLink(origin: string, coords: Position[], opts?: Options): string;
export function buildAppleMapsLink(origin: string, coords: Position[], opts?: Options): string {
  const roundTrip = !!opts?.roundTrip;
  const pts = coords.map(toLatLng);
  if (roundTrip && pts.length) pts.push(origin);

  const u = new URL("https://maps.apple.com/");
  u.searchParams.set("dirflg", "d");
  u.searchParams.set("saddr", origin);
  if (pts.length) {
    // daddr=first +to:second +to:third ...
    const first = pts[0];
    const tail = pts.slice(1).map((p) => `+to:${encodeURIComponent(p)}`).join("");
    u.searchParams.set("daddr", `${first}${tail}`);
  }
  return u.toString();
}

// Waze has no official multi-stop link. We send first stop (or origin if none).
export function buildWazeLink(origin: string, coords: Position[]): string;
export function buildWazeLink(origin: string, coords: Position[], _opts?: Options): string;
export function buildWazeLink(origin: string, coords: Position[], _opts?: Options): string {
  const target = coords.length ? toLatLng(coords[0]) : origin;
  const u = new URL("https://waze.com/ul");
  u.searchParams.set("ll", target); // lat,lng
  u.searchParams.set("navigate", "yes");
  return u.toString();
}
