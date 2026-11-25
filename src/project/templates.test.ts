import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, MoppleProjectEngine } from './engine.ts';
import { validateProject } from './validation.ts';
import { generateArchitecturalLayout } from './architecture-generator.ts';
import { homeTemplates } from './templates.ts';
import { previewLocalEdit, applyDesignPreview } from './preview.ts';

const TEMPLATE_IDS = ['studio', 'apartment-2', 'house-small'];

function templateProject(id: string) {
  const template = homeTemplates.find(entry => entry.id === id)!;
  const project = createProject(`Template ${id}`, { id: `project_tpl_${id.replaceAll('-', '_')}`, now: '2026-11-25T00:00:00Z' });
  generateArchitecturalLayout(project, {
    area: template.area, bedrooms: template.bedrooms, bathrooms: template.bathrooms,
    floors: template.floors, style: 'Warm modern', spaces: template.spaces,
  });
  return project;
}

test('every starting template generates a valid project with rooms and furniture', () => {
  for (const id of TEMPLATE_IDS) {
    const project = templateProject(id);
    validateProject(project);
    assert.ok(project.building.rooms.length >= 4, `${id}: expected rooms`);
    assert.ok(project.interior.objects.length > 0, `${id}: expected furniture`);
    const types = new Set(project.building.rooms.map(room => room.type));
    for (const type of types) assert.ok(['living_room', 'kitchen', 'bedroom', 'bathroom', 'dining_room', 'hallway', 'office', 'custom', 'garage'].includes(type), `${id}: unexpected room type ${type}`);
  }
});

test('template briefs satisfy the design brief schema limits', () => {
  for (const template of homeTemplates) {
    assert.ok(template.area >= 40 && template.area <= 600, `${template.id}: area`);
    assert.ok(Number.isInteger(template.bedrooms) && template.bedrooms >= 1 && template.bedrooms <= 8, `${template.id}: bedrooms`);
    assert.ok(Number.isInteger(template.bathrooms) && template.bathrooms >= 1 && template.bathrooms <= 5, `${template.id}: bathrooms`);
    assert.ok(Number.isInteger(template.floors) && template.floors >= 1 && template.floors <= 5, `${template.id}: floors`);
    assert.ok(template.request.trim().length > 0 && template.request.length <= 4000, `${template.id}: request`);
  }
});

test('template homes work with the local prompt-edit flow', () => {
  for (const id of TEMPLATE_IDS) {
    const engine = new MoppleProjectEngine(templateProject(id));
    const roomId = engine.getSnapshot().building.rooms[0].id;
    const floorName = (engine: MoppleProjectEngine) => {
      const snapshot = engine.getSnapshot();
      const floorId = snapshot.building.rooms.find(room => room.id === roomId)?.materials?.floor;
      return snapshot.materials.find(material => material.id === floorId)?.name;
    };
    const before = floorName(engine);
    const preview = previewLocalEdit(engine, 'make this floor marble', roomId);
    assert.ok(preview.changes > 0, `${id}: local edit produced no operations`);
    applyDesignPreview(engine, preview);
    validateProject(engine.getSnapshot());
    assert.notEqual(before, floorName(engine), `${id}: floor finish did not change`);
  }
});
