import type { MoppleProjectEngine } from './engine.ts';
import { distance, roomPolygon } from './geometry.ts';
import { validateProject } from './validation.ts';

/** Renderer-neutral projections; no meshes, pixels, cameras or UI selections. */
export function createProjectViews(input: unknown) {
  const project = validateProject(input);
  const rooms = project.building.rooms.map(room => ({ ...room, polygon: roomPolygon(project, room) }));
  const walls = project.building.walls.map(wall => {
    const floor = project.building.floors.find(f => f.id === wall.floorId)!;
    const length = distance(wall.start, wall.end);
    // A cuboid's local +X points along the wall; right-handed Euler Y rotation.
    const rotationY = -Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
    const openings = [
      ...project.building.doors.filter(o => o.wallId === wall.id).map(o => ({ ...o, kind: 'door' as const, sillHeight: 0 })),
      ...project.building.windows.filter(o => o.wallId === wall.id).map(o => ({ ...o, kind: 'window' as const })),
    ].map(o => ({ ...o, center: {
      x: wall.start.x + (wall.end.x - wall.start.x) * o.position,
      y: floor.elevation + o.sillHeight + o.height / 2,
      z: wall.start.z + (wall.end.z - wall.start.z) * o.position,
    } }));
    return { ...wall, length, rotationY, baseElevation: floor.elevation, openings };
  });
  const shared = { floors: project.building.floors, rooms, walls, materials: project.materials };
  return {
    projectId: project.project.id,
    architecture: shared,
    interior: { ...shared, objects: project.interior.objects },
    scene: { ...shared, objects: project.interior.objects, lighting: project.lighting },
  };
}
export type MoppleProjectViews = ReturnType<typeof createProjectViews>;

/** Deliver one consistent revision to all three consumers. Return cleanup on unmount. */
export function subscribeProjectViews(engine: MoppleProjectEngine, render: (views: MoppleProjectViews) => void): () => void {
  render(createProjectViews(engine.getSnapshot()));
  return engine.subscribe(project => render(createProjectViews(project)));
}
