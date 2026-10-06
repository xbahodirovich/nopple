import { distance, polygonArea, roomPolygon } from './geometry.ts';
import type { MoppleProject, Vector } from './schema.ts';

export interface ArchitectureMeasurement {
  id: string;
  floorId?: string;
  entityId?: string;
  entityType?: 'wall' | 'room';
  category: 'building' | 'room' | 'wall' | 'opening' | 'level';
  name: string;
  value: number;
  unit: 'm' | 'm²';
  start: Vector;
  end: Vector;
}

/** All distances are model measurements in meters; wall lengths follow centerlines. */
export function architectureMeasurements(project: MoppleProject): ArchitectureMeasurement[] {
  const result: ArchitectureMeasurement[] = [];
  const add = (row: ArchitectureMeasurement) => result.push(row);
  const walls = project.building.walls;
  if (!walls.length) return result;
  const bounds = buildingBounds(project);
  const { minX, maxX, minZ, maxZ, base, top } = bounds;
  const v = (x: number, y: number, z: number): Vector => ({ x, y, z });
  add({ id: 'building-width', category: 'building', name: 'Overall width · outer faces', value: maxX - minX, unit: 'm', start: v(minX, base, maxZ + 1), end: v(maxX, base, maxZ + 1) });
  add({ id: 'building-depth', category: 'building', name: 'Overall depth · outer faces', value: maxZ - minZ, unit: 'm', start: v(maxX + 1, base, minZ), end: v(maxX + 1, base, maxZ) });
  add({ id: 'building-height', category: 'building', name: 'Wall envelope height · excludes roof', value: top - base, unit: 'm', start: v(minX - .8, base, maxZ), end: v(minX - .8, top, maxZ) });
  for (const floor of project.building.floors) {
    const common = { floorId: floor.id, category: 'level' as const, unit: 'm' as const };
    add({ ...common, id: `${floor.id}-height`, name: `${floor.name} · floor height`, value: floor.height, start: v(minX - .4, floor.elevation, minZ), end: v(minX - .4, floor.elevation + floor.height, minZ) });
    add({ ...common, id: `${floor.id}-elevation`, name: `${floor.name} · elevation datum`, value: floor.elevation, start: v(minX, floor.elevation, minZ), end: v(minX, floor.elevation, minZ) });
  }
  for (const wall of walls) {
    const y = project.building.floors.find(f => f.id === wall.floorId)!.elevation;
    const length = distance(wall.start, wall.end);
    const ux = (wall.end.x - wall.start.x) / length, uz = (wall.end.z - wall.start.z) / length;
    const p = (along: number, height: number, offset = .25) => v(wall.start.x + ux * along - uz * offset, y + height, wall.start.z + uz * along + ux * offset);
    const common = { floorId: wall.floorId, entityId: wall.id, entityType: 'wall' as const, category: 'wall' as const, unit: 'm' as const };
    add({ ...common, id: `${wall.id}-length`, name: `${wall.id} · centerline length`, value: length, start: p(0, .08), end: p(length, .08) });
    add({ ...common, id: `${wall.id}-height`, name: `${wall.id} · height`, value: wall.height, start: p(0, 0), end: p(0, wall.height) });
    add({ ...common, id: `${wall.id}-thickness`, name: `${wall.id} · thickness`, value: wall.thickness, start: p(length / 2, wall.height, -wall.thickness / 2), end: p(length / 2, wall.height, wall.thickness / 2) });
    const openings = [...project.building.doors.filter(o => o.wallId === wall.id).map(o => ({ ...o, sillHeight: 0 })), ...project.building.windows.filter(o => o.wallId === wall.id)].sort((a, b) => a.position - b.position);
    let previousEnd = 0;
    for (const opening of openings) {
      const left = opening.position * length - opening.width / 2, right = left + opening.width;
      const c = { ...common, category: 'opening' as const };
      add({ ...c, id: `${opening.id}-width`, name: `${opening.id} · width`, value: opening.width, start: p(left, opening.sillHeight + .1, .4), end: p(right, opening.sillHeight + .1, .4) });
      add({ ...c, id: `${opening.id}-height`, name: `${opening.id} · height`, value: opening.height, start: p(right, opening.sillHeight, .4), end: p(right, opening.sillHeight + opening.height, .4) });
      add({ ...c, id: `${opening.id}-sill`, name: `${opening.id} · sill above floor`, value: opening.sillHeight, start: p(left, 0, .4), end: p(left, opening.sillHeight, .4) });
      add({ ...c, id: `${opening.id}-offset`, name: `${opening.id} · from wall start`, value: left, start: p(0, .1, .65), end: p(left, .1, .65) });
      if (left >= previousEnd) add({ ...c, id: `${opening.id}-gap`, name: `${opening.id} · preceding wall pier`, value: left - previousEnd, start: p(previousEnd, .1, .85), end: p(left, .1, .85) });
      previousEnd = Math.max(previousEnd, right);
    }
    if (openings.length) add({ ...common, id: `${wall.id}-end-pier`, name: `${wall.id} · final wall pier`, value: length - previousEnd, start: p(previousEnd, .1, .85), end: p(length, .1, .85) });
  }
  for (const room of project.building.rooms) {
    const polygon = roomPolygon(project, room);
    const xs = polygon.map(p => p.x), zs = polygon.map(p => p.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const y = project.building.floors.find(f => f.id === room.floorId)!.elevation;
    const c = { floorId: room.floorId, entityId: room.id, entityType: 'room' as const, category: 'room' as const, unit: 'm' as const };
    add({ ...c, id: `${room.id}-width`, name: `${room.name} · X extent (centerlines)`, value: x1 - x0, start: v(x0, y + .12, (z0 + z1) / 2), end: v(x1, y + .12, (z0 + z1) / 2) });
    add({ ...c, id: `${room.id}-depth`, name: `${room.name} · Z extent (centerlines)`, value: z1 - z0, start: v((x0 + x1) / 2, y + .12, z0), end: v((x0 + x1) / 2, y + .12, z1) });
    add({ ...c, id: `${room.id}-height`, name: `${room.name} · ceiling height`, value: room.height, start: v(x0, y, z0), end: v(x0, y + room.height, z0) });
    add({ ...c, id: `${room.id}-area`, name: `${room.name} · polygon area (centerlines)`, value: polygonArea(polygon), unit: 'm²', start: v((x0 + x1) / 2, y + .12, (z0 + z1) / 2), end: v((x0 + x1) / 2, y + .12, (z0 + z1) / 2) });
  }
  return result;
}

export function buildingBounds(project: MoppleProject) {
  const points = project.building.walls.flatMap(w => {
    const length = distance(w.start, w.end);
    const nx = -(w.end.z - w.start.z) / length * w.thickness / 2;
    const nz = (w.end.x - w.start.x) / length * w.thickness / 2;
    return [w.start, w.end].flatMap(p => [{ x: p.x + nx, z: p.z + nz }, { x: p.x - nx, z: p.z - nz }]);
  });
  if (!points.length) return { minX: -5, maxX: 5, minZ: -5, maxZ: 5, base: 0, top: 3 };
  return { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)), base: Math.min(...project.building.floors.map(f => f.elevation)), top: Math.max(...project.building.walls.map(w => project.building.floors.find(f => f.id === w.floorId)!.elevation + w.height)) };
}

