const R = 6371008.8;

export function haversineM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dphi = p2 - p1;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function polylineLengthM(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversineM(coords[i - 1]![0], coords[i - 1]![1], coords[i]![0], coords[i]![1]);
  return total;
}

/** Rzut punktu na łamaną. Zwraca odległość (m), punkt rzutu oraz dystans wzdłuż łamanej od początku. */
export function pointToPolylineM(lon: number, lat: number, coords: [number, number][]): { distanceM: number; point: [number, number]; alongM: number } {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const toXY = (c: [number, number]): [number, number] => [(c[0] - lon) * cosLat * 111_320, (c[1] - lat) * 110_540];
  let best = { distanceM: Infinity, point: coords[0]!, alongM: 0 };
  let along = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    const [ax, ay] = toXY(a);
    const [bx, by] = toXY(b);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : (-(ax * dx) - ay * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.sqrt(px * px + py * py);
    const segLen = haversineM(a[0], a[1], b[0], b[1]);
    if (d < best.distanceM) {
      best = { distanceM: d, point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], alongM: along + t * segLen };
    }
    along += segLen;
  }
  return best;
}

/** Wycina fragment łamanej między dystansami (m) od początku. */
export function slicePolyline(coords: [number, number][], fromM: number, toM: number): [number, number][] {
  if (fromM > toM) [fromM, toM] = [toM, fromM];
  const out: [number, number][] = [];
  let along = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    const segLen = haversineM(a[0], a[1], b[0], b[1]);
    const segStart = along;
    const segEnd = along + segLen;
    if (segEnd < fromM) { along = segEnd; continue; }
    if (segStart > toM) break;
    const interp = (m: number): [number, number] => {
      const t = segLen === 0 ? 0 : Math.max(0, Math.min(1, (m - segStart) / segLen));
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    };
    if (out.length === 0) out.push(interp(fromM));
    if (segEnd <= toM) out.push(b);
    else { out.push(interp(toM)); break; }
    along = segEnd;
  }
  if (out.length === 1) out.push(out[0]!);
  return out;
}

export function bearing(a: [number, number], b: [number, number]): number {
  const φ1 = (a[1] * Math.PI) / 180;
  const φ2 = (b[1] * Math.PI) / 180;
  const λ = ((b[0] - a[0]) * Math.PI) / 180;
  const y = Math.sin(λ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function turnAngle(fromBearing: number, toBearing: number): number {
  let d = toBearing - fromBearing;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d; // ujemne = w lewo
}
