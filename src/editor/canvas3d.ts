import { ArchitectureOverlay } from './architecture.ts';
import { architectureMeasurements, exteriorCamera, exteriorViews, type ExteriorView } from '../project/measurements.ts';
import { buildDesignScene, disposeTree } from './scene-design.ts';
import * as THREE from 'three';
import type { MoppleProjectEngine } from '../project/engine.ts';
import { distance, roomPolygon } from '../project/geometry.ts';
import type { MoppleInteriorObject, MoppleLight, MoppleMaterial, MoppleProject, MoppleWall } from '../project/schema.ts';
import type { SelectedEntity } from './canvas2d.ts';
import { createFurnitureMesh, getFurnitureFootprint } from './furniture.ts';
import { ArchitecturalSkyDome } from './sky.ts';
import { DEFAULT_SUN, manualSolarPosition, Heliodon3D, calculateSolarPosition, type SolarPosition } from './solar.ts';
import type { MoppleSun } from '../project/schema.ts';
import { DEFAULT_GEO } from './site.ts';

export interface Canvas3DOptions {
  engine: MoppleProjectEngine;
  readOnly?: boolean;
  onSelect?: (entity: SelectedEntity | null) => void;
  onError?: (error: unknown) => void;
}

export class Canvas3D {
  private readOnly = false;
  private touches = new Map<number,{x:number;y:number}>();
  private pinchDistance = 0;
  private container: HTMLElement;
  private engine: MoppleProjectEngine;
  private project: MoppleProject;
  private onSelect?: (entity: SelectedEntity | null) => void;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // Root groups
  private buildingGroup = new THREE.Group();
  private furnitureGroup = new THREE.Group();
  private lightingGroup = new THREE.Group();
  private selectionHelper = new THREE.Group();

  // Solar & Sky
  private skyDome: ArchitecturalSkyDome;
  private heliodon: Heliodon3D;
  private sunPreview: MoppleSun | null = null;
  private solarHour = 14; // 14:00 (2:00 PM) default afternoon light
  private solarDate = new Date();
  private heliodonVisible = false;
  private timelapseInterval: ReturnType<typeof setInterval> | null = null;
  private activeSunLight: THREE.DirectionalLight | null = null;
  private activeAmbientLight: THREE.AmbientLight | null = null;

  // Materials cache
  private materialsMap = new Map<string, MoppleMaterial>();

  // Selection
  private selected: SelectedEntity | null = null;
  private roofVisible = true;
  private activeFloor: string | null = null;
  private dimensions: ArchitectureOverlay;
  private hoveredObjId: string | null = null;

  // Orbit camera state
  private isOrbiting = false;
  private isPanning = false;
  private prevMouse = { x: 0, y: 0 };
  private cameraTarget = new THREE.Vector3(0, 0.5, 0);
  private cameraDistance = 14;
  private cameraSpherical = new THREE.Spherical(14, Math.PI / 3.5, Math.PI / 4);

  // 3D Dragging state
  private isDraggingObject = false;
  private draggedObject: MoppleInteriorObject | null = null;
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private dragPlaneIntersect = new THREE.Vector3();
  private dragOffset = new THREE.Vector3();

  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver;
  private unsubscribe: () => void;
  private disposed = false;
  private visible = true;
  private visibilityObserver: IntersectionObserver;
  private events = new AbortController();
  private onError: (error: unknown) => void;

  screenshot(): Promise<Blob> {
    this.renderer.render(this.scene, this.camera);
    return new Promise((resolve,reject)=>this.renderer.domElement.toBlob(b=>b?resolve(b):reject(new Error('3D screenshot failed'))));
  }

