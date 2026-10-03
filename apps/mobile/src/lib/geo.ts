import type { Coordinate, LineString } from '@pewnyszlak/domain';

const R = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: Coordinate, b: Coordinate): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearing(a: Coordinate, b: Coordinate): number {
  const φ1 = toRad(a.latitude), φ2 = toRad(b.latitude), Δλ = toRad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export const coordOf = (c: [number, number]): Coordinate => ({ longitude: c[0], latitude: c[1] });

export type RoutePosition = { point: Coordinate; distanceM: number; alongM: number; segmentIndex: number };

/** Rzut pozycji na linię trasy (lokalnie płaskie przybliżenie – wystarczające dla miasta). */
export function projectOnLine(line: LineString, p: Coordinate): RoutePosition {
  const kx = Math.cos(toRad(p.latitude)) * 111_320;
  const ky = 110_574;
  let best: RoutePosition = { point: coordOf(line.coordinates[0]!), distanceM: Infinity, alongM: 0, segmentIndex: 0 };
  let along = 0;
  for (let i = 0; i < line.coordinates.length - 1; i++) {
    const a = line.coordinates[i]!, b = line.coordinates[i + 1]!;
    const ax = (a[0] - p.longitude) * kx, ay = (a[1] - p.latitude) * ky;
    const bx = (b[0] - p.longitude) * kx, by = (b[1] - p.latitude) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const px = ax + t * dx, py = ay + t * dy;
    const d = Math.hypot(px, py);
    const segLen = Math.sqrt(len2);
    if (d < best.distanceM) {
      best = { point: { longitude: p.longitude + px / kx, latitude: p.latitude + py / ky }, distanceM: d, alongM: along + t * segLen, segmentIndex: i };
    }
    along += segLen;
  }
  return best;
}

export function lineLengthM(line: LineString): number {
  let s = 0;
  for (let i = 0; i < line.coordinates.length - 1; i++) s += haversineM(coordOf(line.coordinates[i]!), coordOf(line.coordinates[i + 1]!));
  return s;
}

/** Punkt w odległości `alongM` od początku linii. */
export function pointAlong(line: LineString, alongM: number): Coordinate {
  let acc = 0;
  for (let i = 0; i < line.coordinates.length - 1; i++) {
    const a = coordOf(line.coordinates[i]!), b = coordOf(line.coordinates[i + 1]!);
    const d = haversineM(a, b);
    if (acc + d >= alongM) {
      const t = d === 0 ? 0 : (alongM - acc) / d;
      return { longitude: a.longitude + (b.longitude - a.longitude) * t, latitude: a.latitude + (b.latitude - a.latitude) * t };
    }
    acc += d;
  }
  return coordOf(line.coordinates[line.coordinates.length - 1]!);
}

export function bboxOf(coords: [number, number][], padDeg = 0.0015): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of coords) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
  return [minX - padDeg, minY - padDeg, maxX + padDeg, maxY + padDeg];
}

export const KRAKOW_CENTER: Coordinate = { latitude: 50.0614, longitude: 19.9372 };
