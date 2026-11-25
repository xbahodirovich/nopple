import type { MoppleProject } from './schema.ts';
import { roomPolygon, polygonArea } from './geometry.ts';
import { DEFAULT_FURNITURE_SIZES } from './furniture-dimensions.ts';

export interface MaterialsRoom { name: string; type: string; floor: string; area: number; floorFinish: string; wallFinish: string; }
export interface MaterialsFinish { name: string; kind: string; color: string; uses: number; }
export interface MaterialsItem { item: string; room: string; qty: number; size: string; }
export interface MaterialsSchedule { rooms: MaterialsRoom[]; finishes: MaterialsFinish[]; furniture: MaterialsItem[]; }

/** 'living_room' -> 'Living room', 'lounge_sofa' -> 'Lounge sofa'. Data-derived labels only. */
export function prettifyId(id: string): string {
  return id.split('_').filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ');
}

function sizeLabel(size: { x: number; y: number; z: number }): string {
  const round = (value: number) => String(Math.round(value * 100) / 100);
  return `${round(size.x)} × ${round(size.z)} × ${round(size.y)}`;
}

/** Rooms, finishes and furniture of the current project, from existing data structures. */
export function materialsSchedule(project: MoppleProject): MaterialsSchedule {
  const materialName = (id?: string) => project.materials.find(material => material.id === id)?.name ?? '';
  const uses = new Map<string, number>();
  const count = (id?: string) => { if (id) uses.set(id, (uses.get(id) ?? 0) + 1); };
  for (const room of project.building.rooms) { count(room.materials?.floor); count(room.materials?.wall); count(room.materials?.ceiling); }
  for (const wall of project.building.walls) count(wall.materialId);
  for (const opening of [...project.building.doors, ...project.building.windows]) count(opening.materialId);
  for (const object of project.interior.objects) { count(object.materialId); for (const override of object.materialOverrides ?? []) count(override.materialId); }

  const rooms = project.building.rooms.map(room => ({
    name: room.name,
    type: prettifyId(room.type),
    floor: project.building.floors.find(floor => floor.id === room.floorId)?.name ?? '',
    area: polygonArea(roomPolygon(project, room)),
    floorFinish: materialName(room.materials?.floor),
    wallFinish: materialName(room.materials?.wall),
  }));

  const finishes = project.materials.map(material => ({
    name: material.name, kind: material.kind, color: material.color, uses: uses.get(material.id) ?? 0,
  }));

  const grouped = new Map<string, MaterialsItem>();
  for (const object of project.interior.objects) {
    const dimensions = object.size
      ? sizeLabel(object.size)
      : sizeLabel((() => { const d = DEFAULT_FURNITURE_SIZES[object.kind]; return { x: d.width, z: d.depth, y: d.height }; })());
    const key = `${object.assetId}|${object.roomId}|${dimensions}`;
    const room = project.building.rooms.find(entry => entry.id === object.roomId)?.name ?? '';
    const existing = grouped.get(key);
    if (existing) existing.qty += 1;
    else grouped.set(key, { item: prettifyId(object.assetId), room, qty: 1, size: dimensions });
  }
  return { rooms, finishes, furniture: [...grouped.values()] };
}

const quote = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
const number = (value: number) => String(Math.round(value * 100) / 100);

/** Sectioned CSV: rooms, finishes, furniture. Same escaping rules as the measurements export. */
export function materialsCsv(schedule: MaterialsSchedule): string {
  return [
    'Rooms', 'Name,Type,Floor,Area (m2),Floor finish,Wall finish',
    ...schedule.rooms.map(room => [quote(room.name), quote(room.type), quote(room.floor), number(room.area), quote(room.floorFinish), quote(room.wallFinish)].join(',')),
    '', 'Finishes', 'Name,Kind,Color,Used in',
    ...schedule.finishes.map(finish => [quote(finish.name), quote(finish.kind), quote(finish.color), String(finish.uses)].join(',')),
    '', 'Furniture', 'Item,Room,Qty,Size (m)',
    ...schedule.furniture.map(item => [quote(item.item), quote(item.room), String(item.qty), quote(item.size)].join(',')),
  ].join('\r\n');
}
