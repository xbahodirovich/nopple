import { MoppleProjectEngine } from './engine.ts';
import type { SelectedEntity } from '../editor/canvas2d.ts';
import { interpretPromptLocally, isHouseRequest } from '../editor/ai.ts';
import { validateOperations, type MoppleOperation, type MoppleOperations } from './operations.ts';
import type { MoppleInteriorObject, MoppleProject, MoppleRoom, MoppleWall } from './schema.ts';
import type { DesignPreview } from './preview.ts';
import { LocalEditUnsupported } from './local-edit-error.ts';

interface SelectionTargets { object?: MoppleInteriorObject; wall?: MoppleWall; room: MoppleRoom }

function resolveSelection(project: MoppleProject, selection: SelectedEntity): SelectionTargets {
  const object = project.interior.objects.find(item => item.id === selection.id);
  const wall = project.building.walls.find(item => item.id === selection.id);
  const room = project.building.rooms.find(item => item.id === (object?.roomId ?? selection.id))
    ?? (wall ? project.building.rooms.find(item => item.boundary.some(edge => edge.wallId === wall.id)) : undefined);
  if (!room || (selection.type === 'object' && !object) || (selection.type === 'wall' && !wall)) throw new Error('This selection no longer exists. Select it again.');
  return { object, wall, room };
}

/** New material IDs prevent an edit from recoloring other users of a shared finish. */
function isolateSelectionMaterials(operations: MoppleOperations): MoppleOperations {
  const isolated = structuredClone(operations);
  for (const op of isolated.operations) {
    if (op.type !== 'change_material') continue;
    const oldId = op.material.id;
    const id = `selected_finish_${crypto.randomUUID()}`;
    op.material.id = id;
    for (const ref of isolated.operations) {
      if (ref.type === 'update_wall' && ref.changes.materialId === oldId) ref.changes.materialId = id;
      if (ref.type === 'update_room' && ref.changes.materials) {
        for (const slot of ['wall', 'floor', 'ceiling'] as const) {
          if (ref.changes.materials[slot] === oldId) ref.changes.materials[slot] = id;
        }
      }
      if (ref.type === 'add_object') {
        if (ref.object.materialId === oldId) ref.object.materialId = id;
        for (const override of ref.object.materialOverrides ?? []) {
          if (override.materialId === oldId) override.materialId = id;
        }
      }
    }
  }
  return isolated;
}

/** Shared by the local and hosted paths: validate scope, then apply to a scratch engine only. */
export function previewSelectionOperations(
  project: MoppleProject,
  selection: SelectedEntity,
  operations: MoppleOperations,
  revision: number,
  title: string,
): DesignPreview {
  const { object, wall, room } = resolveSelection(project, selection);
  if (operations.operations.some(op => op.type === 'create_house' || op.type === 'update_design_brief')) {
    throw new Error('AI proposed replacing your house for an ordinary edit. Nothing was applied; rephrase the request.');
  }
  const roomObjectIds = new Set(project.interior.objects.filter(item => item.roomId === room.id).map(item => item.id));
  for (const op of operations.operations) {
    if (op.type === 'change_material') continue;
    if (selection.type === 'room') {
      if ((op.type === 'update_room' || op.type === 'resize_room') && op.targetId === room.id) continue;
      if (op.type === 'update_wall' && room.boundary.some(edge => edge.wallId === op.targetId)) continue;
      if (op.type === 'change_room_style' && op.targetId === room.id) continue;
      if (op.type === 'add_object' && op.object.roomId === room.id) continue;
      if ((op.type === 'move_object' || op.type === 'remove_object' || op.type === 'scale_object') && 'targetId' in op && roomObjectIds.has(op.targetId)) continue;
    } else if (selection.type === 'object') {
      if (op.type === 'add_object' && op.object.roomId === room.id && operations.operations.some(change => change.type === 'remove_object' && change.targetId === object!.id)) continue;
      if ((op.type === 'move_object' || op.type === 'remove_object' || op.type === 'scale_object') && 'targetId' in op && op.targetId === object!.id) continue;
    } else if (op.type === 'update_wall' && op.targetId === wall!.id) continue;
    throw new Error('This request affects something outside your selection. Select that room or item instead.');
  }
  const isolated = isolateSelectionMaterials(operations);
  const draft = new MoppleProjectEngine(project);
  draft.applyOperations(isolated);
  return { project: draft.getSnapshot(), revision, title, changes: isolated.operations.length, focusRoomId: room.id };
}

/** Interpret against an isolated selection, never fall back to another room/item. */
export function previewSelectionEdit(engine: MoppleProjectEngine, selection: SelectedEntity, request: string): DesignPreview {
  if (!request.trim()) throw new Error('Describe the change you want.');
  if (isHouseRequest(request)) throw new Error('Use New home for a whole-house request.');
  const project = engine.getSnapshot();
  const { object, wall, room } = resolveSelection(project, selection);
  const context = structuredClone(project);
  context.building.rooms = context.building.rooms.filter(item => item.id === room.id);
  context.interior.objects = context.interior.objects.filter(item => selection.type === 'object' ? item.id === selection.id : item.roomId === room.id);
  const finish = /\b(color|paint|blue|white|green|black|gray|grey|oak|wood|marble|stone|tile|plaster|fabric)\b/i.test(request) && !/\b(move|rotate|remove|delete|add|replace|swap)\b/i.test(request);
  let prompt = request;
  if (selection.type === 'wall' && !finish) throw new Error('Local wall requests support colors and finishes. Use Properties to change its dimensions.');
  if (selection.type === 'object' && finish) prompt = prompt.replace(/\b(sofa|bed|chair|table|cabinet|lamp|appliance|decoration|stairs|fixture)\b/gi, '');
  else if (object) prompt = prompt.replace(/\b(it|this item|this object|this thing)\b/gi, object.kind.replaceAll('_', ' '));
  let operations: MoppleOperation[];
  try {
    operations = interpretPromptLocally(prompt, context, selection.type === 'wall' ? room.id : selection.id);
  } catch (error) {
    throw new LocalEditUnsupported(error instanceof Error ? error.message : 'The local interpreter could not handle this request.', { cause: error });
  }
  if (!operations.length) throw new LocalEditUnsupported('Try a color, finish, furniture move, rotation, or room-size change.');
  if (finish && selection.type !== 'room') {
    const definition = operations.find(op => op.type === 'change_material');
    if (!definition || definition.type !== 'change_material') throw new LocalEditUnsupported('Describe a supported color or finish.');
    const material = { ...definition.material, id: `selected_finish_${crypto.randomUUID()}` };
    if (object && ['sofa', 'bed', 'chair'].includes(object.kind)) material.kind = 'fabric';
    project.materials.push(material);
    if (selection.type === 'object') {
      object!.materialId = material.id;
      const primary = ['sofa', 'bed', 'chair'].includes(object!.kind) ? 'upholstery' : ['table', 'cabinet', 'stairs'].includes(object!.kind) ? 'wood' : 'surface';
      object!.materialOverrides = object!.materialOverrides?.filter(override => override.slot !== primary);
    } else wall!.materialId = material.id;
    const draft = new MoppleProjectEngine(project);
    return { project: draft.getSnapshot(), revision: engine.revision, title: request, changes: 1, focusRoomId: room.id };
  }
  return previewSelectionOperations(project, selection, validateOperations({ operations }), engine.revision, request);
}
