import type { MoppleProject, MoppleRoom, Point } from './schema.ts';

/** Deterministic concept layout: two room wings connected by a central hall. */
export function createHouseDesign(project: MoppleProject, brief: { area: number; bedrooms: number; bathrooms: number; style: string }): void {
  const types: MoppleRoom['type'][] = ['living_room', 'kitchen', ...Array<MoppleRoom['type']>(brief.bedrooms).fill('bedroom'), ...Array<MoppleRoom['type']>(brief.bathrooms).fill('bathroom')];
  if (types.length % 2) types.push('dining_room');
  const columns = types.length / 2;
  const width = Math.max(Math.sqrt(brief.area * 1.4), columns * 2.4);
  const depth = brief.area / width, hallDepth = 1.4;
  if ((depth - hallDepth) / 2 < 2.2) throw new Error('This area is too small for the requested rooms. Increase the area or reduce the room count.');
  const b: MoppleProject['building'] = { floors: [{ id: 'house_floor', name: 'Ground floor', elevation: 0, height: 2.8 }], rooms: [], walls: [], doors: [], windows: [] };
  project.metadata.description = `Generated single-floor concept: ${brief.area} m², ${brief.bedrooms} bedrooms, ${brief.bathrooms} bathrooms.`;
  project.building = b;
  project.interior.objects = [];
  project.materials = [
    { id: 'house_plaster', name: 'Warm plaster', kind: 'paint', color: '#e4dfd3', roughness: .9, metalness: 0, opacity: 1 },
    { id: 'house_oak', name: 'Oak floor', kind: 'wood', color: '#c8b493', roughness: .75, metalness: 0, opacity: 1 },
    { id: 'house_tile', name: 'Stone tile', kind: 'stone', color: '#a9b4ac', roughness: .65, metalness: 0, opacity: 1 },
    { id: 'house_glass', name: 'Glass', kind: 'glass', color: '#aacfc5', roughness: .15, metalness: 0, opacity: .25 },
  ];
  project.lighting = [
    { id: 'house_ambient', type: 'ambient', color: '#edf2ee', intensity: 1.8 },
    { id: 'house_sun', type: 'directional', color: '#fff5e3', intensity: 2.8, position: { x: -8, y: 14, z: 9 }, target: { x: 0, y: 0, z: 0 } },
  ];
  const edges = new Map<string, string>();
  function edge(a: Point, c: Point) {
    const key = `${a.x},${a.z}:${c.x},${c.z}`, reverse = `${c.x},${c.z}:${a.x},${a.z}`;
    if (edges.has(key)) return { wallId: edges.get(key)!, reversed: false };
    if (edges.has(reverse)) return { wallId: edges.get(reverse)!, reversed: true };
    const id = `house_wall_${b.walls.length + 1}`;
    edges.set(key, id);
    b.walls.push({ id, floorId: 'house_floor', start: a, end: c, thickness: .16, height: 2.8, materialId: 'house_plaster' });
    return { wallId: id, reversed: false };
  }
  const counts = new Map<string, number>();
  const top: MoppleRoom['boundary'] = [], bottom: MoppleRoom['boundary'] = [];
  types.forEach((type, i) => {
    const row = Math.floor(i / columns), column = i % columns;
    const x0 = -width / 2 + column * width / columns, x1 = -width / 2 + (column + 1) * width / columns;
    const z0 = row === 0 ? -depth / 2 : hallDepth / 2, z1 = row === 0 ? -hallDepth / 2 : depth / 2;
    const boundary = [edge({ x: x0, z: z0 }, { x: x1, z: z0 }), edge({ x: x1, z: z0 }, { x: x1, z: z1 }), edge({ x: x1, z: z1 }, { x: x0, z: z1 }), edge({ x: x0, z: z1 }, { x: x0, z: z0 })];
    const number = (counts.get(type) ?? 0) + 1; counts.set(type, number);
    const roomId = `house_${type}_${number}`;
    b.rooms.push({ id: roomId, name: `${type.replaceAll('_', ' ')} ${number}`, type, floorId: 'house_floor', boundary, height: 2.8, style: brief.style, materials: { floor: type === 'bathroom' ? 'house_tile' : 'house_oak', wall: 'house_plaster' } });
    const inside = boundary[row === 0 ? 2 : 0], outside = boundary[row === 0 ? 0 : 2];
    (row === 0 ? top : bottom).push({ wallId: inside.wallId, reversed: !inside.reversed });
    b.doors.push({ id: `house_door_${i}`, wallId: inside.wallId, position: .5, width: .85, height: 2.1 });
    b.windows.push({ id: `house_window_${i}`, wallId: outside.wallId, position: .5, width: Math.min(1.5, (x1 - x0) * .5), height: 1.1, sillHeight: 1, materialId: 'house_glass' });
    const kind = type === 'bedroom' ? 'bed' : type === 'living_room' ? 'sofa' : type === 'dining_room' ? 'table' : 'cabinet';
    project.interior.objects.push({ id: `house_object_${i}`, assetId: `${kind}_standard`, kind, roomId, position: { x: (x0 + x1) / 2, y: 0, z: (z0 + z1) / 2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });
  });
  const east = edge({ x: width / 2, z: -hallDepth / 2 }, { x: width / 2, z: hallDepth / 2 });
  const west = edge({ x: -width / 2, z: hallDepth / 2 }, { x: -width / 2, z: -hallDepth / 2 });
  b.rooms.push({ id: 'house_hall', name: 'Hallway', type: 'hallway', floorId: 'house_floor', height: 2.8, boundary: [...top, east, ...bottom.reverse(), west], materials: { floor: 'house_oak' }, style: brief.style });
  b.doors.push({ id: 'house_entry', wallId: west.wallId, position: .5, width: 1, height: 2.1 });
}
