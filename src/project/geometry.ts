import type { MoppleProject, MoppleRoom, Point } from './schema.ts';

export const EPSILON = 1e-7;
export const samePoint = (a: Point, b: Point) => Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.z - b.z) <= EPSILON;
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

/** The caller supplies a validated project. Points use world X/Z, never pixels. */
export function roomPolygon(project: MoppleProject, room: MoppleRoom): Point[] {
  return room.boundary.map(edge => {
    const wall = project.building.walls.find(w => w.id === edge.wallId);
    if (!wall) throw new Error(`Unknown wall: ${edge.wallId}`);
    return { ...(edge.reversed ? wall.end : wall.start) };
  });
}

const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function onSegment(a: Point, b: Point, p: Point) {
  return Math.abs(cross(a, b, p)) <= EPSILON && p.x >= Math.min(a.x, b.x) - EPSILON && p.x <= Math.max(a.x, b.x) + EPSILON && p.z >= Math.min(a.z, b.z) - EPSILON && p.z <= Math.max(a.z, b.z) + EPSILON;
}
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const ac = cross(a, b, c), ad = cross(a, b, d), ca = cross(c, d, a), cb = cross(c, d, b);
  return ((ac > EPSILON && ad < -EPSILON || ac < -EPSILON && ad > EPSILON) &&
    (ca > EPSILON && cb < -EPSILON || ca < -EPSILON && cb > EPSILON)) ||
    onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
export function isSimplePolygon(points: Point[]) {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (samePoint(a, b)) return false;
    twiceArea += a.x * b.z - b.x * a.z;
    const c = points[(i + 2) % points.length];
    if (Math.abs(cross(a, b, c)) <= EPSILON && (onSegment(a, b, c) || onSegment(b, c, a))) return false;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length])) return false;
    }
  }
  return Number.isFinite(twiceArea) && Math.abs(twiceArea) > EPSILON;
}

export function polygonArea(points: Point[]): number {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    twiceArea += a.x * b.z - b.x * a.z;
  }
  return Math.abs(twiceArea) / 2;
}

/** Strict interior test: shared boundary points do not count as overlap. */
export function insidePolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (onSegment(a, b, p)) return false;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  if (a.some(p => insidePolygon(p, b)) || b.some(p => insidePolygon(p, a))) return true;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const p = a[i], q = a[(i+1)%a.length], r = b[j], s = b[(j+1)%b.length];
    if (cross(p,q,r)*cross(p,q,s) < -EPSILON && cross(r,s,p)*cross(r,s,q) < -EPSILON) return true;
  }
  return a.every(p => b.some(q => samePoint(p,q))) && a.length === b.length;
}
