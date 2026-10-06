import { buildDesignScene, disposeTree } from './scene-design.ts';
import * as THREE from 'three';
import type { MoppleProjectEngine } from '../project/engine.ts';
import { distance } from '../project/geometry.ts';
import type { MoppleInteriorObject, MoppleLight, MoppleMaterial, MoppleProject, MoppleWall } from '../project/schema.ts';
import type { SelectedEntity } from './canvas2d.ts';
import { createFurnitureMesh, getFurnitureFootprint } from './furniture.ts';

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

  // Materials cache
  private materialsMap = new Map<string, MoppleMaterial>();

  // Selection
  private selected: SelectedEntity | null = null;
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

    // Scene structure
    this.scene.add(this.buildingGroup);
    this.scene.add(this.furnitureGroup);
    this.scene.add(this.lightingGroup);
    this.scene.add(this.selectionHelper);

    // Initial build
    this.syncMaterialsMap();
    this.rebuildScene();

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
    this.visibilityObserver?.disconnect();
    disposeTree(this.scene);
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.unsubscribe();
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  public setSelection(entity: SelectedEntity | null) {
    this.selected = entity;
    this.updateSelectionVisuals();
  }

  public resetCamera() {
    const bounds = new THREE.Box3().setFromObject(this.buildingGroup);
    if (bounds.isEmpty()) { this.cameraTarget.set(0, .5, 0); this.cameraDistance = 14; }
    else {
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      this.cameraTarget.copy(sphere.center);
      const halfFov = Math.min(Math.PI / 8, Math.atan(Math.tan(Math.PI / 8) * this.camera.aspect));
      this.cameraDistance = Math.max(5, sphere.radius * 1.15 / Math.sin(halfFov));
    }
    this.cameraSpherical.set(this.cameraDistance, Math.PI / 3.5, Math.PI / 4); this.updateCameraPosition();
  }

  public setViewPreset(preset: 'top' | 'isometric' | 'front') {
    if (preset === 'top') {
      this.cameraSpherical.set(this.cameraDistance, 0.05, 0);
    } else if (preset === 'isometric') {
      this.cameraSpherical.set(14, Math.PI / 3.5, Math.PI / 4);
    } else if (preset === 'front') {
      this.cameraSpherical.set(12, Math.PI / 2.2, 0);
    }
    this.updateCameraPosition();
  }

  private syncMaterialsMap() {
    this.materialsMap.clear();
    for (const mat of this.project.materials) {
      this.materialsMap.set(mat.id, mat);
    }
  }

  private updateCameraPosition() {
    this.cameraSpherical.radius = this.cameraDistance;
    this.cameraSpherical.phi = Math.max(0.01, Math.min(Math.PI / 2 - 0.02, this.cameraSpherical.phi));
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
    this.resetCamera(); this.invalidate();
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
        const intersects = this.raycaster.intersectObjects(this.furnitureGroup.children, true);

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
        const wallHit = wallIntersects.find(i => i.object.userData?.wallId);
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
    this.clearGroup(this.buildingGroup); this.clearGroup(this.furnitureGroup); this.clearGroup(this.lightingGroup);
    const next = buildDesignScene(this.project);
    this.buildingGroup.add(next.building); this.furnitureGroup.add(...[...next.furniture.children]); this.lightingGroup.add(next.lighting);
    this.updateSelectionVisuals(); this.invalidate();
  }
  private clearGroup(group: THREE.Group) { disposeTree(group); }

  private updateSelectionVisuals() {
    this.clearGroup(this.selectionHelper);
    this.invalidate();

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
      if (!this.disposed && this.visible && !document.hidden && this.container.clientWidth && this.container.clientHeight) this.renderer.render(this.scene, this.camera);
    });
  };
}
