import { DEFAULT_FURNITURE_SIZES } from './furniture-dimensions.ts';
import type { MoppleProject } from './schema.ts';
import { generateArchitecturalLayout } from './architecture-generator.ts';

/**
 * Creates coherent architectural layout matching requested area, bedrooms, bathrooms, floors, and spaces.
 */
export function createHouseDesign(
  project: MoppleProject,
  brief: {
    area: number;
    bedrooms: number;
    bathrooms: number;
    style: string;
    floors?: number;
    spaces?: string;
    household?: string;
  }
): void {
  const floors = brief.floors ?? project.metadata.designBrief?.floors ?? 1;
  const spaces = brief.spaces ?? project.metadata.designBrief?.spaces;
  const household = brief.household ?? project.metadata.designBrief?.household;

  generateArchitecturalLayout(project, {
    area: brief.area,
    bedrooms: brief.bedrooms,
    bathrooms: brief.bathrooms,
    floors,
    style: brief.style,
    spaces,
    household,
    materials: project.metadata.designBrief?.materials,
    lighting: project.metadata.designBrief?.lighting,
  });
  for (const object of project.interior.objects) {
    const dimensions=DEFAULT_FURNITURE_SIZES[object.kind];
    object.size ??= {x:dimensions.width,y:dimensions.height,z:dimensions.depth};
  }
}
