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
export const DEFAULT_GEMINI_MODEL = DEFAULT_AI_MODEL;
let tabApiKey = '';
let migratedKey = false;
export function getStoredApiKey(): string {
  if (!migratedKey) {
    migratedKey = true;
    try {
      tabApiKey = localStorage.getItem('mopple_nim_api_key') || '';
      localStorage.removeItem('mopple_nim_api_key');
      localStorage.removeItem('mopple_gemini_api_key');
    } catch { /* Storage may be unavailable. */ }
  }
  return tabApiKey;
}
export function setStoredApiKey(key: string): void { getStoredApiKey(); tabApiKey = key.trim(); }
export function getStoredModel(): string {
  try { const m = localStorage.getItem('mopple_ai_model'); return m && !m.includes('gemini') ? m : DEFAULT_AI_MODEL; }
  catch { return DEFAULT_AI_MODEL; }
}
export function setStoredModel(model: string): void {
  try { localStorage.setItem('mopple_ai_model', model.trim()); } catch { /* Optional preference. */ }
}
const busyEngines = new WeakSet<MoppleProjectEngine>();
export async function executeAiPrompt(prompt: string, engine: MoppleProjectEngine, selectedId?: string): Promise<AIExecutionResult> {
  const text = prompt.trim();
  if (!text) throw new Error('Enter a design request first.');
  if (busyEngines.has(engine)) throw new Error('A request is already running. Wait for it to finish.');
  busyEngines.add(engine);
  try {
    const apiKey = getStoredApiKey(), model = getStoredModel(), revision = engine.revision;
    const project = engine.getSnapshot();
    let operations: MoppleOperations;
    let hosted = false, fallbackReason = '';
    try {
      let response: Response;
      try {
        response = await fetch('/api/ai/operations', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify({ prompt: text, project, selectedId, model, mode: isHouseRequest(text) ? 'GENERATE' : 'EDIT' }), signal: AbortSignal.timeout(95000),
        });
      } catch (error) {
        if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new Error('AI timed out. Your design is unchanged. Try a smaller request.');
        throw new Error('Cannot reach the AI service. Check your connection and run Mopple with its server. Your design is unchanged.');
      }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'AI endpoint unavailable. Start Mopple with npm run dev or npm start.';
        throw new Error(detail);
      }
      operations = sanitizeOperations(body, project); hosted = true;
    } catch (error) {
      fallbackReason = error instanceof Error ? error.message : 'Hosted AI unavailable';
      const interpreted = interpretPromptLocally(text, project, selectedId);
      if (!interpreted.length) throw new Error('Offline commands support creating a house, resizing a room, moving/adding furniture, materials and lighting. Rephrase the request or connect NVIDIA NIM.');
      operations = validateOperations({ operations: interpreted });
    }
    if (engine.revision !== revision) throw new Error('The project changed while AI was working. Nothing was applied; submit again using the current design.');
    if (operations.operations.some(o => o.type === 'create_house') && !isHouseRequest(text)) throw new Error('AI proposed replacing your house for an ordinary edit. Nothing was applied; rephrase the request.');
    engine.applyOperations(operations);
    return { success: true, message: `Applied ${operations.operations.length} operation(s)${hosted ? ` via ${model}` : ` offline. ${fallbackReason}`}. Undo is available.`, operationsCount: operations.operations.length, source: hosted ? 'nvidia_nim' : 'local_semantic', model: hosted ? model : undefined };
  } finally { busyEngines.delete(engine); }
}
export function isHouseRequest(text: string): boolean { if(/(?:i want|i need|i.d like|хочу|нужен|нужна|нужно|menga|kerak).*(?:home|house|apartment|дом|квартир|uy|xonadon)/i.test(text) || /(?:uy|xonadon).*(?:kerak)/i.test(text))return true; return /\b(create|generate|build|design)\b.*\b(house|home|apartment|villa)\b/i.test(text) || /(?:дом|квартир).*(?:созд|сдел|спроект)|(?:созд|сдел|спроект).*(?:дом|квартир)|(?:uy|xonadon|kvartira).*(?:yarat|qur|loyiha)|(?:yarat|qur|loyiha).*(?:uy|xonadon|kvartira)/i.test(text); }
const freshId = (prefix: string) => `${prefix}_${globalThis.crypto.randomUUID()}`;

