import type { MoppleInteriorObject, MoppleProject, MoppleRoom } from './schema.ts';
import { validateProject } from './validation.ts';

export type AiSelection =
  | { type: 'object'; id: string }
  | { type: 'wall'; id: string }
  | { type: 'room'; id: string };

export const AI_SELECTION_REQUIRED = 'Select a room, wall, or object first';

function selectedObject(project: MoppleProject, selection: AiSelection): MoppleInteriorObject {
  const object = project.interior.objects.find(item => item.id === selection.id);
  if (!object) throw new Error('This selection no longer exists. Select it again.');
  return object;
}

function selectedRoom(project: MoppleProject, selection: AiSelection): MoppleRoom {
  const room = project.building.rooms.find(item => item.id === selection.id);
  if (!room) throw new Error('This selection no longer exists. Select it again.');
  return room;
}

/**
 * Builds a schema-valid project containing the selected entity, its room(s),
 * one hop of adjacent rooms, and only the floors, walls, openings, furniture
 * and materials needed to reason about that selection. Never the full house.
 */
export function buildAiContext(project: MoppleProject, selection: AiSelection): MoppleProject {
  const object = selection.type === 'object' ? selectedObject(project, selection) : undefined;
  const wall = selection.type === 'wall' ? project.building.walls.find(item => item.id === selection.id) : undefined;
  const room = selection.type === 'room' ? selectedRoom(project, selection) : undefined;
  if (selection.type === 'wall' && !wall) throw new Error('This selection no longer exists. Select it again.');

  const focusRooms = selection.type === 'room'
    ? [room!]
    : selection.type === 'object'
      ? project.building.rooms.filter(item => item.id === object!.roomId)
      : project.building.rooms.filter(item => item.boundary.some(edge => edge.wallId === wall!.id));
  const focusRoomIds = new Set(focusRooms.map(item => item.id));
  const focusWallIds = new Set(focusRooms.flatMap(item => item.boundary.map(edge => edge.wallId)));
  const adjacentRooms = project.building.rooms.filter(item =>
    !focusRoomIds.has(item.id) && item.boundary.some(edge => focusWallIds.has(edge.wallId)));
  const rooms = [...focusRooms, ...adjacentRooms];

  const walls = project.building.walls.filter(item =>
    item.id === wall?.id || rooms.some(roomItem => roomItem.boundary.some(edge => edge.wallId === item.id)));
  const wallIds = new Set(walls.map(item => item.id));
  const doors = project.building.doors.filter(item => wallIds.has(item.wallId));
  const windows = project.building.windows.filter(item => wallIds.has(item.wallId));
  const floors = project.building.floors.filter(item =>
    rooms.some(roomItem => roomItem.floorId === item.id) || walls.some(wallItem => wallItem.floorId === item.id));

  const objects = project.interior.objects.filter(item =>
    selection.type === 'object' ? item.id === selection.id : focusRoomIds.has(item.roomId));

  const materialIds = new Set<string>();
  for (const roomItem of rooms) {
    for (const id of [roomItem.materials?.floor, roomItem.materials?.wall, roomItem.materials?.ceiling]) {
      if (id) materialIds.add(id);
    }
  }
  for (const wallItem of walls) if (wallItem.materialId) materialIds.add(wallItem.materialId);
  for (const opening of [...doors, ...windows]) if (opening.materialId) materialIds.add(opening.materialId);
  for (const objectItem of objects) {
    if (objectItem.materialId) materialIds.add(objectItem.materialId);
    for (const override of objectItem.materialOverrides ?? []) materialIds.add(override.materialId);
  }

  return validateProject({
    format: project.format,
    version: project.version,
    project: { ...project.project, name: 'Selection edit context' },
    building: {
      floors,
      rooms,
      walls,
      doors,
      windows,
    },
    interior: { objects },
    materials: project.materials.filter(item => materialIds.has(item.id)),
    lighting: [],
    metadata: {},
  });
}
