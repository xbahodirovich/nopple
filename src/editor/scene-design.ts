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
        map = getWoodPlankTexture(m?.color ?? color, kind==='floor'?.18:1, kind==='floor'?.18:1);
        roughness = m?.roughness ?? 0.45;
      } else if (cat === 'stone' || name.includes('stone') || name.includes('marble') || name.includes('granite')) {
        map = kind==='floor' && courtyard ? getTileTexture(m?.color??color,1.25,1.25) : getMarbleTexture(2, 2);
        if(kind==='floor'&&courtyard){bumpMap=map;bumpScale=.012;}
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

      const glass = cat === 'glass' || name.includes('glass') || color === '#a8c6be';
      result = new THREE.MeshPhysicalMaterial({
        color: map && (cat === 'wood' || (cat==='stone'&&kind==='floor'&&courtyard)) ? '#ffffff' : m?.color ?? color,
        roughness,
        metalness,
        opacity,
        transparent: opacity < 1,
        ...(glass ? {metalness:0,roughness:.08,depthWrite:false,envMapIntensity:1.2,clearcoat:1,clearcoatRoughness:.05} : {}),
        side: THREE.DoubleSide,
        ...(map ? { map } : {}),
        ...(bumpMap ? { bumpMap, bumpScale } : {})
      });
      cache.set(key, result);
    }
    return result;
  }

  // Architectural site ground plinth (procedural grass)
  const courtyard = project.project.id === 'courtyard_residence';
  const siteScale=courtyard ? Math.sqrt(180/150.785) : 1;
  const siteSize = courtyard ? 14*siteScale : 64;
  const groundGeo = new THREE.BoxGeometry(siteSize, 0.4, siteSize);
  const groundMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.9,
    metalness: 0.05,
    map: courtyard ? getTileTexture('#b7b1a0',12,12) : getLawnTexture(8),
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.name = 'site_ground_plinth';
  groundMesh.position.y = -0.32;
  if(courtyard) groundMesh.position.set(5.3*siteScale,-.32,5*siteScale);
  groundMesh.receiveShadow = true;
  building.add(groundMesh);

  for (const room of views.rooms) {
    const shape = new THREE.Shape(room.polygon.map(p => new THREE.Vector2(p.x, -p.z)));
    const floor = views.floors.find(f => f.id === room.floorId)!;
    const withStairOpening = (ceiling: boolean) => {
      const slab = new THREE.Shape(room.polygon.map(p => new THREE.Vector2(p.x, -p.z)));
      for (const stair of project.interior.objects.filter(object => object.kind === 'stairs')) {
        const belongs = ceiling ? stair.roomId === room.id : room.type === 'hallway' && Math.abs(stair.position.y + (stair.size?.y ?? 2.8) - floor.elevation) < .05;
        if (!belongs) continue;
        const sideways = Math.abs(Math.sin(stair.rotation.y)) > .7;
        const halfX = (sideways ? stair.size?.z ?? 3.2 : stair.size?.x ?? 1.2) / 2 + .06;
        const halfZ = (sideways ? stair.size?.x ?? 1.2 : stair.size?.z ?? 3.2) / 2 + .06;
        const x = stair.position.x, z = stair.position.z;
        const xs = room.polygon.map(p => p.x), zs = room.polygon.map(p => p.z);
        if(x-halfX<=Math.min(...xs)||x+halfX>=Math.max(...xs)||z-halfZ<=Math.min(...zs)||z+halfZ>=Math.max(...zs))continue;
        const hole = new THREE.Path(); hole.moveTo(x-halfX,-z-halfZ); hole.lineTo(x-halfX,-z+halfZ); hole.lineTo(x+halfX,-z+halfZ); hole.lineTo(x+halfX,-z-halfZ); hole.closePath(); slab.holes.push(hole);
      }
      return slab;
    };
    // Floor slab
    const floorMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(withStairOpening(false), { depth: .12, bevelEnabled: false }), material(room.materials?.floor, '#c4b59f', 'floor'));
    floorMesh.rotation.x = -Math.PI / 2; floorMesh.position.y = floor.elevation - .12;
    floorMesh.receiveShadow = true; floorMesh.userData = { roomId: room.id, floorId: floor.id }; building.add(floorMesh);

    if (/courtyard|patio|garden/i.test(room.name) && room.type === 'custom') continue;
    // Ceiling slab
    const ceilMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(withStairOpening(true), { depth: .08, bevelEnabled: false }), material(room.materials?.ceiling ?? room.materials?.wall, '#ded9cf', 'wall'));
    ceilMesh.rotation.x = -Math.PI / 2; ceilMesh.position.y = floor.elevation + room.height;
    ceilMesh.receiveShadow = true; ceilMesh.userData = { isCeiling: true, ceilingRoomId: room.id, floorId: floor.id };
    building.add(ceilMesh);
  }

  // Each top-level room contributes its own roof, leaving courtyards open.
  const topFloor = views.floors.reduce<typeof views.floors[number] | undefined>((top, floor) => !top || floor.elevation > top.elevation ? floor : top, undefined);
  for (const room of views.rooms.filter(room => room.floorId === topFloor?.id && !/courtyard|patio|garden/i.test(room.name))) {
    const shape = new THREE.Shape(room.polygon.map(point => new THREE.Vector2(point.x, -point.z)));
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .18, bevelEnabled: false }), material('house_stone', '#363d3a'));
    roof.rotation.x = -Math.PI / 2; roof.position.y = topFloor!.elevation + topFloor!.height + .08;
    roof.castShadow = true; roof.receiveShadow = true; roof.name = `roof_${room.id}`; roof.userData.isRoof = true;
    building.add(roof);
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
      group.add(mesh); return mesh;
    }
    const holes = wall.openings.map(o => ({ ...o, left: o.position * wall.length - o.width / 2, right: o.position * wall.length + o.width / 2, bottom: o.sillHeight, top: o.sillHeight + o.height }));
    const xs = [...new Set([0, wall.length, ...holes.flatMap(o => [o.left, o.right])])].sort((a, b) => a - b);
    const ys = [...new Set([0, wall.height, ...holes.flatMap(o => [o.bottom, o.top])])].sort((a, b) => a - b);
    for (let x = 0; x < xs.length - 1; x++) for (let y = 0; y < ys.length - 1; y++) {
      const cx = (xs[x] + xs[x + 1]) / 2, cy = (ys[y] + ys[y + 1]) / 2;
      if (!holes.some(h => cx > h.left && cx < h.right && cy > h.bottom && cy < h.top)) box(xs[x], xs[x + 1], ys[y], ys[y + 1], wall.thickness, wallMaterial, true);
    }
    // Skirting follows the wall's real openings instead of bridging doorways.
    for (let x = 0; x < xs.length - 1; x++) {
      const center=(xs[x]+xs[x+1])/2;
      if (!holes.some(h=>h.kind==='door' && center>h.left && center<h.right)) box(xs[x],xs[x+1],0,.085,wall.thickness+.028,material(undefined,'#d2c7b8'));
    }
    const exterior = views.rooms.filter(r=>r.boundary.some(edge=>edge.wallId===wall.id)).length === 1;
    if (exterior) {
      const plinth=box(0,wall.length,-.22,.04,wall.thickness+.055,material(undefined,'#a7a298'));
      if(plinth)plinth.name=`foundation_${wall.id}`;
      if(wall.floorId===topFloor?.id && !/courtyard|patio|garden/i.test(room?.name??'')) {
        const coping=box(-.04,wall.length+.04,wall.height+.08,wall.height+.19,wall.thickness+.13,material(undefined,'#434c47'));
        if(coping){coping.name=`coping_${wall.id}`;coping.userData.isRoof=true;}
      }
    }
    for (const opening of holes) {
      const { left, right, bottom, top } = opening;
      if (opening.kind === 'door') {
        // Door frame and door panel with metallic handle
        const frameMat = material(undefined, '#c5b7a2');
        const doorPanelMat = material(opening.materialId, '#8c6e52');
        box(left, right, bottom, top, .045, doorPanelMat);
        box(left-.025, left + .04, bottom, top+.025, wall.thickness+.04, frameMat);
        box(right - .04, right+.025, bottom, top+.025, wall.thickness+.04, frameMat);
        box(left, right, top - .04, top+.025, wall.thickness+.04, frameMat);
        for(const side of [-1,1]) {
          const plate=new THREE.Mesh(new THREE.BoxGeometry(.035,.15,.012),material(undefined,'#424945')); plate.position.set(right-.14,bottom+1,side*.034); group.add(plate);
          const handle=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,.12,12),material(undefined,'#424945'));handle.rotation.z=Math.PI/2;handle.position.set(right-.18,bottom+1.04,side*.065);handle.castShadow=true;group.add(handle);
        }
      } else {
        const frame = Math.min(.04, opening.width / 4, opening.height / 4);
        const frameMaterial = material(undefined, '#293531');
        box(left, left + frame, bottom, top, wall.thickness+.025, frameMaterial); box(right - frame, right, bottom, top, wall.thickness+.025, frameMaterial);
        box(left + frame, right - frame, bottom, bottom + frame, wall.thickness+.025, frameMaterial); box(left + frame, right - frame, top - frame, top, wall.thickness+.025, frameMaterial);
        if(opening.width>1.4)box((left+right)/2-.012,(left+right)/2+.012,bottom+frame,top-frame,.07,frameMaterial);
        const pane=box(left + frame, right - frame, bottom + frame, top - frame, .012, material(opening.materialId ?? 'house_glass', '#a8c6be'));
        if(pane){pane.castShadow=false;pane.name=`glazing_${opening.id}`;}
        const sill=box(left-.045,right+.045,bottom-.035,bottom,wall.thickness+.12,material(undefined,'#bab7ae'));
        if(sill)sill.name=`sill_${opening.id}`;
      }
    }
    if(courtyard && wall.floorId==='upper' && !(wall.start.z===0&&wall.end.z===0) && !(wall.start.x===0&&wall.end.x===0)) {
      group.traverse(node=>{if(node instanceof THREE.Mesh){node.material=Array.isArray(node.material)?node.material.map(m=>m.clone()):node.material.clone();node.userData.cutawayHeight=wall.baseElevation+.95;}});
    }
    building.add(group);
  }
  if(courtyard) {
    const timber=material('oak');
    // Front brise-soleil screens and the fine reveal below the upper volume.
    for(let i=0;i<33;i++) {
      const slat=new THREE.Mesh(new THREE.BoxGeometry(.055,2.65,.1),timber);
      slat.position.set((.2+i*.082)*siteScale,1.36,10.13*siteScale);slat.castShadow=true;slat.receiveShadow=true;
      slat.userData.floorId='ground';building.add(slat);
    }
  }
  for (const object of project.interior.objects) furniture.add(createFurnitureMesh(object, definitions));
  for (const light of project.lighting) {
    let node: THREE.Light;
    if (light.type === 'ambient') node = new THREE.AmbientLight(light.color, light.intensity);
    else if (light.type === 'directional') {
      const sun = new THREE.DirectionalLight(light.color, light.intensity);
      sun.position.set(light.position.x, light.position.y, light.position.z);
      sun.target.position.set(light.target.x, light.target.y, light.target.z); lighting.add(sun.target);
      sun.castShadow = true; sun.shadow.mapSize.set(courtyard?2048:1024, courtyard?2048:1024); sun.shadow.bias = -.0004; sun.shadow.normalBias = .035;
      Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, far: 100 }); sun.shadow.camera.updateProjectionMatrix(); node = sun;
    } else {
      const point = new THREE.PointLight(light.color, light.intensity, light.range);
      point.position.set(light.position.x, light.position.y, light.position.z); node = point;
    }
    node.name = light.id; lighting.add(node);
  }
  return { building, furniture, lighting };
}