/**
 * Intelligent local semantic parser that matches common design requests.
 */
export function interpretPromptLocally(
  prompt: string,
  project: MoppleProject,
  selectedId?: string
): MoppleOperation[] {
  const p = normalizePrompt(prompt);
  const ops: MoppleOperation[] = [];
  const rooms = project.building.rooms;
  const objects = project.interior.objects;

  if (isHouseRequest(prompt) || isHouseRequest(p)) {
    const number = (pattern: RegExp, fallback: number) => { const m = p.match(pattern); return m ? (countMap[m[1]] ?? Number(m[1])) : fallback; };
    if (/\b(?:[2-9]|two|three|four|five)\s*[- ]?(?:floors?|stor(?:ey|y|ies))\b/.test(p)) throw new Error('The offline house generator supports one floor. Use connected AI for a multi-floor design.');
    return [{ type: 'create_house', area: number(/(\d+(?:\.\d+)?)\s*(?:m²|m2|square meters?|sqm)/, 150), bedrooms: number(/(one|two|three|four|five|six|\d+)\s*[- ]?\s*bedrooms?/, 3), bathrooms: number(/(one|two|three|four|five|six|\d+)\s*[- ]?\s*bathrooms?/, 2), style: /minimal/.test(p) ? 'minimal' : 'modern' }];
  }
  function findTargetRoom(): MoppleRoom | undefined {
    const exact = rooms.filter(r => p.includes(r.name.toLowerCase()));
    if (exact.length === 1) return exact[0];
    const names: [RegExp, MoppleRoom['type']][] = [[/\bbedroom\b/, 'bedroom'], [/\bkitchen\b/, 'kitchen'], [/\bliving(?: room)?\b/, 'living_room'], [/\bbath(?:room)?\b/, 'bathroom'], [/\boffice\b/, 'office'], [/\bdining room\b/, 'dining_room']];
    for (const [pattern, type] of names) if (pattern.test(p)) {
      const matches = rooms.filter(r => r.type === type);
      const selected = matches.find(r => r.id === selectedId || objects.some(o => o.id === selectedId && o.roomId === r.id));
      if (selected) return selected;
      if (matches.length !== 1) throw new Error(`Name or select the specific ${type.replaceAll('_', ' ')} to edit.`);
      return matches[0];
    }
    return rooms.find(r => r.id === selectedId || objects.some(o => o.id === selectedId && o.roomId === r.id)) ?? rooms[0];
  }
  function findObject(kind: MoppleInteriorObject['kind'] | null) {
    const selected = objects.find(o => o.id === selectedId && (!kind || o.kind === kind));
    if (selected) return selected;
    let candidates = objects.filter(o => !kind || o.kind === kind);
    if (/\b(bedroom|kitchen|living|bathroom|office|dining room)\b/.test(p)) candidates = candidates.filter(o => o.roomId === findTargetRoom()?.id);
    if (candidates.length !== 1) throw new Error('Select the furniture item to change, then submit again.');
    return candidates[0];
  }
  if (/\bmove\b/.test(p)) {
    const obj = findObject(findMentionedFurnitureKind(p));
    const amount = Number(p.match(/(\d+(?:\.\d+)?)\s*(?:m|meters?)\b/)?.[1] ?? 1);
    const position = { ...obj.position };
    if (/\bleft\b/.test(p)) position.x -= amount;
    else if (/\bright\b/.test(p)) position.x += amount;
    else if (/\b(forward|north|up)\b/.test(p)) position.z -= amount;
    else if (/\b(back|backward|south|down)\b/.test(p)) position.z += amount;
    else throw new Error('Specify a direction and distance, for example “move the sofa 1m left”.');
    return [{ type: 'move_object', targetId: obj.id, position }];
  }

  // 1. LIGHTING & COZY / ATMOSPHERE REVISIONS
  if (!/\b(add|place|insert|move|replace|swap|remove|delete|rotate)\b/.test(p) && (p.includes('lighting') || p.includes('sunset') || p.includes('evening') || p.includes('night') || p.includes('daylight') || p.includes('mood') || p.includes('cozy') || p.includes('warm') || p.includes('hygge') || p.includes('bright'))) {
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

  const resizing = /\b(larger|bigger|expand|enlarge|smaller|shrink)\b/.test(p);
  const furnitureKind = findMentionedFurnitureKind(p);
  if (resizing && (furnitureKind || objects.some(o => o.id === selectedId)) && !/\b(room|bedroom|kitchen|bathroom)\b/.test(p)) {
    const object = findObject(furnitureKind);
    const shrink = /\b(smaller|shrink)\b/.test(p);
    const factor = 1 + (shrink ? -1 : 1) * Number(p.match(/(\d+(?:\.\d+)?)\s*%/)?.[1] ?? 20) / 100;
    return [{ type: 'scale_object', targetId: object.id, scale: { x: object.scale.x * factor, y: object.scale.y * factor, z: object.scale.z * factor } }];
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
  if (!/\b(add|place|insert|replace|swap|rotate|turn|remove|delete)\b/.test(p) && (p.includes('floor') || p.includes('flooring') || p.includes('wood') || p.includes('oak') || p.includes('marble') || p.includes('tile') || p.includes('plaster') || p.includes('wall') || p.includes('paint') || p.includes('color') || p.includes('blue') || p.includes('white') || p.includes('green') || p.includes('black') || p.includes('grey') || p.includes('gray'))) {
    if (findMentionedFurnitureKind(p)) throw new Error('Offline finishes edit rooms, not furniture. Name the room’s floor or walls, or connect NVIDIA NIM.');
    const room = findTargetRoom() || rooms[0];
    if (!room) throw new Error('Create a room before applying finishes.');
    let matId = freshId('mat');
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
      if (room && isWall) for (const edge of room.boundary) ops.push({ type: 'update_wall', targetId: edge.wallId, changes: { materialId: matId } });
      return ops;
    }
  }

  // 4. FURNITURE SWAPPING / REPLACEMENT
  const replaceMatch = p.match(/\b(?:replace|swap)\s+(?:the\s+)?([a-z0-9_\s]+?)\s+with\s+(?:a\s+|an\s+)?([a-z0-9_\s]+)/i);
  if (replaceMatch) {
    const oldKind = findMentionedFurnitureKind(replaceMatch[1]) || normalizeFurnitureKind(replaceMatch[1]);
    const newKind = findMentionedFurnitureKind(replaceMatch[2]) || normalizeFurnitureKind(replaceMatch[2]);
    const targetObj = findObject(oldKind);
    if (targetObj && newKind) {
      ops.push({ type: 'remove_object', targetId: targetObj.id });
      ops.push({
        type: 'add_object',
        object: {
          id: freshId(`object_${newKind}`),
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
    const targetObj = findObject(matchKind);
    if (targetObj) {
      const curRotY = targetObj.rotation?.y || 0;
      return [{
        type: 'move_object',
        targetId: targetObj.id,
        position: { ...targetObj.position },
        rotation: { x: 0, y: curRotY + Number(p.match(/(\d+(?:\.\d+)?)\s*(?:degrees?|°)/)?.[1] ?? 90) * Math.PI / 180, z: 0 },
      }];
    }
  }

  // 6. REMOVE FURNITURE
  if (/\b(?:remove|delete|clear)\b/i.test(p)) {
    const matchKind = findMentionedFurnitureKind(p);
    if (matchKind) {
      const targetObj = findObject(matchKind);
      if (targetObj) {
        return [{ type: 'remove_object', targetId: targetObj.id }];
      }
    }
  }

  // 7. ADD FURNITURE (with count support, e.g. "add 2 chairs")
  const matchKind = findMentionedFurnitureKind(p);
  if (matchKind && /\b(?:add|place|insert)\b/i.test(p)) {
    const room = findTargetRoom() || rooms[0];
    if (!room) throw new Error('Create a house or room before adding furniture.');
    const poly = roomPolygon(project, room);
    let baseX = 0, baseZ = 0;
    if (poly.length > 0) {
      const xs = poly.map(v => v.x), zs = poly.map(v => v.z);
      baseX = (Math.min(...xs) + Math.max(...xs)) / 2;
      baseZ = (Math.min(...zs) + Math.max(...zs)) / 2;
    }

    const count = parseCount(p);
    for (let i = 0; i < count; i++) {
      const offsetX = (i - (count - 1) / 2) * 0.7;
      const offsetZ = 0;
      ops.push({
        type: 'add_object',
        object: {
          id: freshId(`object_${matchKind}`),
          assetId: `${matchKind}_custom`,
          kind: matchKind,
          roomId: room.id,
          position: { x: Math.round((baseX + offsetX) * 10) / 10, y: project.building.floors.find(f => f.id === room.floorId)!.elevation, z: Math.round((baseZ + offsetZ) * 10) / 10 },
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

function normalizeFurnitureKind(text: string): MoppleInteriorObject['kind'] | null { return findMentionedFurnitureKind(text); }
function findMentionedFurnitureKind(text: string): MoppleInteriorObject['kind'] | null {
  const aliases: [MoppleInteriorObject['kind'], RegExp][] = [
    ['sofa', /\b(sofas?|couches?|sectionals?)\b/i], ['bed', /\bbeds?\b/i],
    ['table', /\b(tables?|desks?)\b/i], ['chair', /\b(chairs?|armchairs?|stools?)\b/i],
    ['cabinet', /\b(cabinets?|wardrobes?|shelves|shelf|sideboards?)\b/i], ['lamp', /\b(lamps?|chandeliers?)\b/i],
    ['appliance', /\b(appliances?|stoves?|fridges?|sinks?|ovens?)\b/i], ['decoration', /\b(decorations?|plants?|flowers?|trees?|rugs?|carpets?)\b/i],
  ];
  return aliases.find(([, regex]) => regex.test(text))?.[0] ?? null;
}

/** Strict model boundary: never guess IDs, omit failed edits or coerce invalid dimensions. */
export function sanitizeOperations(raw: unknown, _project: MoppleProject): MoppleOperations {
  return validateOperations(raw);
}
export const sanitizeGeminiOperations = sanitizeOperations;

export function normalizePrompt(prompt: string): string {
 let text = prompt.toLowerCase();
 const terms: [RegExp,string][] = [[/создай|создать|спроектируй|yarat|loyihala/g,'create'],[/квартиру|квартира|дом|xonadon|kvartira|\buy\b/g,'house'],[/спальни|спальнями|спальня|yotoq(?:xona)?/g,'bedrooms'],[/ванными|ванных|ванная|санузла|hammom/g,'bathrooms'],[/кв\.?\s*м|м²|м2|kvadrat metr/g,'sqm'],[/кухн[яю]|oshxona/g,'kitchen'],[/гостин[аяую]+|mehmonxona/g,'living room'],[/добавь|добавить|qo.sh/g,'add'],[/диван|divan/g,'sofa'],[/уютн[а-я]*|shinam/g,'cozy'],[/освещение|yorug.lik/g,'lighting'],[/бел[а-я]*|oq/g,'white'],[/стены|стен|devor/g,'walls'],[/полы|пол|pol/g,'floor']];
 for (const [pattern,value] of terms) text = text.replace(pattern, value);
 return text;
}
