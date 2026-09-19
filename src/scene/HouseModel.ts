import * as THREE from 'three';
import type { HouseState } from './timeline';

const palette = { plaster: '#e4dfd3', wood: '#967253', dark: '#293531', mint: '#a8e8d2', floor: '#c8b493', linen: '#e8ded0' };
export function createHouse() {
  const root = new THREE.Group();
  const shell = new THREE.Group(), partitions = new THREE.Group(), roof = new THREE.Group();
  const furnishings = new THREE.Group(), landscape = new THREE.Group(), glazing = new THREE.Group(), plan = new THREE.Group();
  root.add(shell, partitions, roof, furnishings, landscape, glazing, plan);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  function material(color: string, roughness = .8) {
    const m = new THREE.MeshStandardMaterial({ color, roughness });
    materials.add(m); return m;
  }
  const plaster = material(palette.plaster), wood = material(palette.wood), floorMaterial = material(palette.floor);
  const furnitureWood = material('#99714c'), linen = material(palette.linen), sage = material('#6f8272'), white = material('#e8e9e3');
  const black = material(palette.dark), garden = material('#4d6248'), stone = material('#aaa99e');
  const roofMaterial = material('#d7d7cb'), roofEdge = material('#999d92');
  const glassMaterial = new THREE.MeshStandardMaterial({ color: '#a8c6be', roughness: .2, metalness: .2, transparent: true, opacity: .34 });
  materials.add(glassMaterial);
  function box(group: THREE.Group, size: number[], position: number[], mat: THREE.Material) {
    const mesh = new THREE.Mesh(boxGeometry, mat);
    mesh.scale.set(size[0], size[1], size[2]); mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  }
  // The shared 10 x 8 m footprint persists in all three representations.
  const foundation = box(root, [10.3, .22, 8.3], [0, -.16, 0], stone);
  const floor = box(root, [9.8, .08, 7.8], [0, 0, 0], floorMaterial);
  box(landscape, [12.4, .18, 10.6], [.1, -.36, .25], material('#777b69'));
  box(landscape, [7.8, .11, 2], [-1, -.2, 5], material('#b6a88d'));
  for (let i = 0; i < 22; i++) box(landscape, [.018, .015, 1.95], [-4.75 + i * .35, -.135, 5], materialShared('#8d806a'));
  function materialShared(color: string) {
    const found = [...materials].find(m => m instanceof THREE.MeshStandardMaterial && m.color.getHexString() === color.slice(1));
    return found ?? material(color);
  }
  // Back facade has solid side piers and two true window openings.
  box(shell, [10, .85, .2], [0, .425, -4], plaster);
  box(shell, [10, .45, .2], [0, 2.575, -4], plaster);
  for (const [x, width] of [[-4.25, 1.5], [0, 2], [4.25, 1.5]]) box(shell, [width, 1.5, .2], [x, 1.6, -4], plaster);
  box(shell, [.2, 2.8, 8], [-5, 1.4, 0], plaster);
  box(shell, [.2, .7, 8], [5, .35, 0], plaster);
  box(shell, [.2, .45, 8], [5, 2.575, 0], plaster);
  for (const z of [-3.55, 0, 3.55]) box(shell, [.2, 1.65, .9], [5, 1.525, z], plaster);
  // Glazed living facade; tall timber bay on the bedroom/bathroom wing.
  box(shell, [10, .3, .2], [0, 2.65, 4], plaster);
  box(shell, [10, .16, .2], [0, .08, 4], plaster);
  for (const x of [-4.92, -1.15, 1.15, 4.92]) box(shell, [.16, 2.4, .22], [x, 1.36, 4], plaster);
  box(shell, [2.4, 2.5, .24], [3.65, 1.4, 4], wood);
  for (let i = 0; i < 15; i++) box(shell, [.035, 2.5, .05], [2.5 + i * .16, 1.4, 4.15], wood);
  box(glazing, [6.0, 2.35, .035], [-1.8, 1.35, 4], glassMaterial);
  box(glazing, [.035, 1.6, 6.2], [5, 1.5, 0], glassMaterial);
  box(glazing, [7, 1.45, .035], [0, 1.6, -4], glassMaterial);
  // Window mullions and a glazed entrance door.
  for (const x of [-4.8, -3.1, -1.3, .4, 1.3]) box(glazing, [.055, 2.35, .08], [x, 1.35, 4.04], black);
  box(glazing, [1, 2.3, .08], [1.95, 1.2, 4.04], material('#52655c'));
  box(glazing, [.04, .45, .08], [2.3, 1.25, 4.11], white);
  for (const z of [-3.1, -1.5, 1.5, 3.1]) box(glazing, [.08, 1.6, .045], [5.03, 1.5, z], black);
  // Interior doors are gaps in the actual walls, not painted-on lines.
  for (const [z, length] of [[-2.3, 3.4], [1.15, 1.1], [3.35, 1.3]]) box(partitions, [.16, 2.8, length], [1.1, 1.4, z], plaster);
  box(partitions, [3.9, 2.8, .16], [3.05, 1.4, 0], plaster);
  box(partitions, [2.2, 2.8, .14], [-3.8, 1.4, -.65], plaster);
  // One removable roof assembly, tied to the same footprint.
  box(roof, [10.6, .22, 8.6], [0, 2.92, 0], roofEdge);
  box(roof, [10.2, .14, 8.2], [0, 3.09, 0], roofMaterial);
  for (const x of [-5.18, 5.18]) box(roof, [.14, .24, 8.5], [x, 3.18, 0], roofMaterial);
  for (const z of [-4.18, 4.18]) box(roof, [10.3, .24, .14], [0, 3.18, z], roofMaterial);
  box(roof, [3.1, .1, 2.3], [-2.2, 3.21, -.6], material('#3c514b'));
  for (let i = 0; i < 4; i++) box(roof, [.04, .015, 2.3], [-3.65 + i * .97, 3.27, -.6], roofEdge);
  // Living room: linen sectional, woven rug, coffee table, sideboard.
  box(furnishings, [4.6, .025, 2.4], [-1.8, .075, 1.65], material('#d9ccb9'));
  box(furnishings, [3.1, .42, .95], [-2.4, .38, .45], linen);
  box(furnishings, [3.1, .55, .22], [-2.4, .7, .02], linen);
  box(furnishings, [.8, .42, 1.6], [-3.6, .38, 1.15], linen);
  for (const x of [-3.25, -2.3, -1.35]) box(furnishings, [.8, .12, .7], [x, .65, .52], white);
  box(furnishings, [.52, .4, .18], [-1.4, .91, .21], sage);
  box(furnishings, [1.5, .12, .85], [-1.8, .57, 1.95], furnitureWood);
  box(furnishings, [.12, .5, .65], [-2.35, .28, 1.95], furnitureWood);
  box(furnishings, [.12, .5, .65], [-1.25, .28, 1.95], furnitureWood);
  box(furnishings, [.4, .03, .28], [-1.9, .65, 2], sage);
  box(furnishings, [.45, .6, 1.8], [.7, .35, 1.7], furnitureWood);
  // Kitchen: L-shaped cabinets, island, induction hob and sink.
  box(furnishings, [5.4, .95, .75], [-2, .53, -3.45], furnitureWood);
  box(furnishings, [.8, .95, 2.3], [-4.45, .53, -2], furnitureWood);
  box(furnishings, [5.5, .08, .85], [-2, 1.04, -3.45], white);
  box(furnishings, [.9, .08, 2.4], [-4.45, 1.04, -2], white);
  box(furnishings, [.95, .025, .53], [-3, 1.092, -3.4], black);
  box(furnishings, [.85, .025, .52], [-.6, 1.092, -3.4], material('#858e88'));
  box(furnishings, [2.2, .95, .85], [-1.5, .53, -1.6], sage);
  box(furnishings, [2.4, .1, 1], [-1.5, 1.06, -1.6], white);
  for (const x of [-2.1, -1]) { box(furnishings, [.5, .1, .5], [x, .75, -.7], furnitureWood); box(furnishings, [.08, .7, .08], [x, .38, -.7], black); }
  // Bedroom: headboard, upholstered bed, duvet and paired pillows.
  box(furnishings, [2.6, .03, 3], [3.15, .08, -2], material('#c7c6af'));
  box(furnishings, [2, .42, 2.6], [3.05, .33, -2.15], furnitureWood);
  box(furnishings, [2, 1.05, .14], [3.05, .6, -3.5], furnitureWood);
  box(furnishings, [1.95, .25, 2.5], [3.05, .64, -2.1], white);
  box(furnishings, [1.99, .12, 1.45], [3.05, .81, -1.6], sage);
  for (const x of [2.55, 3.55]) box(furnishings, [.78, .15, .5], [x, .83, -2.99], linen);
  box(furnishings, [.6, .52, .6], [4.45, .33, -3.05], furnitureWood);
  // Bathroom: inset tub, vanity, basin and shower tray.
  box(furnishings, [3.65, .025, 3.7], [3.05, .065, 2], material('#bdc7bd'));
  box(furnishings, [.95, .62, 1.9], [4.15, .4, 2.45], white);
  box(furnishings, [.65, .02, 1.55], [4.15, .72, 2.45], material('#b2c7bf'));
  box(furnishings, [1.6, .85, .62], [2.15, .47, .5], furnitureWood);
  box(furnishings, [.75, .1, .45], [2.15, .94, .5], white);
  box(furnishings, [1.1, .1, 1.1], [1.8, .15, 3.22], white);
  // Compact planting, using shared low-poly geometry and no image textures.
  const foliageGeometry = new THREE.IcosahedronGeometry(1, 1);
  const trunkGeometry = new THREE.CylinderGeometry(.055, .08, 1.6, 6);
  function tree(x: number, z: number, scale: number) {
    const trunk = new THREE.Mesh(trunkGeometry, wood); trunk.position.set(x, .55, z); landscape.add(trunk);
    for (const [dx, dy, dz, s] of [[0, 1.7, 0, .65], [-.35, 1.3, .12, .52], [.36, 1.45, -.1, .55], [.1, 2.12, 0, .4]]) {
      const leaf = new THREE.Mesh(foliageGeometry, garden); leaf.position.set(x + dx * scale, dy * scale, z + dz * scale); leaf.scale.setScalar(s * scale); leaf.castShadow = true; landscape.add(leaf);
    }
  }
  tree(-5.65, -2.65, 1.1); tree(5.65, 3.4, .8);
  for (let i = 0; i < 5; i++) box(landscape, [.9, .06, .4], [3.75, -.2, 4.4 + i * .36], stone);
  // True-scale technical linework follows the same room and opening coordinates.
  const ink = new THREE.LineBasicMaterial({ color: palette.mint, transparent: true, opacity: 0 }); materials.add(ink);
  function line(points: number[][]) {
    const geo = new THREE.BufferGeometry().setFromPoints(points.map(([x,z]) => new THREE.Vector3(x, .1, z)));
    const l = new THREE.Line(geo, ink); plan.add(l);
  }
  line([[-5,-4],[5,-4],[5,4],[-5,4],[-5,-4]]);
  line([[-4.82,-3.82],[4.82,-3.82],[4.82,3.82],[-4.82,3.82],[-4.82,-3.82]]);
  for (const [x,z,rotation] of [[1.1,-.6,0],[1.1,2.7,0],[1.45,4,-Math.PI/2]]) {
    const points = Array.from({length:25},(_,i)=>{const a=rotation+i/24*Math.PI/2;return [x+.85*Math.cos(a),z+.85*Math.sin(a)];});
    line(points); line([[x,z],points[0]]);
  }
  line([[-5,-5],[5,-5]]); line([[6,-4],[6,4]]);
  for (const x of [-5,5]) { line([[x,-4.6],[x,-5.35]]); line([[x-.12,-5.12],[x+.12,-4.88]]); }
  for (const z of [-4,4]) { line([[5.6,z],[6.35,z]]); line([[5.88,z-.12],[6.12,z+.12]]); }
  for (const x of [-3.1,-1.3,.4]) line([[x,3.86],[x,4.12]]);
  function label(text: string, x:number, z:number, width:number, color = '#a8e8d2') {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d')!; ctx.clearRect(0,0,512,96);ctx.fillStyle=color;ctx.font='400 62px "Inter Variable", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,48);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const mat = new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:0,depthWrite:false}); materials.add(mat);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width,width*96/512),mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.13,z);plan.add(mesh);
  }
  label('LIVING',-2,1.8,3); label('KITCHEN',-2,-2.2,3); label('BEDROOM',3,-2,2.8); label('BATH',3,2,2.5);
  label('10.00 m',0,-5.35,2.8); label('8.00 m',6.1,0,2.2); label('N ↑',-5.7,-4.8,1.2);
  const groupMats = (group: THREE.Group) => {
    const set = new Set<THREE.Material>(); group.traverse(node=>{if(node instanceof THREE.Mesh){const original = node.material as THREE.Material;const clone=original.clone();materials.add(clone);node.material=clone;set.add(clone);}});return [...set];
  };
  // Separate fading groups do not mutate materials shared with the permanent house.
  const roofMats=groupMats(roof), furnitureMats=groupMats(furnishings), landscapeMats=groupMats(landscape), glassMats=groupMats(glazing);
  const wallMats=[...groupMats(shell),...groupMats(partitions)] as THREE.MeshStandardMaterial[];
  const originals=wallMats.map(m=>m.color.clone());
  const mint=new THREE.Color(palette.mint), floorColor=new THREE.Color(palette.floor), planFloor=new THREE.Color('#030705');
  function fade(group:THREE.Group,mats:THREE.Material[],opacity:number) {
    group.visible=opacity>.005;
    for(const m of mats){m.transparent=opacity<.999;m.opacity=opacity;m.depthWrite=opacity>.95;}
  }
  function update(s:HouseState) {
    roof.position.y=s.roof*2.6;fade(roof,roofMats,1-Math.min(1,s.roof*1.5));
    shell.scale.y=(1-s.interior*.63)*(1-s.plan*.96);
    partitions.scale.y=(1-s.interior*.55)*(1-s.plan*.96);
    fade(glazing,glassMats,1-s.interior);glassMaterial.opacity=.34;
    // Original glass opacity is preserved after group material cloning.
    glazing.traverse(n=>{if(n instanceof THREE.Mesh && (n.material as THREE.MeshStandardMaterial).color.getHexString()==='a8c6be'){const m=n.material as THREE.Material;m.transparent=true;m.opacity=.34*(1-s.interior);m.depthWrite=false;}});
    fade(furnishings,furnitureMats,1-Math.min(1,s.plan*1.65));
    furnishings.position.y=-s.plan*.15;
    fade(landscape,landscapeMats,1-s.plan);
    floorMaterial.color.copy(floorColor).lerp(planFloor,s.plan);
    wallMats.forEach((m,i)=>{m.color.copy(originals[i]).lerp(mint,s.plan);m.emissive.copy(mint).multiplyScalar(s.plan*.25);});
    foundation.visible=s.plan<.98;
    plan.visible=s.plan>.001;
    ink.opacity=s.plan;
    plan.traverse(n=>{if(n instanceof THREE.Mesh)(n.material as THREE.Material).opacity=s.plan;});
    floor.visible=true;
  }
  function dispose(){root.traverse(n=>{if(n instanceof THREE.Mesh||n instanceof THREE.Line)n.geometry.dispose();});materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());foliageGeometry.dispose();trunkGeometry.dispose();}
  update({roof:0,interior:0,plan:0});
  return {root,update,dispose};
}
