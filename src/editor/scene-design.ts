import * as THREE from 'three';
import type { MoppleProject, MoppleMaterial } from '../project/schema.ts';
import { createProjectViews } from '../project/adapters.ts';
import { createFurnitureMesh } from './furniture.ts';

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
  function material(id?: string, color = '#ded9cf') {
    const key = id ?? color;
    let result = cache.get(key);
    if (!result) {
      const m: MoppleMaterial | undefined = id ? definitions.get(id) : undefined;
      const opacity = m?.opacity ?? (color === '#a8c6be' ? .3 : 1);
      result = new THREE.MeshStandardMaterial({ color: m?.color ?? color, roughness: m?.roughness ?? .8, metalness: m?.metalness ?? 0, opacity, transparent: opacity < 1, side: THREE.DoubleSide });
      cache.set(key, result);
    }
    return result;
  }
  for (const room of views.rooms) {
    const shape = new THREE.Shape(room.polygon.map(p => new THREE.Vector2(p.x, -p.z)));
    const floor = views.floors.find(f => f.id === room.floorId)!;
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: false }), material(room.materials?.floor, '#c4b59f'));
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = floor.elevation - .12;
    mesh.receiveShadow = true; mesh.userData = { roomId: room.id, floorId: floor.id }; building.add(mesh);
  }
  for (const wall of views.walls) {
    const group = new THREE.Group(); group.name = wall.id;
    group.position.set(wall.start.x, wall.baseElevation, wall.start.z); group.rotation.y = wall.rotationY;
    const room = views.rooms.find(r => r.boundary.some(e => e.wallId === wall.id));
    const wallMaterial = material(wall.materialId ?? room?.materials?.wall);
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
      if (opening.kind === 'door') box(left, right, bottom, top, .04, material(opening.materialId, '#8c6e52'));
      else {
        const frame = Math.min(.04, opening.width / 4, opening.height / 4);
        const frameMaterial = material(undefined, '#293531');
        box(left, left + frame, bottom, top, .07, frameMaterial); box(right - frame, right, bottom, top, .07, frameMaterial);
        box(left + frame, right - frame, bottom, bottom + frame, .07, frameMaterial); box(left + frame, right - frame, top - frame, top, .07, frameMaterial);
        box(left + frame, right - frame, bottom + frame, top - frame, .02, material(opening.materialId, '#a8c6be'));
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
