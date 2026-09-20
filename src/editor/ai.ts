import type { MoppleProjectEngine } from '../project/engine.ts';
import { roomPolygon } from '../project/geometry.ts';
import type { MoppleOperation, MoppleOperations } from '../project/operations.ts';
import { validateOperations } from '../project/operations.ts';
import type { MoppleInteriorObject, MoppleLight, MoppleMaterial, MoppleProject, MoppleRoom } from '../project/schema.ts';

export interface AIExecutionResult {
  success: boolean;
  message: string;
  operationsCount: number;
  source: 'gemini_3_1_pro' | 'gemini' | 'local_semantic';
  model?: string;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-pro-preview';
const GEMINI_API_KEY_STORAGE = 'mopple_gemini_api_key';
const GEMINI_MODEL_STORAGE = 'mopple_gemini_model';

export function getStoredApiKey(): string {
  return localStorage.getItem(GEMINI_API_KEY_STORAGE) || '';
}

export function setStoredApiKey(key: string): void {
  if (!key) {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE);
  } else {
    localStorage.setItem(GEMINI_API_KEY_STORAGE, key.trim());
  }
}

export function getStoredModel(): string {
  return localStorage.getItem(GEMINI_MODEL_STORAGE) || DEFAULT_GEMINI_MODEL;
}

