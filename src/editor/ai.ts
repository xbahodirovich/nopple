import type { MoppleProjectEngine } from '../project/engine.ts';
import { roomPolygon } from '../project/geometry.ts';
import type { MoppleOperation, MoppleOperations } from '../project/operations.ts';
import { validateOperations } from '../project/operations.ts';
import type { MoppleInteriorObject, MoppleLight, MoppleMaterial, MoppleProject, MoppleRoom } from '../project/schema.ts';

export interface AIExecutionResult {
  success: boolean;
  message: string;
  operationsCount: number;
  source: 'nvidia_nim' | 'local_semantic';
  model?: string;
}

export const DEFAULT_AI_MODEL = 'z-ai/glm-5.3-flash';
export const DEFAULT_GEMINI_MODEL = DEFAULT_AI_MODEL; // Backward compatibility alias
const NIM_API_KEY_STORAGE = 'mopple_nim_api_key';
const LEGACY_GEMINI_KEY_STORAGE = 'mopple_gemini_api_key';
const AI_MODEL_STORAGE = 'mopple_ai_model';
const LEGACY_MODEL_STORAGE = 'mopple_gemini_model';

export function getStoredApiKey(): string {
  return localStorage.getItem(NIM_API_KEY_STORAGE) || localStorage.getItem(LEGACY_GEMINI_KEY_STORAGE) || '';
}

export function setStoredApiKey(key: string): void {
  if (!key) {
    localStorage.removeItem(NIM_API_KEY_STORAGE);
    localStorage.removeItem(LEGACY_GEMINI_KEY_STORAGE);
  } else {
    localStorage.setItem(NIM_API_KEY_STORAGE, key.trim());
  }
}

export function getStoredModel(): string {
  const stored = localStorage.getItem(AI_MODEL_STORAGE) || localStorage.getItem(LEGACY_MODEL_STORAGE);
  if (!stored || stored.includes('gemini')) {
    return DEFAULT_AI_MODEL;
  }
  return stored;
}

export function setStoredModel(model: string): void {
  if (!model) {
    localStorage.removeItem(AI_MODEL_STORAGE);
    localStorage.removeItem(LEGACY_MODEL_STORAGE);
  } else {
    localStorage.setItem(AI_MODEL_STORAGE, model.trim());
  }
}

/**
 * Executes a natural language request against the project engine.
 */
export async function executeAiPrompt(
  prompt: string,
  engine: MoppleProjectEngine,
  selectedId?: string
): Promise<AIExecutionResult> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    throw new Error('Prompt cannot be empty');
  }

  const apiKey = getStoredApiKey();
  const requestedModel = getStoredModel();
  let nimError: string | null = null;

  // If API key is provided, attempt NVIDIA NIM API call first
  if (apiKey) {
    try {
      const result = await callNvidiaNimApi(cleanPrompt, engine.getSnapshot(), apiKey, selectedId, requestedModel);
      if (result && result.operations && result.operations.operations.length > 0) {
        engine.applyOperations(result.operations);
        const isGlm = result.modelUsed.includes('glm');
        return {
          success: true,
          message: `Executed ${result.operations.operations.length} operation(s) via ${isGlm ? 'GLM 5.3 Flash' : result.modelUsed} (NVIDIA NIM)`,
          operationsCount: result.operations.operations.length,
          source: 'nvidia_nim',
          model: result.modelUsed,
        };
      }
    } catch (err: any) {
      console.warn('NVIDIA NIM API call failed:', err);
      nimError = err?.message || 'Unknown NVIDIA NIM API error';
    }
  }

  // Local semantic natural language interpreter
  const operations = interpretPromptLocally(cleanPrompt, engine.getSnapshot(), selectedId);
  if (!operations || operations.length === 0) {
    if (nimError) {
      throw new Error(`NVIDIA NIM (GLM 5.3 Flash) Error: ${nimError}`);
    }
    throw new Error(`Could not determine operations for: "${cleanPrompt}". Try asking to resize a room, add or replace furniture, change materials, or update lighting.`);
  }

  const validated = validateOperations({ operations });
  engine.applyOperations(validated);

  return {
    success: true,
    message: nimError
      ? `Applied ${validated.operations.length} change(s) via local engine (Note: NVIDIA NIM error: ${nimError})`
      : `Applied ${validated.operations.length} change(s) seamlessly`,
    operationsCount: validated.operations.length,
    source: 'local_semantic',
  };
}

