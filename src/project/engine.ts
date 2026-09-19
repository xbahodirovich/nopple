import { CURRENT_VERSION, FORMAT, type MoppleDoor, type MoppleFloor, type MoppleInteriorObject, type MoppleLight, type MoppleMaterial, type MoppleProject, type MoppleRoom, type MoppleWall, type MoppleWindow, type Point, type Vector } from './schema.ts';
import { roomPolygon, samePoint } from './geometry.ts';
import { type MoppleOperation, validateOperations } from './operations.ts';
import { MoppleValidationError, parseProject, validateProject } from './validation.ts';

export interface EngineOptions {
  now?: () => string;
  onSubscriberError?: (error: unknown) => void;
}
type Listener = (project: MoppleProject) => void;
const nowISO = () => new Date().toISOString();
const reject = (id: string, message: string): never => { throw new MoppleValidationError([{ path: id, message }]); };
function find<T extends { id: string }>(items: T[], id: string): T {
  return items.find(item => item.id === id) ?? reject(id, 'Unknown target');
}

export function createProject(name = 'Untitled project', options: { id?: string; now?: string } = {}): MoppleProject {
  const timestamp = options.now ?? nowISO();
  return validateProject({
    format: FORMAT, version: CURRENT_VERSION,
    project: { id: options.id ?? `project_${globalThis.crypto.randomUUID()}`, name, createdAt: timestamp, updatedAt: timestamp, units: 'meters' },
    building: { floors: [], rooms: [], walls: [], doors: [], windows: [] },
    interior: { objects: [] }, materials: [], lighting: [], metadata: {},
  });
}

/** Move each vertex and all connected endpoints on this floor from original coordinates. */
function moveVertices(p: MoppleProject, floorId: string, moves: { from: Point; to: Point }[]) {
  for (const wall of p.building.walls.filter(w => w.floorId === floorId)) {
    for (const end of ['start', 'end'] as const) {
      const move = moves.find(m => samePoint(wall[end], m.from));
      if (move) wall[end] = { ...move.to };
    }
  }
}

function apply(p: MoppleProject, op: MoppleOperation) {
  const b = p.building;
  switch (op.type) {
    case 'add_floor': b.floors.push(op.floor); break;
    case 'create_room': b.rooms.push(op.room); break;
    case 'update_room': Object.assign(find(b.rooms, op.targetId), op.changes); break;
    case 'resize_room': {
      const room = find(b.rooms, op.targetId), polygon = roomPolygon(p, room);
      const xs = polygon.map(v => v.x), zs = polygon.map(v => v.z);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
      if (polygon.length !== 4 || new Set(xs).size !== 2 || new Set(zs).size !== 2 || polygon.some((a, i) => {
        const next = polygon[(i + 1) % polygon.length]; return a.x !== next.x && a.z !== next.z;
      })) reject(room.id, 'MVP resizing requires an axis-aligned rectangular room');
      moveVertices(p, room.floorId, polygon.map(from => ({ from, to: { x: minX + (from.x - minX) / (maxX - minX) * op.width, z: minZ + (from.z - minZ) / (maxZ - minZ) * op.depth } })));
      break;
    }
    case 'add_wall': b.walls.push(op.wall); break;
    case 'move_wall': {
      const wall = find(b.walls, op.targetId);
      moveVertices(p, wall.floorId, [{ from: { ...wall.start }, to: op.start }, { from: { ...wall.end }, to: op.end }]);
      break;
    }
    case 'update_wall': Object.assign(find(b.walls, op.targetId), op.changes); break;
    case 'remove_wall':
      find(b.walls, op.targetId);
      b.walls = b.walls.filter(w => w.id !== op.targetId);
      // Referenced walls cannot be deleted. Final validation rejects dangling edges/openings.
      break;
    case 'add_door': b.doors.push(op.door); break;
    case 'add_window': b.windows.push(op.window); break;
    case 'add_object': p.interior.objects.push(op.object); break;
    case 'move_object': {
      const object = find(p.interior.objects, op.targetId);
      object.position = op.position;
      if (op.rotation) object.rotation = op.rotation;
      if (op.roomId) object.roomId = op.roomId;
      break;
    }
    case 'remove_object':
      find(p.interior.objects, op.targetId);
      p.interior.objects = p.interior.objects.filter(o => o.id !== op.targetId);
      break;
    case 'change_material': {
      const index = p.materials.findIndex(m => m.id === op.material.id);
      if (index < 0) p.materials.push(op.material); else p.materials[index] = op.material;
      break;
    }
    case 'change_room_style': find(b.rooms, op.targetId).style = op.style; break;
    case 'update_lighting': p.lighting = op.lights; break;
    default: { const exhaustive: never = op; return exhaustive; }
  }
}

/** UI and AI share this API. No mutable internal project reference ever escapes. */
export class MoppleProjectEngine {
  #project: MoppleProject;
  #listeners = new Set<Listener>();
  #notifying = false;
  #now: () => string;
  #onError: (error: unknown) => void;

