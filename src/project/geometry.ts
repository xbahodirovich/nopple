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