  constructor(container: HTMLElement, options: Canvas3DOptions) {
    this.readOnly = options.readOnly ?? false;
    this.container = container;
    this.engine = options.engine;
    this.project = options.engine.getSnapshot();
    this.onSelect = options.onSelect;
    this.onError = options.onError ?? console.error;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x0a0d0c, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.className = 'mopple-canvas-3d';
    this.container.appendChild(this.renderer.domElement);

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.updateCameraPosition();

    // Architectural Sky Dome & Heliodon Visualizer
    this.skyDome = new ArchitecturalSkyDome(350);
    this.scene.add(this.skyDome.mesh);

    this.heliodon = new Heliodon3D(28);
    this.scene.add(this.heliodon.group);
    this.heliodon.setVisible(this.heliodonVisible);

    // Scene structure
    this.scene.add(this.buildingGroup);
    this.scene.add(this.furnitureGroup);
    this.scene.add(this.lightingGroup);
    this.scene.add(this.selectionHelper);

    this.dimensions = new ArchitectureOverlay(container);

    // Initial build
    this.syncMaterialsMap();
    this.rebuildScene();
    this.resetCamera();

    // Input events
    this.setupEvents();

    // Engine subscription
    this.unsubscribe = this.engine.subscribe(p => {
      this.project = p;
      this.syncMaterialsMap();
      this.rebuildScene();
    });

    // Resize
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.resetCamera();

    this.visibilityObserver = new IntersectionObserver(entries => { this.visible = entries[0].isIntersecting; if (this.visible) this.invalidate(); });
    this.visibilityObserver.observe(container);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.invalidate(); }, { signal: this.events.signal });
    this.renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); this.onError(new Error('3D context lost. Reload to restore 3D; 2D editing remains available.')); this.destroy(); }, { signal: this.events.signal });
    this.invalidate();
  }

  public destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.events.abort();
    this.stopTimelapse();
    this.skyDome.dispose();
    this.heliodon.dispose();
    this.visibilityObserver?.disconnect();
    disposeTree(this.scene);
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.unsubscribe();
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.dimensions.element.remove();
  }

  public setSelection(entity: SelectedEntity | null) {
    this.selected = entity;
    this.updateSelectionVisuals();
  }

  public resetCamera() {
    const bounds = new THREE.Box3();
    this.buildingGroup.updateWorldMatrix(true, true);
    this.buildingGroup.traverseVisible(node => { if (node instanceof THREE.Mesh && node.name !== 'site_ground_plinth') bounds.expandByObject(node); });
    if (bounds.isEmpty()) { this.cameraTarget.set(0, .5, 0); this.cameraDistance = 14; }
    else {
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      this.cameraTarget.copy(sphere.center);
      const halfFov = Math.min(this.camera.fov * Math.PI / 360, Math.atan(Math.tan(this.camera.fov * Math.PI / 360) * this.camera.aspect));
      this.cameraDistance = Math.max(5, sphere.radius * 1.15 / Math.sin(halfFov));
    }
    this.cameraSpherical.set(this.cameraDistance, Math.PI / 3.5, Math.PI / 4); this.updateCameraPosition();
  }

  public setViewPreset(preset: 'top' | 'isometric' | 'cutaway' | ExteriorView) {
    this.setRoofVisible(preset !== 'top' && preset !== 'cutaway');
    if (exteriorViews.includes(preset as ExteriorView)) {
      const pose = exteriorCamera(this.project, preset as ExteriorView, this.camera.aspect);
      this.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      this.cameraTarget.set(pose.target.x, pose.target.y, pose.target.z);
      this.camera.fov = pose.fov; this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.cameraTarget);
      this.cameraSpherical.setFromVector3(this.camera.position.clone().sub(this.cameraTarget));
      this.cameraDistance = this.cameraSpherical.radius;
      this.invalidate(); return;
    }
    this.camera.fov = 45; this.camera.updateProjectionMatrix();
    this.resetCamera();
    if (preset === 'top') this.cameraSpherical.set(this.cameraDistance, .01, 0);
    this.updateCameraPosition();
  }

  public setRoofVisible(visible: boolean) { this.roofVisible = visible; this.applyVisibility(); }
  public setFloor(floorId: string | null) { this.activeFloor = floorId; this.applyVisibility(); this.refreshDimensions(); }
  public setDimensionsVisible(visible: boolean) { this.dimensions.enabled = visible; this.refreshDimensions(); }

  private applyVisibility() {
    const activeFloor = this.project.building.floors.find(f => f.id === this.activeFloor);
    if (!activeFloor) this.activeFloor = null;
    this.buildingGroup.traverse(node => {
      if (node.userData.floorId) node.visible = !this.activeFloor || node.userData.floorId === this.activeFloor;
      if (node.userData.isRoof) node.visible = this.roofVisible && !this.activeFloor;
      if (node.userData.isCeiling) node.visible = this.roofVisible && !this.activeFloor;
    });
    for (const node of this.furnitureGroup.children) {
      const object = this.project.interior.objects.find(o => o.id === node.name);
      const room = this.project.building.rooms.find(r => r.id === object?.roomId);
      node.visible = !this.activeFloor || room?.floorId === this.activeFloor;
    }
    this.invalidate();
  }

  private refreshDimensions() {
    this.dimensions.rows = architectureMeasurements(this.project).filter(row =>
      (!this.activeFloor || !row.floorId || row.floorId === this.activeFloor) &&
      (row.category === 'building' || row.entityId === this.selected?.id));
    this.invalidate();
  }

  public setRoomCamera(roomId: string) {
    const room = this.project.building.rooms.find(r => r.id === roomId);
    if (!room) return;
    const floor = this.project.building.floors.find(f => f.id === room.floorId);
    const elev = floor?.elevation ?? 0;
    const poly = roomPolygon(this.project, room);
    if (poly.length === 0) return;
    const xs = poly.map(p => p.x), zs = poly.map(p => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;

    const eyeHeight = elev + 1.6;
    const eyeX = minX + (maxX - minX) * 0.25;
    const eyeZ = minZ + (maxZ - minZ) * 0.3;

    this.camera.position.set(eyeX, eyeHeight, eyeZ);
    this.cameraTarget.set(centerX, elev + 1.3, centerZ);
    this.camera.lookAt(this.cameraTarget);
    this.invalidate();
  }

  public captureRoomView(roomId: string, width = 1280, height = 720): string {
    if (!this.project.building.rooms.some(room => room.id === roomId)) throw new Error('Room no longer exists.');
    return this.captureView(() => { this.setRoomCamera(roomId); this.camera.fov = 65; }, width, height);
  }

  public captureExteriorView(view: ExteriorView, width = 1280, height = 720): string {
    return this.captureView(() => this.setViewPreset(view), width, height);
  }

  private captureView(position: () => void, width: number, height: number): string {
    const previous = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(), target: this.cameraTarget.clone(), spherical: this.cameraSpherical.clone(), distance: this.cameraDistance, aspect: this.camera.aspect, fov: this.camera.fov, roof: this.roofVisible, floor: this.activeFloor, selection: this.selectionHelper.visible, heliodon: this.heliodon.group.visible };
    const rendererSize = this.renderer.getSize(new THREE.Vector2());
    const pixelRatio = this.renderer.getPixelRatio();
    try {
      this.activeFloor = null; this.setRoofVisible(true);
      this.selectionHelper.visible = false; this.heliodon.group.visible = false;
      this.camera.aspect = width / height;
      position(); this.camera.updateProjectionMatrix();
      // Reuse the viewport context: sharing shadow maps across temporary renderers
      // corrupts the next viewport frame and exhausts browser WebGL contexts.
      this.renderer.setPixelRatio(1); this.renderer.setSize(width, height, false);
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL('image/png');
    } finally {
      this.renderer.setPixelRatio(pixelRatio); this.renderer.setSize(rendererSize.x, rendererSize.y, false);
      this.camera.position.copy(previous.position); this.camera.quaternion.copy(previous.quaternion);
      this.cameraTarget.copy(previous.target); this.cameraSpherical.copy(previous.spherical);
      this.cameraDistance = previous.distance; this.camera.aspect = previous.aspect; this.camera.fov = previous.fov;
      this.activeFloor = previous.floor; this.setRoofVisible(previous.roof);
      this.selectionHelper.visible = previous.selection; this.heliodon.group.visible = previous.heliodon;
      this.camera.updateProjectionMatrix(); this.invalidate();
    }
  }

  private syncMaterialsMap() {
    this.materialsMap.clear();
    for (const mat of this.project.materials) {
      this.materialsMap.set(mat.id, mat);
    }
  }

  private updateCameraPosition() {
    this.cameraSpherical.radius = this.cameraDistance;
    this.cameraSpherical.phi = Math.max(0.01, Math.min(Math.PI - 0.02, this.cameraSpherical.phi));
    this.camera.position.setFromSpherical(this.cameraSpherical).add(this.cameraTarget);
    this.camera.lookAt(this.cameraTarget);
    this.invalidate();
  }

  private resize() {
    const rect = this.container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height, false);
    this.invalidate();
  }

  private isVisible(node: THREE.Object3D): boolean {
    return node.visible && (!node.parent || this.isVisible(node.parent));
  }

  private setupEvents() {
    const el = this.renderer.domElement;

    el.addEventListener('contextmenu', e => e.preventDefault());

    el.addEventListener('wheel', e => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
      this.cameraDistance = Math.max(3, Math.min(400, this.cameraDistance * zoomFactor));
      this.updateCameraPosition();
    }, { passive: false });

    el.addEventListener('pointerdown', e => {
      if(e.pointerType==='touch'){this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.touches.size===2){const [a,b]=[...this.touches.values()];this.pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);this.isOrbiting=this.isDraggingObject=this.isPanning=false;el.setPointerCapture(e.pointerId);return;}}
      const rect = el.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.prevMouse = { x: e.clientX, y: e.clientY };

      el.setPointerCapture(e.pointerId);
      if (this.readOnly) { this.isOrbiting = true; return; }

      // Right click or Shift+Left click: Pan
      if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
        this.isPanning = true;
        el.style.cursor = 'grab';
        return;
      }

      // Left click
      if (e.button === 0) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.furnitureGroup.children, true).filter(hit => this.isVisible(hit.object));

        if (intersects.length > 0) {
          let topGroup = intersects[0].object;
          while (topGroup.parent && topGroup.parent !== this.furnitureGroup) {
            topGroup = topGroup.parent;
          }
          const objId = topGroup.userData?.id || topGroup.name;
          const obj = this.project.interior.objects.find(o => o.id === objId);

          if (obj) {
            this.selected = { type: 'object', id: obj.id };
            this.onSelect?.(this.selected);
            this.updateSelectionVisuals();

            // Setup 3D drag along horizontal plane
            this.isDraggingObject = true;
            this.draggedObject = obj;
            this.dragPlane.set(new THREE.Vector3(0, 1, 0), -obj.position.y);
            this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersect);
            this.dragOffset.set(
              obj.position.x - this.dragPlaneIntersect.x,
              0,
              obj.position.z - this.dragPlaneIntersect.z
            );
            return;
          }
        }

        // Check if wall clicked
        const wallIntersects = this.raycaster.intersectObjects(this.buildingGroup.children, true);
        const wallHit = wallIntersects.find(i => i.object.userData?.wallId && this.isVisible(i.object));
        if (wallHit) {
          const wallId = wallHit.object.userData.wallId;
          this.selected = { type: 'wall', id: wallId };
          this.onSelect?.(this.selected);
          this.updateSelectionVisuals();
          return;
        }

        // Empty space: orbit or deselect
        this.isOrbiting = true;
        el.style.cursor = 'grabbing';
      }
    });

    el.addEventListener('pointermove', e => {
      if(this.touches.has(e.pointerId)){this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.touches.size===2){const [a,b]=[...this.touches.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(d>0&&this.pinchDistance>0)this.cameraDistance=Math.max(3,Math.min(400,this.cameraDistance*this.pinchDistance/d));this.pinchDistance=d;this.updateCameraPosition();return;}}
      const rect = el.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      this.prevMouse = { x: e.clientX, y: e.clientY };

      if (this.isPanning) {
        const panSpeed = this.cameraDistance * 0.0015;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
        this.cameraTarget.addScaledVector(right, -dx * panSpeed);
        this.cameraTarget.addScaledVector(up, dy * panSpeed);
        this.cameraTarget.y = Math.max(0, this.cameraTarget.y);
        this.updateCameraPosition();
        return;
      }

      if (this.isOrbiting) {
        this.cameraSpherical.theta -= dx * 0.007;
        this.cameraSpherical.phi -= dy * 0.007;
        this.updateCameraPosition();
        return;
      }

      if (this.isDraggingObject && this.draggedObject) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPlaneIntersect)) {
          let newX = this.dragPlaneIntersect.x + this.dragOffset.x;
          let newZ = this.dragPlaneIntersect.z + this.dragOffset.z;

          // 0.1m snap
          if (!e.shiftKey) {
            newX = Math.round(newX * 10) / 10;
            newZ = Math.round(newZ * 10) / 10;
          }

          this.draggedObject.position.x = newX;
          this.draggedObject.position.z = newZ;

          const mesh = this.furnitureGroup.getObjectByName(this.draggedObject.id);
          if (mesh) {
            mesh.position.set(newX, this.draggedObject.position.y, newZ);
          }
          this.updateSelectionVisuals();
        }
        return;
      }

      // Hover check
      if (!this.isOrbiting && !this.isPanning && !this.isDraggingObject) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObjects(this.furnitureGroup.children, true);
        if (hits.length > 0) {
          el.style.cursor = 'pointer';
        } else {
          el.style.cursor = 'default';
        }
      }
    });

    const finishPointer = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
      if (e.type === 'pointercancel') { this.isPanning = this.isOrbiting = this.isDraggingObject = false; this.draggedObject = null; this.project = this.engine.getSnapshot(); this.rebuildScene(); return; }
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);

      if (this.isDraggingObject && this.draggedObject) {
        this.isDraggingObject = false;
        const obj = this.draggedObject;
        this.draggedObject = null;
        try {
          this.engine.moveInteriorObject(obj.id, obj.position, obj.rotation, obj.roomId);
        } catch (err) {
          this.project = this.engine.getSnapshot(); this.rebuildScene(); this.onError(err);
        }
      }

      this.isOrbiting = false;
      this.isPanning = false;
      el.style.cursor = 'default';
    };

    el.addEventListener('pointerup', finishPointer);
    el.addEventListener('pointercancel', finishPointer);
  }

  private rebuildScene() {
    this.sunPreview = null;
    this.clearGroup(this.buildingGroup); this.clearGroup(this.furnitureGroup); this.clearGroup(this.lightingGroup);
    const next = buildDesignScene(this.project);
    this.buildingGroup.add(next.building); this.furnitureGroup.add(...[...next.furniture.children]); this.lightingGroup.add(next.lighting);

    this.activeSunLight = (this.lightingGroup.getObjectByName('light_sun') as THREE.DirectionalLight) ||
      (this.lightingGroup.children.find(c => c instanceof THREE.DirectionalLight) as THREE.DirectionalLight) || null;
    this.activeAmbientLight = null;
    this.lightingGroup.traverse(node => {
      if (node instanceof THREE.DirectionalLight && !this.activeSunLight) this.activeSunLight = node;
      if (node instanceof THREE.AmbientLight) this.activeAmbientLight = node;
    });
    if (!this.activeSunLight) { this.activeSunLight = new THREE.DirectionalLight(); this.lightingGroup.add(this.activeSunLight); }

    this.applyVisibility();
    this.updateSolarLighting();
    this.updateSelectionVisuals();
    this.invalidate();
  }

  public setSolarTime(hours: number): void {
    this.solarHour = Math.max(0, Math.min(24, hours));
    this.updateSolarLighting();
  }

  public getSolarTime(): number {
    return this.solarHour;
  }

  public setSolarDate(date: Date): void {
    this.solarDate = date;
    this.updateSolarLighting();
  }

  public getSolarDate(): Date {
    return this.solarDate;
  }

  public setHeliodonVisible(visible: boolean): void {
    this.heliodonVisible = visible;
    this.heliodon.setVisible(visible);
    if (visible) this.updateSolarLighting();
    this.invalidate();
  }

  public isHeliodonVisible(): boolean {
    return this.heliodonVisible;
  }

  public previewSun(sun: MoppleSun): void { this.sunPreview = sun; this.updateSolarLighting(); }

  public getSolarMetrics(): SolarPosition {
    const sun = this.sunPreview ?? this.project.metadata.sun ?? DEFAULT_SUN;
    if (sun.mode === 'manual') return manualSolarPosition(sun);
    const geo = this.project.metadata?.geo ?? DEFAULT_GEO;
    return calculateSolarPosition({
      latitude: geo.latitude,
      longitude: geo.longitude,
      dayOfYear: this.getDayOfYear(this.solarDate),
      timeHours: this.solarHour,
      northAngle: geo.northAngle ?? 0
    }, 45);
  }

  public toggleTimelapse(onTick?: (hour: number) => void): boolean {
    if (this.timelapseInterval) {
      this.stopTimelapse();
      return false;
    } else {
      this.startTimelapse(onTick);
      return true;
    }
  }

  public startTimelapse(onTick?: (hour: number) => void): void {
    this.stopTimelapse();
    this.timelapseInterval = setInterval(() => {
      let next = this.solarHour + 0.1;
      if (next >= 24) next = 0;
      this.setSolarTime(next);
      onTick?.(next);
    }, 40);
  }

  public stopTimelapse(): void {
    if (this.timelapseInterval) {
      clearInterval(this.timelapseInterval);
      this.timelapseInterval = null;
    }
  }

  private getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = (date.getTime() - start.getTime()) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  private updateSolarLighting(): void {
    const geo = this.project.metadata?.geo ?? DEFAULT_GEO;
    const dayOfYear = this.getDayOfYear(this.solarDate);
    const pos = this.getSolarMetrics();

    if (this.activeSunLight) {
      this.activeSunLight.position.copy(pos.sunPosition);
      this.activeSunLight.color.copy(pos.sunColor);
      this.activeSunLight.intensity = pos.sunIntensity;
      this.activeSunLight.castShadow = pos.isDaylight;
    }

    if (this.activeAmbientLight) {
      this.activeAmbientLight.color.copy(pos.ambientColor);
      this.activeAmbientLight.intensity = pos.ambientIntensity;
    }

    this.skyDome.update(pos);

    this.heliodon.setVisible(this.heliodonVisible && (this.sunPreview ?? this.project.metadata.sun ?? DEFAULT_SUN).mode === 'solar');
    if (this.heliodon.group.visible) {
      this.heliodon.updateSolarGuides({
        latitude: geo.latitude,
        longitude: geo.longitude,
        dayOfYear,
        timeHours: this.solarHour,
        northAngle: geo.northAngle ?? 0
      }, pos);
    }

    this.invalidate();
  }
  private clearGroup(group: THREE.Group) { disposeTree(group); }

  private updateSelectionVisuals() {
    this.clearGroup(this.selectionHelper);
    this.refreshDimensions();

    if (this.selected?.type === 'object') {
      const obj = this.project.interior.objects.find(o => o.id === this.selected?.id);
      if (obj) {
        const footprint = getFurnitureFootprint(obj);
        // Greenish floor ring around selected object
        const ringGeo = new THREE.RingGeometry(
          Math.hypot(footprint.width, footprint.depth) * 0.52,
          Math.hypot(footprint.width, footprint.depth) * 0.55,
          32
        );
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xa8e8d2, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(obj.position.x, obj.position.y + 0.02, obj.position.z);
        this.selectionHelper.add(ring);
      }
    }
  }

  private invalidate = () => {
    if (this.disposed || this.animationFrameId !== null) return;
    this.animationFrameId = requestAnimationFrame(() => {
      this.animationFrameId = null;
      if (!this.disposed && this.visible && !document.hidden && this.container.clientWidth && this.container.clientHeight) {
        this.renderer.render(this.scene, this.camera);
        this.dimensions.render(this.camera, this.container.clientWidth, this.container.clientHeight);
      }
    });
  };
}