  #undoStack: MoppleProject[] = [];
  #redoStack: MoppleProject[] = [];
  #historyListeners = new Set<() => void>();

  constructor(project: unknown = createProject(), options: EngineOptions = {}) {
    this.#project = validateProject(project);
    this.#now = options.now ?? nowISO;
    this.#onError = options.onSubscriberError ?? (error => console.error('Mopple subscriber failed', error));
  }
  getSnapshot(): MoppleProject { return structuredClone(this.#project); }
  get canUndo(): boolean { return this.#undoStack.length > 0; }
  get canRedo(): boolean { return this.#redoStack.length > 0; }
  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }
  subscribeHistory(listener: () => void): () => void {
    this.#historyListeners.add(listener);
    return () => { this.#historyListeners.delete(listener); };
  }
  #notifyHistory() {
    for (const listener of this.#historyListeners) {
      try { listener(); } catch { /* ignore listener errors */ }
    }
  }
  #commit(project: MoppleProject, recordHistory = true) {
    if (this.#notifying) reject('engine', 'Cannot edit from a notification; schedule a new operation instead');
    if (recordHistory) {
      this.#undoStack.push(this.getSnapshot());
      if (this.#undoStack.length > 50) this.#undoStack.shift();
      this.#redoStack = [];
      this.#notifyHistory();
    }
    this.#project = project;
    this.#notifying = true;
    try {
      for (const listener of [...this.#listeners]) {
        try { listener(this.getSnapshot()); }
        catch (error) { try { this.#onError(error); } catch { /* Error reporting cannot undo a committed transaction. */ } }
      }
    } finally { this.#notifying = false; }
  }
  undo(): boolean {
    if (this.#undoStack.length === 0) return false;
    const previous = this.#undoStack.pop()!;
    this.#redoStack.push(this.getSnapshot());
    this.#commit(previous, false);
    this.#notifyHistory();
    return true;
  }
  redo(): boolean {
    if (this.#redoStack.length === 0) return false;
    const next = this.#redoStack.pop()!;
    this.#undoStack.push(this.getSnapshot());
    this.#commit(next, false);
    this.#notifyHistory();
    return true;
  }
  clearHistory(): void {
    this.#undoStack = [];
    this.#redoStack = [];
    this.#notifyHistory();
  }
  loadProject(input: unknown): void {
    this.#commit(validateProject(input), false);
    this.clearHistory();
  }
  importProject(json: string): void {
    this.#commit(parseProject(json), true);
  }
  saveProject(): string { return JSON.stringify(this.#project, null, 2) + '\n'; }
  applyOperations(input: unknown): void {
    const { operations } = validateOperations(input);
    const next = this.getSnapshot();
    for (const operation of operations) apply(next, operation);
    const timestamp = this.#now();
    next.project.updatedAt = Date.parse(timestamp) < Date.parse(next.project.updatedAt) ? next.project.updatedAt : timestamp;
    this.#commit(validateProject(next));
  }
  #run(operation: MoppleOperation) { this.applyOperations({ operations: [operation] }); }
  addFloor(floor: MoppleFloor) { this.#run({ type: 'add_floor', floor }); }
  addRoom(room: MoppleRoom) { this.#run({ type: 'create_room', room }); }
  updateRoom(targetId: string, changes: Extract<MoppleOperation, { type: 'update_room' }>['changes']) { this.#run({ type: 'update_room', targetId, changes }); }
  addWall(wall: MoppleWall) { this.#run({ type: 'add_wall', wall }); }
  updateWall(targetId: string, changes: Extract<MoppleOperation, { type: 'update_wall' }>['changes']) { this.#run({ type: 'update_wall', targetId, changes }); }
  moveWall(targetId: string, start: Point, end: Point) { this.#run({ type: 'move_wall', targetId, start, end }); }
  removeWall(targetId: string) { this.#run({ type: 'remove_wall', targetId }); }
  addDoor(door: MoppleDoor) { this.#run({ type: 'add_door', door }); }
  addWindow(window: MoppleWindow) { this.#run({ type: 'add_window', window }); }
  addInteriorObject(object: MoppleInteriorObject) { this.#run({ type: 'add_object', object }); }
  moveInteriorObject(targetId: string, position: Vector, rotation?: Vector, roomId?: string) { this.#run({ type: 'move_object', targetId, position, rotation, roomId }); }
  removeInteriorObject(targetId: string) { this.#run({ type: 'remove_object', targetId }); }
  resizeRoom(targetId: string, width: number, depth: number) { this.#run({ type: 'resize_room', targetId, width, depth }); }
  changeRoomStyle(targetId: string, style: string) { this.#run({ type: 'change_room_style', targetId, style }); }
  changeMaterial(material: MoppleMaterial) { this.#run({ type: 'change_material', material }); }
  updateLighting(lights: MoppleLight[]) { this.#run({ type: 'update_lighting', lights }); }
}
