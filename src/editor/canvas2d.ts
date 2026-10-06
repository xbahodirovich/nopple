import { reportEditorError } from './ui.ts';
import type { MoppleProjectEngine } from '../project/engine.ts';
import { distance, polygonArea, roomPolygon } from '../project/geometry.ts';
import type { MoppleInteriorObject, MoppleProject, MoppleRoom, MoppleWall, Point, Vector } from '../project/schema.ts';
import { drawFurniture2D, getFurnitureFootprint } from './furniture.ts';

export type SelectedEntity =
  | { type: 'object'; id: string }
  | { type: 'wall'; id: string }
  | { type: 'room'; id: string };

export interface Canvas2DOptions {
  engine: MoppleProjectEngine;
  onSelect?: (entity: SelectedEntity | null) => void;
}

export class Canvas2D {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private engine: MoppleProjectEngine;
  private project: MoppleProject;
  private onSelect?: (entity: SelectedEntity | null) => void;

  // View transform: pan and zoom
  private panX = 0;
  private panY = 0;
  private zoom = 45; // pixels per meter
  private minZoom = 12;
  private maxZoom = 250;

  // Selection
  private selected: SelectedEntity | null = null;
  private hovered: SelectedEntity | null = null;

  // Interaction drag state
  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private panOrigin = { x: 0, y: 0 };

  private isDraggingObject = false;
  private dragObjectStartPos: Vector = { x: 0, y: 0, z: 0 };
  private dragPointerStartWorld: Point = { x: 0, z: 0 };
  private activeDraggedObject: MoppleInteriorObject | null = null;

  private isRotatingObject = false;
  private rotateOrigin: Point = { x: 0, z: 0 };

  private isDraggingWallHandle = false;
  private dragWallHandle: 'start' | 'end' | null = null;
  private dragWallStartPoint: Point = { x: 0, z: 0 };

  private spacePressed = false;
  private touches=new Map<number,{x:number;y:number}>();
  private pinchDistance=0;
  private events = new AbortController();
  private dpr = 1;
  private floorId: string | undefined;
  private resizeObserver: ResizeObserver;
  private unsubscribe: () => void;

  constructor(container: HTMLElement, options: Canvas2DOptions) {
    this.engine = options.engine;
    this.project = options.engine.getSnapshot();
    this.floorId = this.project.building.floors[0]?.id;
    this.onSelect = options.onSelect;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'mopple-canvas-2d';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'House floor plan. Select items using the Layers panel and edit using Properties.');
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');
    this.ctx = ctx;

    // Center view
    this.centerView();

    // Event listeners
    this.setupEvents();

    // Subscribe to engine
    this.unsubscribe = this.engine.subscribe(p => {
      this.project = p;
      if (!p.building.floors.some(f => f.id === this.floorId)) this.floorId = p.building.floors[0]?.id;
      this.render();
    });

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  public destroy() {
    this.unsubscribe(); this.events.abort();
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }

  public setSelection(entity: SelectedEntity | null) {
    this.selected = entity;
    this.render();
  }

  public setFloor(id: string) { if (this.floorId !== id) { this.floorId = id; this.centerView(); } this.render(); }
  private get walls() { return this.project.building.walls.filter(w => w.floorId === this.floorId); }
  private get rooms() { return this.project.building.rooms.filter(r => r.floorId === this.floorId); }
  private get objects() { return this.project.interior.objects.filter(o => this.rooms.some(r => r.id === o.roomId)); }

  public getSelection(): SelectedEntity | null {
    return this.selected;
  }

  public resetView() {
    this.centerView();
    this.render();
  }

  public zoomIn() {
    this.setZoom(this.zoom * 1.25, this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
  }

  public zoomOut() {
    this.setZoom(this.zoom / 1.25, this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
  }

  private centerView() {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    const points = this.walls.flatMap(w => [w.start, w.end]);
    const minX = points.length ? Math.min(...points.map(p => p.x)) : -5, maxX = points.length ? Math.max(...points.map(p => p.x)) : 5;
    const minZ = points.length ? Math.min(...points.map(p => p.z)) : -4, maxZ = points.length ? Math.max(...points.map(p => p.z)) : 4;
    const usableHeight = Math.max(120, rect.height - 170);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, .85 * Math.min(rect.width / Math.max(1, maxX - minX), usableHeight / Math.max(1, maxZ - minZ))));
    this.panX = rect.width / 2 - (minX + maxX) / 2 * this.zoom;
    this.panY = 70 + usableHeight / 2 - (minZ + maxZ) / 2 * this.zoom;
  }