export const exteriorViews = ['street', 'front', 'rear', 'left', 'right'] as const;
export type ExteriorView = typeof exteriorViews[number];
export const exteriorViewNames: Record<ExteriorView, string> = { street: 'Street perspective', front: 'Front facade (+Z)', rear: 'Rear facade (−Z)', left: 'Left facade (−X)', right: 'Right facade (+X)' };
export function exteriorCamera(project: MoppleProject, view: ExteriorView, aspect = 16 / 9) {
  const b = buildingBounds(project);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const height = b.top - b.base + .5, width = b.maxX - b.minX, depth = b.maxZ - b.minZ;
  const fov = 50;
  const span = view === 'left' || view === 'right' ? depth : width;
  const setback = Math.max(height, span / aspect) / (2 * Math.tan(fov * Math.PI / 360)) * 1.4 + 2;
  const target = { x: cx, y: b.base + height / 2, z: cz };
  const position = view === 'left' ? { x: b.minX - setback, y: target.y, z: cz } : view === 'right' ? { x: b.maxX + setback, y: target.y, z: cz } : view === 'rear' ? { x: cx, y: target.y, z: b.minZ - setback } : { x: cx + (view === 'street' ? width * .25 : 0), y: view === 'street' ? b.base + 1.6 : target.y, z: b.maxZ + setback };
  return { position, target, fov };
}
