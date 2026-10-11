import type { MoppleMaterial, MoppleProject } from './schema.ts';

export const finishOptions = [
  { id: 'warm_oak', name: 'Warm oak', description: 'Natural timber, warm plaster and linen.', color: '#bca17d', floor: '#c5ab83', wall: '#e6dfd1', fabric: '#c7b8a1', kind: 'wood' },
  { id: 'light_stone', name: 'Light stone', description: 'Pale limestone, chalk walls and soft neutral fabric.', color: '#dedbd0', floor: '#d9d4c7', wall: '#f0ede5', fabric: '#d7d0c4', kind: 'stone' },
  { id: 'evening_light', name: 'Evening light', description: 'Warm oak with low, golden sunlight.', color: '#a98360', floor: '#b89a73', wall: '#e4d9c6', fabric: '#bbaa90', kind: 'wood' },
] as const;
export type FinishOptionId = typeof finishOptions[number]['id'];

/** Geometry never changes when comparing finishes. The caller decides when to commit. */
export function finishVariant(input: MoppleProject, id: FinishOptionId, roomId?: string): MoppleProject {
  const project = structuredClone(input);
  const option = finishOptions.find(item => item.id === id)!;
  const prefix = `finish_${id}`;
  const material = (suffix: string, name: string, kind: MoppleMaterial['kind'], color: string, roughness: number): MoppleMaterial =>
    ({ id: `${prefix}_${suffix}`, name, kind, color, roughness, metalness: 0, opacity: 1 });
  const definitions = [
    material('floor', option.kind === 'wood' ? 'Natural oak flooring' : 'Pale limestone floor', option.kind, option.floor, .65),
    material('wall', 'Warm plaster', 'paint', option.wall, .9),
    material('fabric', 'Woven linen', 'fabric', option.fabric, .94),
  ];
  for (const definition of definitions) {
    project.materials = project.materials.filter(m => m.id !== definition.id);
    project.materials.push(definition);
  }
  const rooms = project.building.rooms.filter(room => !roomId || room.id === roomId);
  const ids = new Set(rooms.map(room => room.id));
  const walls = new Set(rooms.flatMap(room => room.boundary.map(edge => edge.wallId)));
  for (const room of rooms) {
    room.materials = { ...room.materials, wall: `${prefix}_wall`, ceiling: `${prefix}_wall`,
      floor: room.type === 'bathroom' ? room.materials?.floor : `${prefix}_floor` };
  }
  for (const wall of project.building.walls) if (walls.has(wall.id)) wall.materialId = `${prefix}_wall`;
  for (const object of project.interior.objects) if (ids.has(object.roomId) && (object.kind === 'sofa' || object.kind === 'bed' || object.kind === 'chair')) object.materialId = `${prefix}_fabric`;
  project.metadata.sun = id === 'evening_light'
    ? { mode: 'manual', azimuth: 270, elevation: 16, intensity: 2.6, warmth: .7 }
    : { mode: 'manual', azimuth: 225, elevation: 42, intensity: 2.8, warmth: .28 };
  return project;
}

export function applyFinishPreference(project: MoppleProject, text: string, lighting = ''): void {
  const id: FinishOptionId = /stone|marble|limestone|камень|tosh/i.test(text) && !/oak|wood|timber|дуб/i.test(text) ? 'light_stone' : 'warm_oak';
  const variant = finishVariant(project, /evening|golden|sunset|вечер/i.test(lighting) ? 'evening_light' : id);
  project.materials = variant.materials;
  project.building = variant.building;
  project.interior = variant.interior;
  project.metadata.sun = variant.metadata.sun;
}