export function setStoredModel(model: string): void {
  if (!model) {
    localStorage.removeItem(GEMINI_MODEL_STORAGE);
  } else {
    localStorage.setItem(GEMINI_MODEL_STORAGE, model.trim());
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

  // If API key is provided, attempt Gemini API call first
  if (apiKey) {
    try {
      const result = await callGeminiApi(cleanPrompt, engine.getSnapshot(), apiKey, selectedId, requestedModel);
      if (result && result.operations && result.operations.operations.length > 0) {
        engine.applyOperations(result.operations);
        const is31Pro = result.modelUsed.includes('3.1-pro') || result.modelUsed.includes('3-pro');
        return {
          success: true,
          message: `Executed ${result.operations.operations.length} operation(s) via ${is31Pro ? 'Gemini 3.1 Pro' : 'Gemini'} (${result.modelUsed})`,
          operationsCount: result.operations.operations.length,
          source: is31Pro ? 'gemini_3_1_pro' : 'gemini',
          model: result.modelUsed,
        };
      }
    } catch (err) {
      console.warn('Gemini API call failed, falling back to local semantic engine:', err);
      // Fall through to local semantic engine
    }
  }

  // Local semantic natural language interpreter
  const operations = interpretPromptLocally(cleanPrompt, engine.getSnapshot(), selectedId);
  if (!operations || operations.length === 0) {
    throw new Error(`Could not determine operations for: "${cleanPrompt}". Try asking to resize a room, replace furniture, change materials, or update lighting.`);
  }

  const validated = validateOperations({ operations });
  engine.applyOperations(validated);

  return {
    success: true,
    message: `Applied ${validated.operations.length} change(s) seamlessly`,
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

  // 1. LIGHTING REVISIONS
  if (p.includes('lighting') || p.includes('sunset') || p.includes('evening') || p.includes('night') || p.includes('daylight') || p.includes('mood')) {
    if (p.includes('evening') || p.includes('sunset') || p.includes('warm')) {
      const lights: MoppleLight[] = [
        { id: 'light_ambient', type: 'ambient', color: '#ffb370', intensity: 0.8 },
        { id: 'light_sun', type: 'directional', color: '#ff8c3b', intensity: 2.2, position: { x: -8, y: 3, z: 6 }, target: { x: 0, y: 0, z: 0 } },
        { id: 'light_living_p1', type: 'point', color: '#ffe4b5', intensity: 2.5, position: { x: -2, y: 2.1, z: 1.5 }, range: 7 },
        { id: 'light_bed_p1', type: 'point', color: '#ffd299', intensity: 1.8, position: { x: 3.1, y: 1.8, z: -2 }, range: 5 },
      ];
      return [{ type: 'update_lighting', lights }];
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

  // 3. MATERIAL CHANGES
  if (p.includes('floor') || p.includes('flooring') || p.includes('wood') || p.includes('oak') || p.includes('marble') || p.includes('tile') || p.includes('plaster') || p.includes('wall color') || p.includes('paint')) {
    const room = findTargetRoom() || rooms[0];
    let matId = 'mat_custom_' + Date.now().toString(36).slice(-4);
    let newMat: MoppleMaterial | null = null;

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
    } else if (p.includes('sage') || p.includes('green')) {
      matId = 'mat_sage_paint';
      newMat = { id: matId, name: 'Sage Plaster', kind: 'paint', color: '#829987', roughness: 0.85, metalness: 0.0, opacity: 1 };
    } else if (p.includes('terracotta')) {
      matId = 'mat_terracotta';
      newMat = { id: matId, name: 'Terracotta Tiles', kind: 'flooring', color: '#b86644', roughness: 0.75, metalness: 0.0, opacity: 1 };
    } else {
      matId = 'mat_fresh_plaster';
      newMat = { id: matId, name: 'Warm White Plaster', kind: 'paint', color: '#f3efe6', roughness: 0.8, metalness: 0.0, opacity: 1 };
    }

    if (newMat) {
      ops.push({ type: 'change_material', material: newMat });
      const isWall = p.includes('wall') || p.includes('paint');
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
  // Example: "replace the sofa with a dining table" or "swap sofa with table"
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

  // 5. REMOVE FURNITURE
  // Example: "remove sofa", "delete the bed", "remove table"
  if (/\b(?:remove|delete|clear)\b/i.test(p)) {
    const matchKind = findMentionedFurnitureKind(p);
    if (matchKind) {
      const targetObj = objects.find(o => o.kind === matchKind);
      if (targetObj) {
        return [{ type: 'remove_object', targetId: targetObj.id }];
      }
    }
  }

  // 6. ADD FURNITURE
  // Example: "add a sofa", "add a plant", "add dining table", "place a chair"
  if (/\b(?:add|place|insert|put)\b/i.test(p)) {
    const matchKind = findMentionedFurnitureKind(p);
    if (matchKind) {
      const room = findTargetRoom() || rooms[0];
      const poly = room ? roomPolygon(project, room) : [];
      let posX = 0, posZ = 0;
      if (poly.length > 0) {
        const xs = poly.map(v => v.x), zs = poly.map(v => v.z);
        posX = (Math.min(...xs) + Math.max(...xs)) / 2;
        posZ = (Math.min(...zs) + Math.max(...zs)) / 2;
      }
      // Add slight random offset so multiple items don't overlap exactly
      posX += (Math.random() - 0.5) * 0.8;
      posZ += (Math.random() - 0.5) * 0.8;

      return [{
        type: 'add_object',
        object: {
          id: `object_${matchKind}_${Date.now().toString(36).slice(-4)}`,
          assetId: `${matchKind}_custom`,
          kind: matchKind,
          roomId: room ? room.id : rooms[0].id,
          position: { x: Math.round(posX * 10) / 10, y: 0, z: Math.round(posZ * 10) / 10 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      }];
    }
  }

  // 7. STYLE CHANGE
  // Example: "make it scandinavian", "minimalist style", "japanese modern"
  if (p.includes('style') || p.includes('scandinavian') || p.includes('minimal') || p.includes('japandi') || p.includes('industrial')) {
    const room = findTargetRoom() || rooms[0];
    const styleName = p.includes('scandinavian') ? 'scandinavian'
      : p.includes('japandi') ? 'japandi'
      : p.includes('industrial') ? 'industrial'
      : p.includes('minimal') ? 'minimalist'
      : 'modern';
    if (room) {
      return [{ type: 'change_room_style', targetId: room.id, style: styleName }];
    }
  }

  return ops;
}

function normalizeFurnitureKind(text: string): MoppleInteriorObject['kind'] | null {
  const t = text.toLowerCase().trim();
  if (t.includes('sofa') || t.includes('couch')) return 'sofa';
  if (t.includes('bed')) return 'bed';
  if (t.includes('table') || t.includes('desk')) return 'table';
  if (t.includes('chair') || t.includes('armchair') || t.includes('stool')) return 'chair';
  if (t.includes('cabinet') || t.includes('wardrobe') || t.includes('shelf') || t.includes('sideboard')) return 'cabinet';
  if (t.includes('lamp') || t.includes('light')) return 'lamp';
  if (t.includes('appliance') || t.includes('stove') || t.includes('fridge') || t.includes('sink')) return 'appliance';
  if (t.includes('plant') || t.includes('decor') || t.includes('rug') || t.includes('art')) return 'decoration';
  return null;
}

function findMentionedFurnitureKind(text: string): MoppleInteriorObject['kind'] | null {
  const t = text.toLowerCase();
  const kinds: MoppleInteriorObject['kind'][] = ['sofa', 'bed', 'table', 'chair', 'cabinet', 'lamp', 'appliance', 'decoration'];
  for (const kind of kinds) {
    if (t.includes(kind)) return kind;
  }
  if (t.includes('plant') || t.includes('rug')) return 'decoration';
  if (t.includes('desk')) return 'table';
  if (t.includes('couch')) return 'sofa';
  if (t.includes('stove') || t.includes('sink')) return 'appliance';
  return null;
}

/**
 * Direct Gemini API Integration supporting Gemini 3.1 Pro
 */
async function callGeminiApi(
  prompt: string,
  project: MoppleProject,
  apiKey: string,
  selectedId?: string,
  modelName = getStoredModel()
): Promise<{ operations: MoppleOperations; modelUsed: string }> {
  const systemInstruction = `
You are Mopple AI, an architectural home design copilot powered by Gemini 3.1 Pro.
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
Return strictly pure JSON with NO markdown code fences or backticks.
`;

  const body = {
    contents: [
      {
        parts: [
          { text: `User request: "${prompt}"\nCurrent Project Summary:\nRooms: ${JSON.stringify(project.building.rooms.map(r => ({ id: r.id, name: r.name, type: r.type })))}\nObjects: ${JSON.stringify(project.interior.objects.map(o => ({ id: o.id, kind: o.kind, roomId: o.roomId })))}` },
        ],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  };

  let activeModel = modelName;
  let response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  // If initial model request fails with 404/not found and we requested gemini-3.1-pro-preview, try alias
  if (!response.ok && activeModel === 'gemini-3.1-pro-preview') {
    const fallbackModel = 'gemini-3-pro-preview';
    const altResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    if (altResponse.ok) {
      response = altResponse;
      activeModel = fallbackModel;
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response text from Gemini');

  const parsed = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
  return { operations: validateOperations(parsed), modelUsed: activeModel };
}