  private setZoom(newZoom: number, anchorScreenX: number, anchorScreenY: number) {
    const clamped = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
    if (clamped === this.zoom) return;

    // Zoom around cursor anchor
    const worldAnchor = this.screenToWorld(anchorScreenX, anchorScreenY);
    this.zoom = clamped;
    this.panX = anchorScreenX - worldAnchor.x * this.zoom;
    this.panY = anchorScreenY - worldAnchor.z * this.zoom;
    this.render();
  }

  private resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;

    const dpr = this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.centerView(); this.render();
  }

  public worldToScreen(p: Point): { x: number; y: number } {
    return {
      x: this.panX + p.x * this.zoom,
      y: this.panY + p.z * this.zoom,
    };
  }

  public screenToWorld(sx: number, sy: number): Point {
    return {
      x: (sx - this.panX) / this.zoom,
      z: (sy - this.panY) / this.zoom,
    };
  }

  private setupEvents() {
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        // Pinch zoom
        const factor = Math.exp(-e.deltaY * 0.01);
        this.setZoom(this.zoom * factor, sx, sy);
      } else {
        // Wheel zoom or pan
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        this.setZoom(this.zoom * factor, sx, sy);
      }
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.spacePressed && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        this.spacePressed = true;
        this.canvas.style.cursor = 'grab';
      }
    }, { signal: this.events.signal });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spacePressed = false;
        if (!this.isPanning) this.canvas.style.cursor = 'default';
      }
    }, { signal: this.events.signal });

    this.canvas.addEventListener('pointerdown', (e) => {
      if(e.pointerType==='touch'){this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.touches.size===2){const [a,b]=[...this.touches.values()];this.pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);this.isPanning=this.isDraggingObject=this.isRotatingObject=this.isDraggingWallHandle=false;this.project=this.engine.getSnapshot();this.canvas.setPointerCapture(e.pointerId);this.render();return;}}
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.screenToWorld(sx, sy);

      this.canvas.setPointerCapture(e.pointerId);

      // Middle click or Space+Left click -> Pan
      if (e.button === 1 || (e.button === 0 && this.spacePressed)) {
        this.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY };
        this.panOrigin = { x: this.panX, y: this.panY };
        this.canvas.style.cursor = 'grabbing';
        return;
      }

      if (e.button === 0) {
        // Check if clicking rotation handle of selected object
        if (this.selected?.type === 'object') {
          const obj = this.project.interior.objects.find(o => o.id === this.selected?.id);
          if (obj) {
            const rotHandlePos = this.getObjectRotationHandlePos(obj);
            const distHandle = Math.hypot(rotHandlePos.x - sx, rotHandlePos.y - sy);
            if (distHandle <= 10) {
              this.isRotatingObject = true;
              this.rotateOrigin = { x: obj.position.x, z: obj.position.z };
              return;
            }
          }
        }

        // Check if clicking wall handles of selected wall
        if (this.selected?.type === 'wall') {
          const wall = this.project.building.walls.find(w => w.id === this.selected?.id);
          if (wall) {
            const sScr = this.worldToScreen(wall.start);
            const eScr = this.worldToScreen(wall.end);
            if (Math.hypot(sScr.x - sx, sScr.y - sy) <= 8) {
              this.isDraggingWallHandle = true;
              this.dragWallHandle = 'start';
              this.dragWallStartPoint = { ...wall.start };
              return;
            }
            if (Math.hypot(eScr.x - sx, eScr.y - sy) <= 8) {
              this.isDraggingWallHandle = true;
              this.dragWallHandle = 'end';
              this.dragWallStartPoint = { ...wall.end };
              return;
            }
          }
        }

        // Hit test entities (objects > walls > rooms)
        const hit = this.hitTest(world, sx, sy);
        if (hit) {
          this.selected = hit;
          this.onSelect?.(hit);

          if (hit.type === 'object') {
            const obj = this.project.interior.objects.find(o => o.id === hit.id);
            if (obj) {
              this.isDraggingObject = true;
              this.activeDraggedObject = obj;
              this.dragObjectStartPos = { ...obj.position };
              this.dragPointerStartWorld = { ...world };
            }
          }
        } else {
          // Clicked empty void
          this.selected = null;
          this.onSelect?.(null);

          // Allow panning by dragging void
          this.isPanning = true;
          this.panStart = { x: e.clientX, y: e.clientY };
          this.panOrigin = { x: this.panX, y: this.panY };
        }
        this.render();
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if(this.touches.has(e.pointerId)){this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.touches.size===2){const [a,b]=[...this.touches.values()],d=Math.hypot(a.x-b.x,a.y-b.y),rect=this.canvas.getBoundingClientRect();if(d>0&&this.pinchDistance>0)this.setZoom(this.zoom*d/this.pinchDistance,(a.x+b.x)/2-rect.left,(a.y+b.y)/2-rect.top);this.pinchDistance=d;return;}}
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.screenToWorld(sx, sy);

      // Panning
      if (this.isPanning) {
        this.panX = this.panOrigin.x + (e.clientX - this.panStart.x);
        this.panY = this.panOrigin.y + (e.clientY - this.panStart.y);
        this.render();
        return;
      }

      // Rotating object
      if (this.isRotatingObject && this.selected?.type === 'object') {
        const obj = this.project.interior.objects.find(o => o.id === this.selected?.id);
        if (obj) {
          const dx = world.x - this.rotateOrigin.x;
          const dz = world.z - this.rotateOrigin.z;
          let angle = Math.atan2(dx, dz);
          // Snap to 15 degrees unless Shift is held
          if (!e.shiftKey) {
            const step = Math.PI / 12;
            angle = Math.round(angle / step) * step;
          }
          obj.rotation.y = angle;
          this.render();
        }
        return;
      }

      // Dragging wall handle
      if (this.isDraggingWallHandle && this.selected?.type === 'wall' && this.dragWallHandle) {
        const wall = this.project.building.walls.find(w => w.id === this.selected?.id);
        if (wall) {
          const snapWorld = {
            x: e.shiftKey ? world.x : Math.round(world.x * 10) / 10,
            z: e.shiftKey ? world.z : Math.round(world.z * 10) / 10,
          };
          if (this.dragWallHandle === 'start') {
            wall.start = snapWorld;
          } else {
            wall.end = snapWorld;
          }
          this.render();
        }
        return;
      }

      // Dragging furniture object
      if (this.isDraggingObject && this.activeDraggedObject) {
        const dx = world.x - this.dragPointerStartWorld.x;
        const dz = world.z - this.dragPointerStartWorld.z;
        let targetX = this.dragObjectStartPos.x + dx;
        let targetZ = this.dragObjectStartPos.z + dz;

        // Snap to 0.1m grid unless Shift is held
        if (!e.shiftKey) {
          targetX = Math.round(targetX * 10) / 10;
          targetZ = Math.round(targetZ * 10) / 10;
        }

        this.activeDraggedObject.position.x = targetX;
        this.activeDraggedObject.position.z = targetZ;
        this.render();
        return;
      }

      // Update hover state
      const hit = this.hitTest(world, sx, sy);
      if (hit?.id !== this.hovered?.id || hit?.type !== this.hovered?.type) {
        this.hovered = hit;
        this.canvas.style.cursor = this.spacePressed ? 'grab' : hit ? 'pointer' : 'default';
        this.render();
      }
    });

    const finishPointer = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
      if (e.type === 'pointercancel') { this.isPanning = this.isDraggingObject = this.isRotatingObject = this.isDraggingWallHandle = false; this.activeDraggedObject = null; this.project = this.engine.getSnapshot(); this.render(); return; }
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }

      if (this.isPanning) {
        this.isPanning = false;
        this.canvas.style.cursor = this.spacePressed ? 'grab' : 'default';
      }

      if (this.isDraggingObject && this.activeDraggedObject) {
        this.isDraggingObject = false;
        const obj = this.activeDraggedObject;
        this.activeDraggedObject = null;
        // Commit change to engine
        try {
          this.engine.moveInteriorObject(obj.id, obj.position, obj.rotation, obj.roomId);
        } catch (err) {
          this.project = this.engine.getSnapshot(); reportEditorError(err);
        }
      }

      if (this.isRotatingObject && this.selected?.type === 'object') {
        this.isRotatingObject = false;
        const obj = this.project.interior.objects.find(o => o.id === this.selected?.id);
        if (obj) {
          try {
            this.engine.moveInteriorObject(obj.id, obj.position, obj.rotation, obj.roomId);
          } catch (err) {
            this.project = this.engine.getSnapshot(); reportEditorError(err);
          }
        }
      }

      if (this.isDraggingWallHandle && this.selected?.type === 'wall' && this.dragWallHandle) {
        this.isDraggingWallHandle = false;
        const wall = this.project.building.walls.find(w => w.id === this.selected?.id);
        if (wall) {
          try {
            this.engine.moveWall(wall.id, wall.start, wall.end);
          } catch (err) {
            this.project = this.engine.getSnapshot(); reportEditorError(err);
          }
        }
      }

      this.render();
    };

    this.canvas.addEventListener('pointerup', finishPointer);
    this.canvas.addEventListener('pointercancel', finishPointer);
  }

  private hitTest(world: Point, sx: number, sy: number): SelectedEntity | null {
    // 1. Objects
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const obj = this.objects[i];
      const footprint = getFurnitureFootprint(obj);
      const hw = footprint.width / 2;
      const hd = footprint.depth / 2;

      // Transform world point into object local space
      const cos = Math.cos(obj.rotation.y);
      const sin = Math.sin(obj.rotation.y);
      const dx = world.x - obj.position.x;
      const dz = world.z - obj.position.z;
      const localX = cos * dx - sin * dz;
      const localZ = sin * dx + cos * dz;

      if (Math.abs(localX) <= hw && Math.abs(localZ) <= hd) {
        return { type: 'object', id: obj.id };
      }
    }

    // 2. Walls (line segment distance)
    for (const wall of this.walls) {
      const dist = distanceToSegment(world, wall.start, wall.end);
      if (dist <= (wall.thickness / 2) + 0.15) {
        return { type: 'wall', id: wall.id };
      }
    }

    // 3. Rooms (polygon test)
    for (const room of this.rooms) {
      const poly = roomPolygon(this.project, room);
      if (pointInPolygon(world, poly)) {
        return { type: 'room', id: room.id };
      }
    }

    return null;
  }

  private getObjectRotationHandlePos(obj: MoppleInteriorObject): { x: number; y: number } {
    const footprint = getFurnitureFootprint(obj);
    const stalkDist = footprint.depth / 2 + 0.5; // 0.5m stalk distance in front
    const cos = Math.cos(obj.rotation.y);
    const sin = Math.sin(obj.rotation.y);
    const worldHandle = {
      x: obj.position.x + sin * stalkDist,
      z: obj.position.z + cos * stalkDist,
    };
    return this.worldToScreen(worldHandle);
  }

  public render() {
    const { ctx, canvas } = this;
    const w = canvas.width / this.dpr;
    const h = canvas.height / this.dpr;

    // Void background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0d0c';
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    this.drawGrid(w, h);

    // Save context for world transform
    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // 1. Draw Room Polygons & Fills
    this.drawRooms();

    // 2. Draw Walls & Openings
    this.drawWallsAndOpenings();

    // 3. Draw Interior Furniture
    this.drawObjects();

    ctx.restore();

    // 4. Draw Selected Handles & HUD Overlay (in screen space)
    this.drawOverlays();
  }

  private drawGrid(w: number, h: number) {
    const { ctx } = this;
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(w, h);

    // 1m major grid
    const minX = Math.floor(topLeft.x) - 1;
    const maxX = Math.ceil(bottomRight.x) + 1;
    const minZ = Math.floor(topLeft.z) - 1;
    const maxZ = Math.ceil(bottomRight.z) + 1;

    // Minor grid (0.2m) if zoomed in enough
    if (this.zoom > 35) {
      ctx.strokeStyle = '#111714';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.floor(topLeft.x * 5) / 5; x <= maxX; x += 0.2) {
        const sx = this.panX + x * this.zoom;
        ctx.moveTo(sx, 0); ctx.lineTo(sx, h);
      }
      for (let z = Math.floor(topLeft.z * 5) / 5; z <= maxZ; z += 0.2) {
        const sy = this.panY + z * this.zoom;
        ctx.moveTo(0, sy); ctx.lineTo(w, sy);
      }
      ctx.stroke();
    }

    // Major grid (1m)
    ctx.strokeStyle = '#1a241f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = minX; x <= maxX; x++) {
      const sx = this.panX + x * this.zoom;
      ctx.moveTo(sx, 0); ctx.lineTo(sx, h);
    }
    for (let z = minZ; z <= maxZ; z++) {
      const sy = this.panY + z * this.zoom;
      ctx.moveTo(0, sy); ctx.lineTo(w, sy);
    }
    ctx.stroke();

    // Origin crosshair (0,0)
    const ox = this.panX;
    const oy = this.panY;
    ctx.strokeStyle = '#32483d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox - 8, oy); ctx.lineTo(ox + 8, oy);
    ctx.moveTo(ox, oy - 8); ctx.lineTo(ox, oy + 8);
    ctx.stroke();

    // Scale meter badge (bottom-left)
    const scaleBarMeters = 2;
    const scaleBarPx = scaleBarMeters * this.zoom;
    ctx.fillStyle = '#627a72';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${scaleBarMeters}m`, 24, h - 28);
    ctx.strokeStyle = '#627a72';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, h - 20);
    ctx.lineTo(24 + scaleBarPx, h - 20);
    ctx.moveTo(24, h - 24); ctx.lineTo(24, h - 16);
    ctx.moveTo(24 + scaleBarPx, h - 24); ctx.lineTo(24 + scaleBarPx, h - 16);
    ctx.stroke();
  }

  private drawRooms() {
    const { ctx } = this;
    for (const room of this.rooms) {
      const poly = roomPolygon(this.project, room);
      if (poly.length < 3) continue;

      const isSelected = this.selected?.type === 'room' && this.selected.id === room.id;
      const isHovered = this.hovered?.type === 'room' && this.hovered.id === room.id;

      // Room polygon fill
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].z);
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(poly[i].x, poly[i].z);
      }
      ctx.closePath();

      ctx.fillStyle = isSelected
        ? 'rgba(168, 232, 210, 0.12)'
        : isHovered
        ? 'rgba(255, 255, 255, 0.05)'
        : (this.project.materials.find(m => m.id === room.materials?.floor)?.color ?? '#1c2621');
      ctx.globalAlpha = isSelected || isHovered ? 1 : .22;
      ctx.fill(); ctx.globalAlpha = 1;

      // Room tag in center
      const xs = poly.map(v => v.x), zs = poly.map(v => v.z);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      const area = Math.round(polygonArea(poly) * 10) / 10;

      ctx.save();
      ctx.translate(cx, cz);
      ctx.scale(1 / this.zoom, 1 / this.zoom);

      ctx.textAlign = 'center';
      ctx.font = '600 13px Inter, -apple-system, sans-serif';
      ctx.fillStyle = isSelected ? '#a8e8d2' : '#e0e6e3';
      const labelWidth=Math.max(16,(Math.max(...xs)-Math.min(...xs))*this.zoom-12);
      const labelHeight=(Math.max(...zs)-Math.min(...zs))*this.zoom;
      ctx.fillText(room.name, 0, labelHeight<36 ? 4 : -3, labelWidth);

      ctx.font = '400 11px Inter, -apple-system, sans-serif';
      ctx.fillStyle = isSelected ? '#86bda9' : '#889e94';
      if(labelHeight>=36)ctx.fillText(`${area.toFixed(1)} m²`, 0, 13, labelWidth);

      ctx.restore();
    }
  }

  private drawWallsAndOpenings() {
    const { ctx } = this;

    for (const wall of this.walls) {
      const isSelected = this.selected?.type === 'wall' && this.selected.id === wall.id;
      const isHovered = this.hovered?.type === 'wall' && this.hovered.id === wall.id;

      const len = distance(wall.start, wall.end);
      if (len <= 0.001) continue;

      const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);

      ctx.save();
      ctx.translate(wall.start.x, wall.start.z);
      ctx.rotate(angle);

      // Main wall stroke & fill
      ctx.fillStyle = isSelected ? '#a8e8d2' : isHovered ? '#cad8d2' : '#7b9186';
      ctx.fillRect(0, -wall.thickness / 2, len, wall.thickness);

      // Openings on this wall
      const doors = this.project.building.doors.filter(d => d.wallId === wall.id);
      const windows = this.project.building.windows.filter(w => w.wallId === wall.id);

      // Cutout and draw doors
      for (const door of doors) {
        const doorX = len * door.position - door.width / 2;
        // Cutout background
        ctx.fillStyle = '#0a0d0c';
        ctx.fillRect(doorX, -wall.thickness / 2 - 0.01, door.width, wall.thickness + 0.02);

        // Door leaf (swing open 90 degrees)
        ctx.strokeStyle = '#a8e8d2';
        ctx.lineWidth = 0.03;
        ctx.beginPath();
        ctx.moveTo(doorX, -wall.thickness / 2);
        ctx.lineTo(doorX, -wall.thickness / 2 - door.width);
        ctx.stroke();

        // Swing arc
        ctx.setLineDash([0.04, 0.04]);
        ctx.beginPath();
        ctx.arc(doorX, -wall.thickness / 2, door.width, -Math.PI / 2, 0);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Cutout and draw windows
      for (const win of windows) {
        const winX = len * win.position - win.width / 2;
        // Window opening cutout
        ctx.fillStyle = '#0a0d0c';
        ctx.fillRect(winX, -wall.thickness / 2 - 0.01, win.width, wall.thickness + 0.02);

        // Glass double lines
        ctx.strokeStyle = '#71bcdb';
        ctx.lineWidth = 0.02;
        ctx.beginPath();
        ctx.moveTo(winX, -0.03); ctx.lineTo(winX + win.width, -0.03);
        ctx.moveTo(winX, 0.03); ctx.lineTo(winX + win.width, 0.03);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  private drawObjects() {
    for (const obj of this.objects) {
      const isSelected = this.selected?.type === 'object' && this.selected.id === obj.id;
      drawFurniture2D(this.ctx, obj, isSelected);
    }
  }

  private drawOverlays() {
    const { ctx } = this;

    // Selected object: Figma-style bounding box, dimensions tag, and rotation handle
    if (this.selected?.type === 'object') {
      const obj = this.project.interior.objects.find(o => o.id === this.selected?.id);
      if (obj) {
        const footprint = getFurnitureFootprint(obj);
        const centerScr = this.worldToScreen({ x: obj.position.x, z: obj.position.z });
        const hwPx = (footprint.width / 2) * this.zoom;
        const hdPx = (footprint.depth / 2) * this.zoom;

        ctx.save();
        ctx.translate(centerScr.x, centerScr.y);
        ctx.rotate(-obj.rotation.y);

        // Bounding box
        ctx.strokeStyle = '#a8e8d2';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-hwPx, -hdPx, hwPx * 2, hdPx * 2);

        // Corner resize handles
        const handles = [
          [-hwPx, -hdPx],
          [hwPx, -hdPx],
          [hwPx, hdPx],
          [-hwPx, hdPx],
        ];
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0a0d0c';
        ctx.lineWidth = 1.5;
        for (const [hx, hy] of handles) {
          ctx.fillRect(hx - 3.5, hy - 3.5, 7, 7);
          ctx.strokeRect(hx - 3.5, hy - 3.5, 7, 7);
        }

        // Rotation stalk & handle (top center)
        const stalkLen = 22;
        ctx.strokeStyle = '#a8e8d2';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, hdPx);
        ctx.lineTo(0, hdPx + stalkLen);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, hdPx + stalkLen, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Dimension badge
        const dimText = `${footprint.width.toFixed(2)}m × ${footprint.depth.toFixed(2)}m`;
        ctx.font = '10px Inter, sans-serif';
        const textW = ctx.measureText(dimText).width;
        ctx.fillStyle = 'rgba(16, 22, 19, 0.9)';
        ctx.fillRect(-textW / 2 - 6, -hdPx - 22, textW + 12, 18);
        ctx.fillStyle = '#a8e8d2';
        ctx.textAlign = 'center';
        ctx.fillText(dimText, 0, -hdPx - 9);

        ctx.restore();
      }
    }

    // Selected wall: start & end vertex handles
    if (this.selected?.type === 'wall') {
      const wall = this.project.building.walls.find(w => w.id === this.selected?.id);
      if (wall) {
        const sScr = this.worldToScreen(wall.start);
        const eScr = this.worldToScreen(wall.end);

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#a8e8d2';
        ctx.lineWidth = 2;
        for (const pt of [sScr, eScr]) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        // Length tag in center
        const len = distance(wall.start, wall.end);
        const midScr = { x: (sScr.x + eScr.x) / 2, y: (sScr.y + eScr.y) / 2 };
        const label = `${len.toFixed(2)}m`;
        ctx.font = '11px Inter, sans-serif';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(16, 22, 19, 0.9)';
        ctx.fillRect(midScr.x - tw / 2 - 5, midScr.y - 18, tw + 10, 16);
        ctx.fillStyle = '#a8e8d2';
        ctx.textAlign = 'center';
        ctx.fillText(label, midScr.x, midScr.y - 6);
      }
    }
  }
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return distance(p, a);

  let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, z: a.z + t * dz });
}

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z;
    const xj = poly[j].x, zj = poly[j].z;
    const intersect = ((zi > p.z) !== (zj > p.z)) &&
      (p.x < (xj - xi) * (p.z - zi) / (zj - zi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
