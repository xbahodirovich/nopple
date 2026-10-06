import { projectSchema, CURRENT_VERSION, FORMAT, type MoppleProject } from './schema.ts';
import { distance, EPSILON, isSimplePolygon, samePoint, polygonArea, roomPolygon, polygonsOverlap } from './geometry.ts';

export interface ValidationIssue { path: string; message: string }
export class MoppleValidationError extends Error {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'MoppleValidationError';
    this.issues = issues;
  }
}

/** Single entry point for future migrations. Never silently upgrades unknown versions. */
export function migrateProject(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || !('format' in input) || input.format !== FORMAT) {
    throw new MoppleValidationError([{ path: 'format', message: 'Expected a Mopple project' }]);
  }
  if (!('version' in input) || input.version !== CURRENT_VERSION) {
    throw new MoppleValidationError([{ path: 'version', message: 'Unsupported Mopple version' }]);
  }
  return input;
}

/** Parses, clones and validates shape and relationships. Throws without mutating input. */
export function validateProject(input: unknown): MoppleProject {
  const result = projectSchema.safeParse(migrateProject(input));
  if (!result.success) throw new MoppleValidationError(result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })));
  const p = result.data, issues: ValidationIssue[] = [];
  const fail = (path: string, message: string) => issues.push({ path, message });
  const { floors, walls, rooms, doors, windows } = p.building;
  const floorMap = new Map(floors.map(f => [f.id, f]));
  const wallMap = new Map(walls.map(w => [w.id, w]));
  const roomIds = new Set(rooms.map(r => r.id));
  const materialIds = new Set(p.materials.map(m => m.id));
  const seen = new Set<string>([p.project.id]);
  for (const entity of [...floors, ...walls, ...rooms, ...doors, ...windows, ...p.interior.objects, ...p.materials, ...p.lighting]) {
    if (seen.has(entity.id)) fail(entity.id, 'IDs must be globally unique');
    seen.add(entity.id);
  }
  if (Date.parse(p.project.updatedAt) < Date.parse(p.project.createdAt)) fail('project.updatedAt', 'Must not precede creation');
  const material = (id: string | undefined, path: string) => {
    if (id !== undefined && !materialIds.has(id)) fail(path, `Unknown material: ${id}`);
  };
  for (const w of walls) {
    const floor = floorMap.get(w.floorId);
    if (!floor) fail(w.id, 'Unknown floor');
    else if (w.height > floor.height + EPSILON) fail(w.id, 'Wall exceeds floor height');
    const length = distance(w.start, w.end);
    if (!Number.isFinite(length) || length <= EPSILON) fail(w.id, 'Wall must have a finite nonzero length');
    material(w.materialId, w.id);
  }
  for (const r of rooms) {
    const floor = floorMap.get(r.floorId);
    if (!floor) fail(r.id, 'Unknown floor');
    else if (r.height > floor.height + EPSILON) fail(r.id, 'Room exceeds floor height');
    Object.values(r.materials ?? {}).forEach(id => material(id, r.id));
    const edges = r.boundary.map(edge => {
      const w = wallMap.get(edge.wallId);
      if (!w || w.floorId !== r.floorId) { fail(r.id, 'Boundary wall must exist on the same floor'); return undefined; }
      return edge.reversed ? { start: w.end, end: w.start } : w;
    });
    if (new Set(r.boundary.map(e => e.wallId)).size !== r.boundary.length) fail(r.id, 'Repeated boundary wall');
    if (edges.every(e => e !== undefined)) {
      if (edges.some((e, i) => !samePoint(e.end, edges[(i + 1) % edges.length].start))) fail(r.id, 'Boundary must form a closed, ordered ring');
      if (!isSimplePolygon(edges.map(e => e.start))) fail(r.id, 'Boundary must be a simple, nonzero-area polygon');
    }
  }
  const openingBounds: { wallId: string; id: string; left: number; right: number; bottom: number; top: number }[] = [];
  for (const o of [...doors.map(d => ({ ...d, sillHeight: 0 })), ...windows]) {
    const wall = wallMap.get(o.wallId);
    material(o.materialId, o.id);
    if (!wall) { fail(o.id, 'Unknown wall'); continue; }
    const length = distance(wall.start, wall.end), center = o.position * length;
    const bottom = o.sillHeight;
    const bounds = { wallId: o.wallId, id: o.id, left: center - o.width / 2, right: center + o.width / 2, bottom, top: bottom + o.height };
    if (bounds.left < -EPSILON || bounds.right > length + EPSILON || bounds.top > wall.height + EPSILON) fail(o.id, 'Opening must fit within its wall');
    for (const other of openingBounds) {
      if (other.wallId === o.wallId && Math.min(bounds.right, other.right) - Math.max(bounds.left, other.left) > EPSILON && Math.min(bounds.top, other.top) - Math.max(bounds.bottom, other.bottom) > EPSILON) fail(o.id, `Opening overlaps ${other.id}`);
    }
    openingBounds.push(bounds);
  }
  for (const o of p.interior.objects) {
    material(o.materialId, o.id);
    if (!roomIds.has(o.roomId)) fail(o.id, 'Unknown room');
    for (const override of o.materialOverrides ?? []) material(override.materialId, o.id);
    const slots = (o.materialOverrides ?? []).map(m => m.slot);
    if (new Set(slots).size !== slots.length) fail(o.id, 'Duplicate material override slot');
  }
  for (const light of p.lighting) {
    if (light.type === 'directional' && light.position.x === light.target.x && light.position.y === light.target.y && light.position.z === light.target.z) fail(light.id, 'Directional light needs a nonzero direction');
  }
  if (!issues.length) {
    for (const r of rooms) if (polygonArea(roomPolygon(p, r)) < (r.type === 'hallway' ? 1 : 2)) fail(r.id, 'Room is below the minimum concept area (2 m²; hallway 1 m²)');
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
      if (rooms[i].floorId === rooms[j].floorId && polygonsOverlap(roomPolygon(p, rooms[i]), roomPolygon(p, rooms[j]))) fail(rooms[j].id, `Room overlaps ${rooms[i].name}`);
    }
  }
  if (issues.length) throw new MoppleValidationError(issues);
  return p;
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export function parseProject(json: string): MoppleProject {
  if (new TextEncoder().encode(json).length > MAX_FILE_BYTES) throw new MoppleValidationError([{ path: 'file', message: 'Project exceeds 5 MiB limit' }]);
  let value: unknown;
  try { value = JSON.parse(json); }
  catch { throw new MoppleValidationError([{ path: 'file', message: 'Malformed JSON' }]); }
  return validateProject(value);
}
