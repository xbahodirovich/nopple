import { MoppleProjectEngine } from './engine.ts';
import type { SelectedEntity } from '../editor/canvas2d.ts';
import { interpretPromptLocally, isHouseRequest } from '../editor/ai.ts';
import type { DesignPreview } from './preview.ts';

/** Interpret against an isolated selection, never fall back to another room/item. */
export function previewSelectionEdit(engine: MoppleProjectEngine, selection: SelectedEntity, request: string): DesignPreview {
  if (!request.trim()) throw new Error('Describe the change you want.');
  if (isHouseRequest(request)) throw new Error('Use New home for a whole-house request.');
  const project=engine.getSnapshot();
  const object=project.interior.objects.find(item=>item.id===selection.id);
  const wall=project.building.walls.find(item=>item.id===selection.id);
  const room=project.building.rooms.find(item=>item.id===(object?.roomId??selection.id)) ?? (wall ? project.building.rooms.find(item=>item.boundary.some(edge=>edge.wallId===wall.id)) : undefined);
  if(!room || (selection.type==='object'&&!object) || (selection.type==='wall'&&!wall)) throw new Error('This selection no longer exists. Select it again.');
  const context=structuredClone(project);
  context.building.rooms=[structuredClone(room)];
  context.interior.objects=context.interior.objects.filter(item=>selection.type==='object'?item.id===selection.id:item.roomId===room.id);
  const finish=/\b(color|paint|blue|white|green|black|gray|grey|oak|wood|marble|stone|tile|plaster|fabric)\b/i.test(request) && !/\b(move|rotate|remove|delete|add|replace|swap)\b/i.test(request);
  let prompt=request;
  if(selection.type==='wall' && !finish)throw new Error('Local wall requests support colors and finishes. Use Properties to change its dimensions.');
  if(selection.type==='object' && finish) prompt=prompt.replace(/\b(sofa|bed|chair|table|cabinet|lamp|appliance|decoration|stairs|fixture)\b/gi,'');
  else if(object)prompt=prompt.replace(/\b(it|this item|this object|this thing)\b/gi,object.kind.replaceAll('_',' '));
  const operations=interpretPromptLocally(prompt,context,selection.type==='wall'?room.id:selection.id);
  if(!operations.length)throw new Error('Try a color, finish, furniture move, rotation, or room-size change. AI is not connected.');
  if(finish && selection.type!=='room') {
    const definition=operations.find(op=>op.type==='change_material');
    if(!definition || definition.type!=='change_material')throw new Error('Describe a supported color or finish.');
    const material={...definition.material,id:`selected_finish_${crypto.randomUUID()}`};
    if(object && ['sofa','bed','chair'].includes(object.kind))material.kind='fabric';
    project.materials.push(material);
    if(selection.type==='object') {
      object!.materialId=material.id;
      const primary=['sofa','bed','chair'].includes(object!.kind)?'upholstery':['table','cabinet','stairs'].includes(object!.kind)?'wood':'surface';
      object!.materialOverrides=object!.materialOverrides?.filter(override=>override.slot!==primary);
    } else wall!.materialId=material.id;
    const draft=new MoppleProjectEngine(project);
    return {project:draft.getSnapshot(),revision:engine.revision,title:request,changes:1,focusRoomId:room.id};
  }
  for(const op of operations) {
    const allowed = op.type==='change_material' ||
      ((op.type==='update_room'||op.type==='resize_room') && selection.type==='room' && op.targetId===room.id) ||
      (op.type==='update_wall' && selection.type==='room' && room.boundary.some(edge=>edge.wallId===op.targetId)) ||
      (op.type==='add_object' && op.object.roomId===room.id && (selection.type==='room' || operations.some(change=>change.type==='remove_object'&&change.targetId===selection.id))) ||
      (['move_object','remove_object','scale_object'].includes(op.type) && 'targetId' in op && context.interior.objects.some(item=>item.id===op.targetId));
    if(!allowed)throw new Error('This request affects something outside your selection. Select that room or item instead.');
  }
  // New material IDs prevent an edit from recoloring other users of a shared finish.
  for(const op of operations)if(op.type==='change_material') {
    const old=op.material.id,id=`selected_finish_${crypto.randomUUID()}`;op.material.id=id;
    for(const reference of operations) {
      if(reference.type==='update_wall'&&reference.changes.materialId===old)reference.changes.materialId=id;
      if(reference.type==='update_room'&&reference.changes.materials) for(const slot of ['wall','floor','ceiling'] as const)if(reference.changes.materials[slot]===old)reference.changes.materials[slot]=id;
    }
  }
  const draft=new MoppleProjectEngine(project);draft.applyOperations({operations});
  return {project:draft.getSnapshot(),revision:engine.revision,title:request,changes:operations.length,focusRoomId:room.id};
}
