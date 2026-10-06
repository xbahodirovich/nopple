import { architectureMeasurements, exteriorCamera, exteriorViews, exteriorViewNames } from './measurements.ts';
import { designBriefSchema } from './brief.ts';
import type { MoppleProject } from './schema.ts';

/** Handoff contract, not a job runner. Every output stays pending until a provider produces an artifact. */
export function createGenerationPlan(project: MoppleProject) {
  const brief = designBriefSchema.parse(project.metadata.designBrief);
  const interiorJobs = project.building.rooms.filter(room => room.type !== 'hallway').map(room => ({
    id: `interior_${room.id}`, roomId: room.id, status: 'not_implemented' as const,
    camera: null,
    prompt: `Photorealistic architectural interior visualization of ${room.name}. Preserve the approved room dimensions, openings, furniture and materials from the attached project. Style: ${brief.style}. Materials: ${brief.materials}. Lighting: ${brief.lighting}. Requested views: ${brief.interiorViews}. Physically plausible sunlight, soft contact shadows, indirect light, material highlights and reflections. No invented doors, windows or rooms.`,
  }));
  return {
    format: 'mopple-generation-plan', version: 1,
    projectId: project.project.id, projectUpdatedAt: project.project.updatedAt,
    brief,
    stages: [
      { id: 'architecture', status: 'concept_only', remaining: 'Resolve every brief requirement, detailed layouts, elevations, roof, stairs and dimensions.' },
      { id: 'model', status: 'concept_only', remaining: 'Complete house geometry, PBR materials, furniture assets and lighting.' },
      { id: 'exterior_images', status: 'scene_preview_available', remaining: 'Cloud enhancement requires a geometry-conditioned image provider; local street and facade captures are available in the gallery.' },
      { id: 'interior_images', status: 'not_implemented', remaining: 'Resolve requested room views, choose valid cameras and connect a geometry-conditioned rendering provider.' },
    ],
    interiorJobs,
    measurements: architectureMeasurements(project),
    exteriorJobs: exteriorViews.map(view => ({
      id: `exterior_${view}`, view, name: exteriorViewNames[view], status: 'not_implemented' as const,
      camera: exteriorCamera(project, view),
      prompt: `Exterior visualization of ${exteriorViewNames[view]}. Preserve attached building geometry, floor levels, roof, facade materials and every opening. Style: ${brief.style}. Materials: ${brief.materials}. Requested views: ${brief.interiorViews}. Front is +Z; do not invent site dimensions or neighboring buildings.`,
    })),
    unresolved: ['Resolve every requested space and viewpoint against the final architecture; current room jobs are provisional.', 'Do not run image jobs before architecture, materials, cameras and lighting are confirmed.'],
    // Include authoritative geometry and persisted sun settings, never credentials.
    project: structuredClone(project),
  };
}
