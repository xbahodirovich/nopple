import * as THREE from 'three';
import type { MoppleProject, MoppleMaterial } from '../project/schema.ts';
import { createProjectViews } from '../project/adapters.ts';
import { createFurnitureMesh } from './furniture.ts';
import {
  getWoodPlankTexture,
  getMarbleTexture,
  getTileTexture,
  getPlasterBumpTexture,
  getLawnTexture,
} from './textures.ts';

export function disposeTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(node => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    }
    if (node instanceof THREE.DirectionalLight || node instanceof THREE.PointLight || node instanceof THREE.SpotLight) node.shadow.dispose();
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.clear();
}

export function buildDesignScene(project: MoppleProject) {
  const views = createProjectViews(project).scene;
  const building = new THREE.Group(), furniture = new THREE.Group(), lighting = new THREE.Group();
  const definitions = new Map(project.materials.map(m => [m.id, m]));
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  function material(id?: string, color = '#ded9cf', kind: 'floor' | 'wall' | 'other' = 'other') {
    const key = `${id ?? color}_${kind}`;
    let result = cache.get(key);
    if (!result) {
      const m: MoppleMaterial | undefined = id ? definitions.get(id) : undefined;
      const opacity = m?.opacity ?? (color === '#a8c6be' ? .3 : 1);
      const cat = m?.kind?.toLowerCase() || '';
      const name = (m?.name || id || '').toLowerCase();

      let map: THREE.Texture | null = null;
      let bumpMap: THREE.Texture | null = null;
      let bumpScale = 0;
      let roughness = m?.roughness ?? 0.8;
      let metalness = m?.metalness ?? 0;

      if (cat === 'wood' || name.includes('wood') || name.includes('oak') || name.includes('parquet')) {
        map = getWoodPlankTexture(m?.color ?? color, 3, 3);
        roughness = m?.roughness ?? 0.45;
      } else if (cat === 'stone' || name.includes('stone') || name.includes('marble') || name.includes('granite')) {
        map = getMarbleTexture(2, 2);
        roughness = m?.roughness ?? 0.25;
      } else if (cat === 'tile' || name.includes('tile') || name.includes('slate') || name.includes('ceramic')) {
        map = getTileTexture(m?.color ?? color, 4, 4);
        roughness = m?.roughness ?? 0.35;
      } else if (kind === 'wall' || cat === 'wall' || name.includes('wall') || name.includes('plaster')) {
        bumpMap = getPlasterBumpTexture();
        bumpScale = 0.0025;
        roughness = m?.roughness ?? 0.88;
      } else if (cat === 'glass' || name.includes('glass') || color === '#a8c6be') {
        roughness = m?.roughness ?? 0.05;
        metalness = m?.metalness ?? 0.1;
      }

      result = new THREE.MeshStandardMaterial({
        color: m?.color ?? color,
        roughness,
        metalness,
        opacity,
        transparent: opacity < 1,
        side: THREE.DoubleSide,
        ...(map ? { map } : {}),
        ...(bumpMap ? { bumpMap, bumpScale } : {})
      });
      cache.set(key, result);
    }
    return result;
  }

  // Architectural site ground plinth (procedural grass)
  const siteSize = 64;
  const groundGeo = new THREE.BoxGeometry(siteSize, 0.4, siteSize);
  const groundMat = new THREE.MeshStandardMaterial({
    color: '#223326',
    roughness: 0.9,
    metalness: 0.05,
    map: getLawnTexture(8),
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.name = 'site_ground_plinth';
  groundMesh.position.y = -0.32;
  groundMesh.receiveShadow = true;
  building.add(groundMesh);

  for (const room of views.rooms) {
    const shape = new THREE.Shape(room.polygon.map(p => new THREE.Vector2(p.x, -p.z)));
    const floor = views.floors.find(f => f.id === room.floorId)!;
    // Floor slab
    const floorMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: false }), material(room.materials?.floor, '#c4b59f', 'floor'));
    floorMesh.rotation.x = -Math.PI / 2; floorMesh.position.y = floor.elevation - .12;
    floorMesh.receiveShadow = true; floorMesh.userData = { roomId: room.id, floorId: floor.id }; building.add(floorMesh);

    // Ceiling slab
    const ceilMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .08, bevelEnabled: false }), material(room.materials?.wall, '#ded9cf', 'wall'));
    ceilMesh.rotation.x = -Math.PI / 2; ceilMesh.position.y = floor.elevation + room.height;
    ceilMesh.receiveShadow = true; ceilMesh.userData = { isCeiling: true, ceilingRoomId: room.id, floorId: floor.id };
    building.add(ceilMesh);
  }

  // Top roof structure covering the building
  if (views.rooms.length > 0) {
    const allPoints = views.rooms.flatMap(r => r.polygon);
    const xs = allPoints.map(p => p.x), zs = allPoints.map(p => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const topFloor = views.floors.reduce((max, f) => (f.elevation > max.elevation ? f : max), views.floors[0]);
    const roofY = topFloor ? topFloor.elevation + topFloor.height + 0.1 : 3.0;

    const roofWidth = (maxX - minX) + 0.7;
    const roofDepth = (maxZ - minZ) + 0.7;
    const roofGeo = new THREE.BoxGeometry(roofWidth, 0.22, roofDepth);
    const roofMat = material('house_stone', '#363d3a', 'other');
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.set((minX + maxX) / 2, roofY + 0.11, (minZ + maxZ) / 2);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    roofMesh.name = 'building_roof';
    roofMesh.userData = { isRoof: true };
    building.add(roofMesh);
  }

  for (const wall of views.walls) {
    const group = new THREE.Group(); group.name = wall.id; group.userData.floorId = wall.floorId;
    group.position.set(wall.start.x, wall.baseElevation, wall.start.z); group.rotation.y = wall.rotationY;
    const room = views.rooms.find(r => r.boundary.some(e => e.wallId === wall.id));
    const wallMaterial = material(wall.materialId ?? room?.materials?.wall, '#ded9cf', 'wall');
    function box(x0: number, x1: number, y0: number, y1: number, thickness: number, mat: THREE.Material, selectable = false) {
      if (x1 - x0 <= 1e-7 || y1 - y0 <= 1e-7) return;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, thickness), mat);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); mesh.castShadow = true; mesh.receiveShadow = true;
      if (selectable) mesh.userData.wallId = wall.id;
      group.add(mesh);
    }
    const holes = wall.openings.map(o => ({ ...o, left: o.position * wall.length - o.width / 2, right: o.position * wall.length + o.width / 2, bottom: o.sillHeight, top: o.sillHeight + o.height }));
    const xs = [...new Set([0, wall.length, ...holes.flatMap(o => [o.left, o.right])])].sort((a, b) => a - b);
    const ys = [...new Set([0, wall.height, ...holes.flatMap(o => [o.bottom, o.top])])].sort((a, b) => a - b);
    for (let x = 0; x < xs.length - 1; x++) for (let y = 0; y < ys.length - 1; y++) {
      const cx = (xs[x] + xs[x + 1]) / 2, cy = (ys[y] + ys[y + 1]) / 2;
      if (!holes.some(h => cx > h.left && cx < h.right && cy > h.bottom && cy < h.top)) box(xs[x], xs[x + 1], ys[y], ys[y + 1], wall.thickness, wallMaterial, true);
    }
    for (const opening of holes) {
      const { left, right, bottom, top } = opening;
      if (opening.kind === 'door') {
        // Door frame and door panel with metallic handle
        const frameMat = material(undefined, '#293531');
        const doorPanelMat = material(opening.materialId, '#8c6e52');
        box(left, right, bottom, top, .04, doorPanelMat);
        box(left, left + 0.05, bottom, top, .07, frameMat);
        box(right - 0.05, right, bottom, top, .07, frameMat);
        box(left, right, top - 0.05, top, .07, frameMat);
      } else {
        const frame = Math.min(.04, opening.width / 4, opening.height / 4);
        const frameMaterial = material(undefined, '#293531');
        box(left, left + frame, bottom, top, .07, frameMaterial); box(right - frame, right, bottom, top, .07, frameMaterial);
        box(left + frame, right - frame, bottom, bottom + frame, .07, frameMaterial); box(left + frame, right - frame, top - frame, top, .07, frameMaterial);
        box(left + frame, right - frame, bottom + frame, top - frame, .02, material(opening.materialId ?? 'house_glass', '#a8c6be'));
      }
    }
    building.add(group);
  }
  for (const object of project.interior.objects) furniture.add(createFurnitureMesh(object, definitions));
  for (const light of project.lighting) {
    let node: THREE.Light;
    if (light.type === 'ambient') node = new THREE.AmbientLight(light.color, light.intensity);
    else if (light.type === 'directional') {
      const sun = new THREE.DirectionalLight(light.color, light.intensity);
      sun.position.set(light.position.x, light.position.y, light.position.z);
      sun.target.position.set(light.target.x, light.target.y, light.target.z); lighting.add(sun.target);
      sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -.0004; sun.shadow.normalBias = .035;
      Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, far: 100 }); sun.shadow.camera.updateProjectionMatrix(); node = sun;
    } else {
      const point = new THREE.PointLight(light.color, light.intensity, light.range);
      point.position.set(light.position.x, light.position.y, light.position.z); node = point;
    }
    node.name = light.id; lighting.add(node);
  }
  return { building, furniture, lighting };
}
