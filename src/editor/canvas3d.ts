import * as THREE from 'three';
import type { MoppleProjectEngine } from '../project/engine.ts';
import { distance } from '../project/geometry.ts';
import type { MoppleInteriorObject, MoppleLight, MoppleMaterial, MoppleProject, MoppleWall } from '../project/schema.ts';
import type { SelectedEntity } from './canvas2d.ts';
import { createFurnitureMesh, getFurnitureFootprint } from './furniture.ts';

export interface Canvas3DOptions {
  engine: MoppleProjectEngine;
  onSelect?: (entity: SelectedEntity | null) => void;
}

export class Canvas3D {
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

  constructor(container: HTMLElement, options: Canvas3DOptions) {
    this.container = container;
    this.engine = options.engine;
    this.project = options.engine.getSnapshot();
    this.onSelect = options.onSelect;

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
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 150);
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

    // Render loop
    this.animate();
  }

  public destroy() {
    this.disposed = true;
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
    this.cameraDistance = 14;
    this.cameraSpherical.set(14, Math.PI / 3.5, Math.PI / 4);
    this.cameraTarget.set(0, 0.5, 0);
    this.updateCameraPosition();
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
  }

  private resize() {
    const rect = this.container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height, false);
  }

  private setupEvents() {
    const el = this.renderer.domElement;

    el.addEventListener('contextmenu', e => e.preventDefault());

    el.addEventListener('wheel', e => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
      this.cameraDistance = Math.max(3, Math.min(45, this.cameraDistance * zoomFactor));
      this.updateCameraPosition();
    }, { passive: false });

    el.addEventListener('pointerdown', e => {
      const rect = el.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.prevMouse = { x: e.clientX, y: e.clientY };

      el.setPointerCapture(e.pointerId);

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
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);

      if (this.isDraggingObject && this.draggedObject) {
        this.isDraggingObject = false;
        const obj = this.draggedObject;
        this.draggedObject = null;
        try {
          this.engine.moveInteriorObject(obj.id, obj.position, obj.rotation, obj.roomId);
        } catch (err) {
          console.error('Failed to commit 3D drag', err);
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
    // Clear dynamic groups
    this.clearGroup(this.buildingGroup);
    this.clearGroup(this.furnitureGroup);
    this.clearGroup(this.lightingGroup);

    // 1. Build Lights
    this.buildLights();

    // 2. Build Floor Plate
    this.buildFloors();

    // 3. Build Walls with Window & Door cutouts
    this.buildWalls();

    // 4. Build Furniture Objects
    this.buildFurniture();

    // 5. Update Selection Visuals
    this.updateSelectionVisuals();
  }

  private clearGroup(group: THREE.Group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    }
  }

  private buildLights() {
    // Hemisphere ambient light
    const hemiLight = new THREE.HemisphereLight('#edf2ee', '#2e3a35', 1.8);
    this.lightingGroup.add(hemiLight);

    // Main sun
    const sun = new THREE.DirectionalLight('#fff5e3', 2.8);
    sun.position.set(-8, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.0004;
    this.lightingGroup.add(sun);

    // Soft cool fill
    const fill = new THREE.DirectionalLight('#b3d9ce', 0.9);
    fill.position.set(10, 8, -8);
    this.lightingGroup.add(fill);

    // Project point lights
    for (const light of this.project.lighting) {
      if (light.type === 'point') {
        const ptLight = new THREE.PointLight(light.color, light.intensity * 2, light.range * 1.5);
        ptLight.position.set(light.position.x, light.position.y, light.position.z);
        ptLight.castShadow = false;
        this.lightingGroup.add(ptLight);

        // Small emissive bulb indicator
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 8, 8),
          new THREE.MeshBasicMaterial({ color: light.color })
        );
        bulb.position.copy(ptLight.position);
        this.lightingGroup.add(bulb);
      }
    }
  }

  private buildFloors() {
    // Floor slab
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#c4b59f',
      roughness: 0.8,
      metalness: 0.05,
    });

    // Check project materials for floor override
    const primaryFloorMat = this.project.materials.find(m => m.kind === 'flooring' || m.id.includes('floor') || m.id.includes('oak'));
    if (primaryFloorMat) {
      floorMat.color.set(primaryFloorMat.color);
      floorMat.roughness = primaryFloorMat.roughness;
      floorMat.metalness = primaryFloorMat.metalness;
    }

    // Compute bounding box of building
    let minX = -5, maxX = 5, minZ = -4, maxZ = 4;
    if (this.project.building.walls.length > 0) {
      const allX = this.project.building.walls.flatMap(w => [w.start.x, w.end.x]);
      const allZ = this.project.building.walls.flatMap(w => [w.start.z, w.end.z]);
      minX = Math.min(...allX) - 0.6;
      maxX = Math.max(...allX) + 0.6;
      minZ = Math.min(...allZ) - 0.6;
      maxZ = Math.max(...allZ) + 0.6;
    }

    const fw = maxX - minX;
    const fd = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    const floorGeo = new THREE.BoxGeometry(fw, 0.15, fd);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(cx, -0.075, cz);
    floorMesh.receiveShadow = true;
    this.buildingGroup.add(floorMesh);

    // Foundation plinth
    const plinthMat = new THREE.MeshStandardMaterial({ color: '#202925', roughness: 0.9 });
    const plinthGeo = new THREE.BoxGeometry(fw + 0.5, 0.2, fd + 0.5);
    const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
    plinthMesh.position.set(cx, -0.22, cz);
    this.buildingGroup.add(plinthMesh);
  }

  private buildWalls() {
    const defaultWallMat = new THREE.MeshStandardMaterial({
      color: '#ded9cf',
      roughness: 0.85,
      metalness: 0.0,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#a8c6be',
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.35,
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: '#232927', roughness: 0.5, metalness: 0.4 });
    const doorMat = new THREE.MeshStandardMaterial({ color: '#8c6e52', roughness: 0.7, metalness: 0.05 });

    for (const wall of this.project.building.walls) {
      const len = distance(wall.start, wall.end);
      if (len < 0.01) continue;

      const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
      const wallGroup = new THREE.Group();
      wallGroup.position.set(wall.start.x, 0, wall.start.z);
      wallGroup.rotation.y = -angle; // Three.js rotation around Y

      let wallMat = defaultWallMat;
      if (wall.materialId && this.materialsMap.has(wall.materialId)) {
        const m = this.materialsMap.get(wall.materialId)!;
        wallMat = new THREE.MeshStandardMaterial({ color: m.color, roughness: m.roughness, metalness: m.metalness });
      }

      // Collect openings sorted along wall (position 0..1)
      const openings = [
        ...this.project.building.doors.filter(d => d.wallId === wall.id).map(d => ({ ...d, kind: 'door' as const, sill: 0 })),
        ...this.project.building.windows.filter(w => w.wallId === wall.id).map(w => ({ ...w, kind: 'window' as const, sill: w.sillHeight })),
      ].sort((a, b) => a.position - b.position);

      if (openings.length === 0) {
        // Solid wall
        const geo = new THREE.BoxGeometry(len, wall.height, wall.thickness);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(len / 2, wall.height / 2, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { wallId: wall.id };
        wallGroup.add(mesh);
      } else {
        // Construct wall segments between openings
        let currentPos = 0;
        for (const op of openings) {
          const opStart = Math.max(0, len * op.position - op.width / 2);
          const opEnd = Math.min(len, len * op.position + op.width / 2);

          // Wall segment before opening
          const segLen = opStart - currentPos;
          if (segLen > 0.01) {
            const segGeo = new THREE.BoxGeometry(segLen, wall.height, wall.thickness);
            const segMesh = new THREE.Mesh(segGeo, wallMat);
            segMesh.position.set(currentPos + segLen / 2, wall.height / 2, 0);
            segMesh.castShadow = true;
            segMesh.receiveShadow = true;
            segMesh.userData = { wallId: wall.id };
            wallGroup.add(segMesh);
          }

          // Wall below opening (for windows with sillHeight > 0)
          if (op.kind === 'window' && op.sill > 0.01) {
            const sillGeo = new THREE.BoxGeometry(op.width, op.sill, wall.thickness);
            const sillMesh = new THREE.Mesh(sillGeo, wallMat);
            sillMesh.position.set(opStart + op.width / 2, op.sill / 2, 0);
            sillMesh.castShadow = true;
            sillMesh.receiveShadow = true;
            sillMesh.userData = { wallId: wall.id };
            wallGroup.add(sillMesh);
          }

          // Wall segment above opening (lintel)
          const topGap = wall.height - (op.sill + op.height);
          if (topGap > 0.01) {
            const lintelGeo = new THREE.BoxGeometry(op.width, topGap, wall.thickness);
            const lintelMesh = new THREE.Mesh(lintelGeo, wallMat);
            lintelMesh.position.set(opStart + op.width / 2, wall.height - topGap / 2, 0);
            lintelMesh.castShadow = true;
            lintelMesh.receiveShadow = true;
            lintelMesh.userData = { wallId: wall.id };
            wallGroup.add(lintelMesh);
          }

          // Opening elements (door slab / window glass and frame)
          const opCenter = opStart + op.width / 2;
          if (op.kind === 'window') {
            // Window frame
            const fGeo = new THREE.BoxGeometry(op.width, op.height, wall.thickness * 0.4);
            const fMesh = new THREE.Mesh(fGeo, frameMat);
            fMesh.position.set(opCenter, op.sill + op.height / 2, 0);
            // Window glass
            const gGeo = new THREE.BoxGeometry(op.width - 0.08, op.height - 0.08, 0.02);
            const gMesh = new THREE.Mesh(gGeo, glassMat);
            gMesh.position.set(opCenter, op.sill + op.height / 2, 0);
            wallGroup.add(fMesh, gMesh);
          } else if (op.kind === 'door') {
            // Door slab (slightly ajar 25 degrees)
            const doorGeo = new THREE.BoxGeometry(op.width, op.height, 0.04);
            const doorMesh = new THREE.Mesh(doorGeo, doorMat);
            doorMesh.position.set(opStart + op.width / 2, op.height / 2, 0.08);
            doorMesh.rotation.y = 0.4;
            doorMesh.castShadow = true;
            wallGroup.add(doorMesh);
          }

          currentPos = opEnd;
        }

        // Final segment after last opening
        const remaining = len - currentPos;
        if (remaining > 0.01) {
          const segGeo = new THREE.BoxGeometry(remaining, wall.height, wall.thickness);
          const segMesh = new THREE.Mesh(segGeo, wallMat);
          segMesh.position.set(currentPos + remaining / 2, wall.height / 2, 0);
          segMesh.castShadow = true;
          segMesh.receiveShadow = true;
          segMesh.userData = { wallId: wall.id };
          wallGroup.add(segMesh);
        }
      }

      this.buildingGroup.add(wallGroup);
    }
  }

  private buildFurniture() {
    for (const obj of this.project.interior.objects) {
      const meshGroup = createFurnitureMesh(obj, this.materialsMap);
      this.furnitureGroup.add(meshGroup);
    }
  }

  private updateSelectionVisuals() {
    this.clearGroup(this.selectionHelper);

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
        ring.position.set(obj.position.x, 0.02, obj.position.z);
        this.selectionHelper.add(ring);
      }
    }
  }

  private animate = () => {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame(this.animate);
  };
}