/**
 * Intelligent local semantic parser that matches common design requests.
 */
export function interpretPromptLocally(
  prompt: string,
  project: MoppleProject,
  selectedId?: string
): MoppleOperation[] {
  const p = prompt.toLowerCase();
  const ops: MoppleOperation[] = [];
  const rooms = project.building.rooms;
  const objects = project.interior.objects;

  // Helper to find target room from text or selection
  function findTargetRoom(): MoppleRoom | undefined {
    if (selectedId) {
      const room = rooms.find(r => r.id === selectedId);
      if (room) return room;
      const obj = objects.find(o => o.id === selectedId);
      if (obj) {
        const parentRoom = rooms.find(r => r.id === obj.roomId);
        if (parentRoom) return parentRoom;
      }
    }
    if (p.includes('bedroom')) return rooms.find(r => r.type === 'bedroom' || r.name.toLowerCase().includes('bedroom'));
    if (p.includes('kitchen')) return rooms.find(r => r.type === 'kitchen' || r.name.toLowerCase().includes('kitchen'));
    if (p.includes('living')) return rooms.find(r => r.type === 'living_room' || r.name.toLowerCase().includes('living'));
    if (p.includes('bath')) return rooms.find(r => r.type === 'bathroom' || r.name.toLowerCase().includes('bath'));
    if (p.includes('office')) return rooms.find(r => r.type === 'office' || r.name.toLowerCase().includes('office'));
    if (p.includes('dining')) return rooms.find(r => r.type === 'dining_room' || r.name.toLowerCase().includes('dining'));
    return rooms[0];
  }

  // 1. LIGHTING & COZY / ATMOSPHERE REVISIONS
  if (p.includes('lighting') || p.includes('sunset') || p.includes('evening') || p.includes('night') || p.includes('daylight') || p.includes('mood') || p.includes('cozy') || p.includes('warm') || p.includes('hygge') || p.includes('bright')) {
    if (p.includes('evening') || p.includes('sunset') || p.includes('warm') || p.includes('cozy') || p.includes('hygge')) {
      const lights: MoppleLight[] = [
        { id: 'light_ambient', type: 'ambient', color: '#ffb370', intensity: 0.85 },
        { id: 'light_sun', type: 'directional', color: '#ff8c3b', intensity: 2.2, position: { x: -8, y: 3, z: 6 }, target: { x: 0, y: 0, z: 0 } },
        { id: 'light_living_p1', type: 'point', color: '#ffe4b5', intensity: 2.5, position: { x: -2, y: 2.1, z: 1.5 }, range: 7 },
        { id: 'light_bed_p1', type: 'point', color: '#ffd299', intensity: 1.8, position: { x: 3.1, y: 1.8, z: -2 }, range: 5 },
      ];
      ops.push({ type: 'update_lighting', lights });

      // If cozy requested, also add soft styling
      if (p.includes('cozy') || p.includes('hygge')) {
        const room = findTargetRoom() || rooms[0];
        if (room) {
          ops.push({ type: 'change_room_style', targetId: room.id, style: 'warm cozy' });
        }
      }
      return ops;
    }
    if (p.includes('night') || p.includes('dark')) {
      const lights: MoppleLight[] = [
        { id: 'light_ambient', type: 'ambient', color: '#1a2b3c', intensity: 0.3 },
        { id: 'light_moon', type: 'directional', color: '#88a4c8', intensity: 0.6, position: { x: 5, y: 10, z: -5 }, target: { x: 0, y: 0, z: 0 } },
        { id: 'light_living_lamp', type: 'point', color: '#ffeaad', intensity: 3.0, position: { x: -2, y: 1.5, z: 1.5 }, range: 6 },
        { id: 'light_kitchen_accent', type: 'point', color: '#ffffff', intensity: 2.0, position: { x: -1.5, y: 2.2, z: -2.5 }, range: 5 },
      ];
      return [{ type: 'update_lighting', lights }];
    }
    // Default bright daylight
    const lights: MoppleLight[] = [
      { id: 'light_ambient', type: 'ambient', color: '#f5f7fa', intensity: 1.6 },
      { id: 'light_sun', type: 'directional', color: '#fff8ea', intensity: 3.8, position: { x: -4, y: 12, z: 7 }, target: { x: 0, y: 0, z: 0 } },
    ];
    return [{ type: 'update_lighting', lights }];
  }

  // 2. ROOM RESIZING / EXPANDING
  if (p.includes('larger') || p.includes('bigger') || p.includes('expand') || p.includes('enlarge') || p.includes('smaller') || p.includes('shrink')) {
    const room = findTargetRoom();
    if (room) {
      const poly = roomPolygon(project, room);
      const xs = poly.map(v => v.x), zs = poly.map(v => v.z);
      const curW = Math.max(...xs) - Math.min(...xs);
      const curD = Math.max(...zs) - Math.min(...zs);

      // Check if exact delta is mentioned, e.g. "by 1m" or "by 0.5"
      const deltaMatch = p.match(/by\s+([0-9.]+)\s*m?/);
      const delta = deltaMatch ? parseFloat(deltaMatch[1]) : 1.0;

      const isShrink = p.includes('smaller') || p.includes('shrink');
      const multiplier = isShrink ? -1 : 1;

      // New dimensions (clamped to positive reasonable bounds)
      const newW = Math.max(2.0, Math.round((curW + delta * multiplier) * 10) / 10);
      const newD = Math.max(2.0, Math.round((curD + delta * multiplier) * 10) / 10);

      return [{ type: 'resize_room', targetId: room.id, width: newW, depth: newD }];
    }
  }

  // 3. MATERIAL & COLOR CHANGES
  if (p.includes('floor') || p.includes('flooring') || p.includes('wood') || p.includes('oak') || p.includes('marble') || p.includes('tile') || p.includes('plaster') || p.includes('wall') || p.includes('paint') || p.includes('color') || p.includes('blue') || p.includes('white') || p.includes('green') || p.includes('black') || p.includes('grey') || p.includes('gray')) {
    const room = findTargetRoom() || rooms[0];
    let matId = 'mat_custom_' + Date.now().toString(36).slice(-4);
    let newMat: MoppleMaterial | null = null;
    const isWall = p.includes('wall') || p.includes('paint') || p.includes('blue') || p.includes('green') || p.includes('black');

    if (p.includes('dark oak') || p.includes('walnut') || p.includes('dark wood')) {
      matId = 'mat_dark_oak';
      newMat = { id: matId, name: 'Dark Oak Flooring', kind: 'flooring', color: '#4a3525', roughness: 0.65, metalness: 0.05, opacity: 1 };
    } else if (p.includes('oak') || p.includes('light wood') || p.includes('parquet')) {
      matId = 'mat_light_oak';
      newMat = { id: matId, name: 'Natural Oak', kind: 'flooring', color: '#c4a67e', roughness: 0.7, metalness: 0.05, opacity: 1 };
    } else if (p.includes('marble') || p.includes('stone')) {
      matId = 'mat_white_marble';
      newMat = { id: matId, name: 'Carrara Marble', kind: 'stone', color: '#eae9e5', roughness: 0.25, metalness: 0.1, opacity: 1 };
    } else if (p.includes('tile') || p.includes('ceramic')) {
      matId = 'mat_ceramic_tiles';
      newMat = { id: matId, name: 'Slate Ceramic Tiles', kind: 'flooring', color: '#596063', roughness: 0.5, metalness: 0.1, opacity: 1 };
    } else if (p.includes('blue')) {
      matId = 'mat_blue_paint';
      newMat = { id: matId, name: 'Nordic Blue Plaster', kind: 'paint', color: '#3a5975', roughness: 0.85, metalness: 0.0, opacity: 1 };
    } else if (p.includes('sage') || p.includes('green')) {
      matId = 'mat_sage_paint';
      newMat = { id: matId, name: 'Sage Plaster', kind: 'paint', color: '#829987', roughness: 0.85, metalness: 0.0, opacity: 1 };
    } else if (p.includes('terracotta')) {
      matId = 'mat_terracotta';
      newMat = { id: matId, name: 'Terracotta Tiles', kind: 'flooring', color: '#b86644', roughness: 0.75, metalness: 0.0, opacity: 1 };
    } else if (p.includes('black') || p.includes('dark') || p.includes('charcoal')) {
      matId = 'mat_charcoal_paint';
      newMat = { id: matId, name: 'Charcoal Finish', kind: 'paint', color: '#252e2b', roughness: 0.85, metalness: 0.0, opacity: 1 };
    } else {
      matId = 'mat_fresh_plaster';
      newMat = { id: matId, name: 'Warm White Plaster', kind: 'paint', color: '#f3efe6', roughness: 0.8, metalness: 0.0, opacity: 1 };
    }

    if (newMat) {
      ops.push({ type: 'change_material', material: newMat });
      if (room) {
        ops.push({
          type: 'update_room',
          targetId: room.id,
          changes: {
            materials: {
              ...room.materials,
              [isWall ? 'wall' : 'floor']: matId,
            },
          },
        });
      }
      return ops;
    }
  }

  // 4. FURNITURE SWAPPING / REPLACEMENT
  const replaceMatch = p.match(/\b(?:replace|swap)\s+(?:the\s+)?([a-z0-9_\s]+?)\s+with\s+(?:a\s+|an\s+)?([a-z0-9_\s]+)/i);
  if (replaceMatch) {
    const oldKind = findMentionedFurnitureKind(replaceMatch[1]) || normalizeFurnitureKind(replaceMatch[1]);
    const newKind = findMentionedFurnitureKind(replaceMatch[2]) || normalizeFurnitureKind(replaceMatch[2]);
    const targetObj = objects.find(o => (oldKind && o.kind === oldKind) || (oldKind && o.assetId.toLowerCase().includes(oldKind)));
    if (targetObj && newKind) {
      ops.push({ type: 'remove_object', targetId: targetObj.id });
      ops.push({
        type: 'add_object',
        object: {
          id: `object_${newKind}_${Date.now().toString(36).slice(-4)}`,
          assetId: `${newKind}_modern`,
          kind: newKind,
          roomId: targetObj.roomId,
          position: { ...targetObj.position },
          rotation: { ...targetObj.rotation },
          scale: { x: 1, y: 1, z: 1 },
        },
      });
      return ops;
    }
  }

  // 5. ROTATE / TURN FURNITURE
  if (p.includes('rotate') || p.includes('turn')) {
    const matchKind = findMentionedFurnitureKind(p);
    const targetObj = matchKind
      ? objects.find(o => o.kind === matchKind)
      : (selectedId ? objects.find(o => o.id === selectedId) : objects[0]);
    if (targetObj) {
      const curRotY = targetObj.rotation?.y || 0;
      return [{
        type: 'move_object',
        targetId: targetObj.id,
        position: { ...targetObj.position },
        rotation: { x: 0, y: curRotY + Math.PI / 2, z: 0 },
      }];
    }
  }

  // 6. REMOVE FURNITURE
  if (/\b(?:remove|delete|clear)\b/i.test(p)) {
    const matchKind = findMentionedFurnitureKind(p);
    if (matchKind) {
      const targetObj = objects.find(o => o.kind === matchKind);
      if (targetObj) {
        return [{ type: 'remove_object', targetId: targetObj.id }];
      }
    }
  }

  // 7. ADD FURNITURE (with count support, e.g. "add 2 chairs")
  const matchKind = findMentionedFurnitureKind(p);
  if (matchKind && !/\b(?:remove|delete|clear)\b/i.test(p)) {
    const room = findTargetRoom() || rooms[0];
    const poly = room ? roomPolygon(project, room) : [];
    let baseX = 0, baseZ = 0;
    if (poly.length > 0) {
      const xs = poly.map(v => v.x), zs = poly.map(v => v.z);
      baseX = (Math.min(...xs) + Math.max(...xs)) / 2;
      baseZ = (Math.min(...zs) + Math.max(...zs)) / 2;
    }

    const count = parseCount(p);
    for (let i = 0; i < count; i++) {
      const offsetX = (i - (count - 1) / 2) * 0.7 + (Math.random() - 0.5) * 0.2;
      const offsetZ = (Math.random() - 0.5) * 0.4;
      ops.push({
        type: 'add_object',
        object: {
          id: `object_${matchKind}_${Date.now().toString(36).slice(-4)}_${i}`,
          assetId: `${matchKind}_custom`,
          kind: matchKind,
          roomId: room ? room.id : rooms[0].id,
          position: { x: Math.round((baseX + offsetX) * 10) / 10, y: 0, z: Math.round((baseZ + offsetZ) * 10) / 10 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      });
    }
    return ops;
  }

  // 8. WHOLE HOUSE / ARCHITECTURAL STYLES
  if (p.includes('house') || p.includes('apartment') || p.includes('villa') || p.includes('design') || p.includes('create') || p.includes('build') || p.includes('style') || p.includes('scandinavian') || p.includes('minimal') || p.includes('japandi') || p.includes('industrial') || p.includes('modern')) {
    const styleName = p.includes('scandinavian') ? 'scandinavian'
      : p.includes('japandi') ? 'japandi'
      : p.includes('industrial') ? 'industrial'
      : p.includes('minimal') ? 'minimalist'
      : 'modern architectural';

    for (const room of rooms) {
      ops.push({ type: 'change_room_style', targetId: room.id, style: styleName });
    }
    return ops;
  }

  return ops;
}

const countMap: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
function parseCount(text: string): number {
  const m = text.match(/\b(one|two|three|four|five|six|\d+)\b/);
  if (!m) return 1;
  const num = parseInt(m[1], 10);
  return Number.isFinite(num) && num > 0 && num <= 8 ? num : (countMap[m[1]] || 1);
}

function normalizeFurnitureKind(text: string): MoppleInteriorObject['kind'] | null {
  const t = text.toLowerCase().trim();
  if (t.includes('sofa') || t.includes('couch') || t.includes('sectional')) return 'sofa';
  if (t.includes('bed')) return 'bed';
  if (t.includes('table') || t.includes('desk')) return 'table';
  if (t.includes('chair') || t.includes('armchair') || t.includes('stool')) return 'chair';
  if (t.includes('cabinet') || t.includes('wardrobe') || t.includes('shelf') || t.includes('sideboard') || t.includes('cupboard') || t.includes('credenza')) return 'cabinet';
  if (t.includes('lamp') || t.includes('light') || t.includes('chandelier')) return 'lamp';
  if (t.includes('appliance') || t.includes('stove') || t.includes('fridge') || t.includes('sink') || t.includes('oven')) return 'appliance';
  if (t.includes('plant') || t.includes('flower') || t.includes('tree') || t.includes('decor') || t.includes('rug') || t.includes('carpet') || t.includes('art')) return 'decoration';
  return null;
}

function findMentionedFurnitureKind(text: string): MoppleInteriorObject['kind'] | null {
  const t = text.toLowerCase();
  const kinds: MoppleInteriorObject['kind'][] = ['sofa', 'bed', 'table', 'chair', 'cabinet', 'lamp', 'appliance', 'decoration'];
  for (const kind of kinds) {
    if (t.includes(kind)) return kind;
  }
  if (t.includes('plant') || t.includes('plants') || t.includes('flower') || t.includes('tree') || t.includes('rug') || t.includes('carpet')) return 'decoration';
  if (t.includes('desk')) return 'table';
  if (t.includes('couch') || t.includes('sectional')) return 'sofa';
  if (t.includes('stove') || t.includes('sink') || t.includes('fridge') || t.includes('oven')) return 'appliance';
  if (t.includes('stool') || t.includes('armchair') || t.includes('seat')) return 'chair';
  if (t.includes('wardrobe') || t.includes('shelf') || t.includes('sideboard') || t.includes('credenza')) return 'cabinet';
  return null;
}

/**
 * Robust sanitizer that cleans and validates LLM API operations (NVIDIA NIM / GLM / Gemini) against Mopple Schema.
 */
export function sanitizeOperations(raw: any, project: MoppleProject): MoppleOperations {
  let list: any[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && Array.isArray(raw.operations)) {
    list = raw.operations;
  } else if (raw && typeof raw === 'object') {
    const arrayKey = Object.keys(raw).find(k => Array.isArray(raw[k]));
    if (arrayKey) list = raw[arrayKey];
  }

  const cleanOps: MoppleOperation[] = [];
  const rooms = project.building.rooms;
  const objects = project.interior.objects;

  for (const item of list) {
    if (!item || typeof item !== 'object' || typeof item.type !== 'string') continue;

    const type = item.type;

    if (type === 'add_object') {
      const o = item.object;
      if (!o || typeof o !== 'object') continue;

      const validKinds = ['sofa', 'bed', 'table', 'chair', 'cabinet', 'lamp', 'decoration', 'appliance'];
      let kind = validKinds.includes(o.kind) ? o.kind : normalizeFurnitureKind(String(o.kind || 'sofa'));
      if (!kind) kind = 'sofa';

      let roomId = String(o.roomId || '');
      if (!rooms.some(r => r.id === roomId)) {
        const found = rooms.find(r => r.name.toLowerCase().includes(roomId.toLowerCase()) || r.type.includes(roomId.toLowerCase()));
        roomId = found ? found.id : rooms[0].id;
      }

      const id = String(o.id || `object_${kind}_${Date.now().toString(36).slice(-4)}`).replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[^A-Za-z]/, 'obj_$&');
      const assetId = String(o.assetId || `${kind}_item`).replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[^A-Za-z]/, 'asset_$&');

      cleanOps.push({
        type: 'add_object',
        object: {
          id,
          assetId,
          roomId,
          kind,
          position: {
            x: Number(o.position?.x) || 0,
            y: Number(o.position?.y) || 0,
            z: Number(o.position?.z) || 0,
          },
          rotation: {
            x: Number(o.rotation?.x) || 0,
            y: Number(o.rotation?.y) || 0,
            z: Number(o.rotation?.z) || 0,
          },
          scale: {
            x: Math.max(0.1, Number(o.scale?.x) || 1),
            y: Math.max(0.1, Number(o.scale?.y) || 1),
            z: Math.max(0.1, Number(o.scale?.z) || 1),
          },
        },
      });
    } else if (type === 'resize_room') {
      let targetId = String(item.targetId || '');
      if (!rooms.some(r => r.id === targetId)) {
        const found = rooms.find(r => r.name.toLowerCase().includes(targetId.toLowerCase()) || r.type.includes(targetId.toLowerCase()));
        targetId = found ? found.id : rooms[0].id;
      }
      const width = Math.max(1, Number(item.width) || 4);
      const depth = Math.max(1, Number(item.depth) || 4);
      cleanOps.push({ type: 'resize_room', targetId, width, depth });
    } else if (type === 'remove_object') {
      let targetId = String(item.targetId || '');
      if (!objects.some(o => o.id === targetId)) {
        const found = objects.find(o => o.kind === targetId || o.assetId.toLowerCase().includes(targetId.toLowerCase()));
        if (found) targetId = found.id;
      }
      if (objects.some(o => o.id === targetId)) {
        cleanOps.push({ type: 'remove_object', targetId });
      }
    } else if (type === 'move_object') {
      let targetId = String(item.targetId || '');
      if (!objects.some(o => o.id === targetId)) {
        const found = objects.find(o => o.kind === targetId || o.assetId.toLowerCase().includes(targetId.toLowerCase()));
        if (found) targetId = found.id;
      }
      if (objects.some(o => o.id === targetId)) {
        cleanOps.push({
          type: 'move_object',
          targetId,
          position: {
            x: Number(item.position?.x) || 0,
            y: Number(item.position?.y) || 0,
            z: Number(item.position?.z) || 0,
          },
          rotation: item.rotation ? {
            x: Number(item.rotation.x) || 0,
            y: Number(item.rotation.y) || 0,
            z: Number(item.rotation.z) || 0,
          } : undefined,
          roomId: item.roomId && rooms.some(r => r.id === item.roomId) ? item.roomId : undefined,
        });
      }
    } else if (type === 'change_material') {
      const m = item.material;
      if (m && typeof m === 'object') {
        const id = String(m.id || 'mat_custom').replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[^A-Za-z]/, 'mat_$&');
        const validKinds = ['paint', 'wood', 'stone', 'glass', 'metal', 'flooring', 'fabric', 'custom'];
        const kind = validKinds.includes(m.kind) ? m.kind : 'paint';
        const color = typeof m.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : '#e0dbcf';
        cleanOps.push({
          type: 'change_material',
          material: {
            id,
            name: String(m.name || 'Custom Material'),
            kind,
            color,
            roughness: Math.max(0, Math.min(1, Number(m.roughness) ?? 0.8)),
            metalness: Math.max(0, Math.min(1, Number(m.metalness) ?? 0.0)),
            opacity: Math.max(0, Math.min(1, Number(m.opacity) ?? 1.0)),
          },
        });
      }
    } else if (type === 'update_room') {
      let targetId = String(item.targetId || '');
      if (!rooms.some(r => r.id === targetId)) {
        const found = rooms.find(r => r.name.toLowerCase().includes(targetId.toLowerCase()) || r.type.includes(targetId.toLowerCase()));
        targetId = found ? found.id : rooms[0].id;
      }
      cleanOps.push({
        type: 'update_room',
        targetId,
        changes: item.changes || {},
      });
    } else if (type === 'change_room_style') {
      let targetId = String(item.targetId || '');
      if (!rooms.some(r => r.id === targetId)) {
        const found = rooms.find(r => r.name.toLowerCase().includes(targetId.toLowerCase()) || r.type.includes(targetId.toLowerCase()));
        targetId = found ? found.id : rooms[0].id;
      }
      cleanOps.push({
        type: 'change_room_style',
        targetId,
        style: String(item.style || 'modern'),
      });
    } else if (type === 'update_lighting') {
      if (Array.isArray(item.lights) && item.lights.length > 0) {
        cleanOps.push({ type: 'update_lighting', lights: item.lights });
      }
    }
  }

  return validateOperations({ operations: cleanOps });
}

