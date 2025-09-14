// utils/routing.ts
export type Position = [number, number]; // [lng, lat]
export type Stop = { name: string; coord: Position };

const toRad = (d: number) => (d * Math.PI) / 180;

export function distance(a: Position, b: Position): number {
  // Haversine (km)
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const aa = s1 * s1 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

export function nearestNeighbor(stops: Stop[], origin: Position): Stop[] {
  const remaining = [...stops];
  const path: Stop[] = [];
  let current: Position = origin;
  while (remaining.length) {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distance(current, remaining[i].coord);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    path.push(next);
    current = next.coord;
  }
  return path;
}

export function twoOpt(path: Stop[], origin?: Position | null): Stop[] {
  if (path.length < 4) return path;
  const out = [...path];
  const start = origin ?? out[0].coord;

  function totalLength(p: Stop[]): number {
    let sum = distance(start, p[0].coord);
    for (let i = 0; i < p.length - 1; i++) sum += distance(p[i].coord, p[i + 1].coord);
    return sum;
  }

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < out.length - 2; i++) {
      for (let k = i + 1; k < out.length - 1; k++) {
        const newPath = [
          ...out.slice(0, i),
          ...out.slice(i, k + 1).reverse(),
          ...out.slice(k + 1),
        ];
        if (totalLength(newPath) + 1e-6 < totalLength(out)) {
          out.splice(0, out.length, ...newPath);
          improved = true;
        }
      }
    }
  }
  return out;
}

export function buildGoogleMapsLink(originLatLng: string, coords: Position[]): string {
  // originLatLng: "lat,lng" (note order!)
  const wp = coords.map((c) => `${c[1]},${c[0]}`);
  const destination = wp.length ? wp[wp.length - 1] : originLatLng;
  const waypoints = wp.slice(0, -1).join("|");
  const params = new URLSearchParams({
    api: "1",
    origin: originLatLng,
    destination,
  });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildAppleMapsLink(originLatLng: string, coords: Position[]): string {
  // Apple Maps supports fewer waypoints — we pack what we can
  const wp = coords.map((c) => `${c[1]},${c[0]}`);
  const daddr = wp.join(" to:");
  const params = new URLSearchParams({ saddr: originLatLng, daddr });
  return `https://maps.apple.com/?${params.toString()}`;
}

export function buildWazeLink(originLatLng: string, coords: Position[]): string {
  // Waze accepts a single destination per link; take the next stop
  const next = coords[0];
  if (!next) return "";
  const params = new URLSearchParams({ ll: `${next[1]},${next[0]}`, navigate: "yes" });
  return `https://waze.com/ul?${params.toString()}`;
}