export const sanitizeGeminiOperations = sanitizeOperations;

/**
 * Direct NVIDIA NIM API integration supporting GLM 5.3 Flash (z-ai/glm-5.3-flash)
 */
async function callNvidiaNimApi(
  prompt: string,
  project: MoppleProject,
  apiKey: string,
  selectedId?: string,
  modelName = getStoredModel()
): Promise<{ operations: MoppleOperations; modelUsed: string }> {
  const systemInstruction = `You are Mopple AI, an architectural home design copilot powered by GLM 5.3 Flash on NVIDIA NIM.
You receive a user design instruction and the current Mopple project JSON.
You must return ONLY a valid JSON object matching:
{
  "operations": [ ...MoppleOperation ]
}
Valid operation types:
- "resize_room": { "type": "resize_room", "targetId": "<room_id>", "width": <number>, "depth": <number> }
- "add_object": { "type": "add_object", "object": { "id": "<id>", "assetId": "<string>", "kind": "sofa"|"bed"|"table"|"chair"|"cabinet"|"lamp"|"decoration"|"appliance", "roomId": "<room_id>", "position": {"x":0,"y":0,"z":0}, "rotation": {"x":0,"y":0,"z":0}, "scale": {"x":1,"y":1,"z":1} } }
- "move_object": { "type": "move_object", "targetId": "<id>", "position": {"x":0,"y":0,"z":0}, "rotation": {"x":0,"y":0,"z":0} }
- "remove_object": { "type": "remove_object", "targetId": "<id>" }
- "change_material": { "type": "change_material", "material": { "id": "<id>", "name": "<name>", "kind": "paint"|"wood"|"stone"|"glass"|"metal"|"flooring"|"fabric"|"custom", "color": "#rrggbb", "roughness": 0..1, "metalness": 0..1, "opacity": 0..1 } }
- "update_room": { "type": "update_room", "targetId": "<room_id>", "changes": { "materials": { "floor": "<mat_id>", "wall": "<mat_id>" } } }
- "change_room_style": { "type": "change_room_style", "targetId": "<room_id>", "style": "<string>" }
- "update_lighting": { "type": "update_lighting", "lights": [ ... ] }

Selected entity ID (if any): ${selectedId ?? 'none'}.
Return strictly pure JSON with NO markdown code fences or backticks.`;

  const activeModel = modelName || DEFAULT_AI_MODEL;
  const userContent = `User request: "${prompt}"\nCurrent Project Summary:\nRooms: ${JSON.stringify(project.building.rooms.map(r => ({ id: r.id, name: r.name, type: r.type })))}\nObjects: ${JSON.stringify(project.interior.objects.map(o => ({ id: o.id, kind: o.kind, roomId: o.roomId })))}`;

  const body = {
    model: activeModel,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
  };

  const endpoint = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorDetail = errorText;
    try {
      const errObj = JSON.parse(errorText);
      if (errObj.error?.message) errorDetail = errObj.error.message;
    } catch {}

    if (response.status === 401) {
      throw new Error(`(401) Invalid or unauthorized NVIDIA NIM API key. Please check your nvapi- key from build.nvidia.com.`);
    }
    if (response.status === 403) {
      throw new Error(`(403) Forbidden. Your NVIDIA NIM API key lacks permissions for model "${activeModel}".`);
    }
    if (response.status === 429) {
      throw new Error(`(429) Rate limit reached on NVIDIA NIM. Please wait a moment and try again.`);
    }
    throw new Error(`(${response.status}) ${errorDetail}`);
  }

  const data = await response.json();
  let text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('No response text received from NVIDIA NIM API');

  // Strip <think>...</think> tags if reasoning tokens are emitted
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const jsonStr = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    const start = jsonStr.indexOf('{') !== -1 ? jsonStr.indexOf('{') : jsonStr.indexOf('[');
    const end = jsonStr.lastIndexOf('}') !== -1 ? jsonStr.lastIndexOf('}') : jsonStr.lastIndexOf(']');
    if (start !== -1 && end > start) {
      parsed = JSON.parse(jsonStr.substring(start, end + 1));
    } else {
      throw new Error('Could not parse valid JSON from NVIDIA NIM output');
    }
  }

  return { operations: sanitizeOperations(parsed, project), modelUsed: activeModel };
}
