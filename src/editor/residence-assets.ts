import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Meter-scale furniture with upholstery, joinery, hardware and tabletop details. */
export function residenceAsset(asset:string,m:{wood:THREE.Material;fabric:THREE.Material;accent:THREE.Material;stone:THREE.Material;metal:THREE.Material}) {
 const g=new THREE.Group();
 const rounded=(w:number,h:number,d:number,r=.035)=>new RoundedBoxGeometry(w,h,d,5,Math.min(r,w/3,h/3,d/3));
 const mesh=(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number,ry=0)=>{const n=new THREE.Mesh(geo,mat);n.position.set(x,y,z);n.rotation.y=ry;n.castShadow=true;n.receiveShadow=true;g.add(n);return n;};
 const box=(w:number,h:number,d:number,mat:THREE.Material,x:number,y:number,z:number,r=.035)=>mesh(rounded(w,h,d,r),mat,x,y,z);
 const cylinder=(r:number,h:number,mat:THREE.Material,x:number,y:number,z:number)=>mesh(new THREE.CylinderGeometry(r,r,h,32),mat,x,y,z);
 const line=(points:THREE.Vector3[],radius:number,mat:THREE.Material)=>mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),32,radius,6,false),mat,0,0,0);
 const ceramic=new THREE.MeshPhysicalMaterial({color:'#a99c85',roughness:.5,clearcoat:.2});
 const linen=new THREE.MeshPhysicalMaterial({color:'#ded4c2',roughness:.97,sheen:.8});
 const black=new THREE.MeshStandardMaterial({color:'#292b26',roughness:.6});
 const seam=new THREE.MeshStandardMaterial({color:'#c9bcaa',roughness:1});
 function cushion(x:number,y:number,z:number,w:number,h:number,d:number,rotation=0){const n=box(w,h,d,m.fabric,x,y,z,.11);n.rotation.z=rotation;return n;}
 function books(x:number,y:number,z:number){for(let i=0;i<3;i++)box(.26,.023,.19,i===1?m.wood:linen,x+i*.018,y+i*.026,z,.002);}
 function vase(x:number,y:number,z:number){const points=[new THREE.Vector2(.04,0),new THREE.Vector2(.075,.035),new THREE.Vector2(.075,.13),new THREE.Vector2(.035,.18),new THREE.Vector2(.028,.23)];mesh(new THREE.LatheGeometry(points,28),ceramic,x,y,z);line([new THREE.Vector3(x,y+.18,z),new THREE.Vector3(x+.035,y+.42,z-.03),new THREE.Vector3(x+.08,y+.55,z)],.003,m.wood);}
 if(asset==='lounge_sofa'){
  box(2.6,.19,.95,m.wood,0,.16,0,.06);
  for(const x of [-1.1,1.1])for(const z of [-.32,.32])cylinder(.025,.13,m.metal,x,.055,z);
  box(2.6,.42,.18,m.fabric,0,.46,-.44,.08);
  for(const x of [-1.21,1.21])cushion(x,.44,0,.2,.44,1.02);
  for(let i=0;i<3;i++){
   const x=(i-1)*.74;cushion(x,.35,.06,.72,.2,.82);const back=cushion(x,.63,-.28,.73,.55,.22);back.rotation.x=-.12;
   line([new THREE.Vector3(x-.33,.43,-.27),new THREE.Vector3(x-.33,.445,.39),new THREE.Vector3(x+.33,.445,.39),new THREE.Vector3(x+.33,.43,-.27)],.0035,seam);
  }
  for(const side of [-1,1]){const pillow=box(.42,.42,.17,m.accent,side*.95,.6,-.07,.1);pillow.rotation.set(-.2,.12*side,.2*side);}
 }else if(asset==='linen_bed'){
  box(1.85,.27,2.15,m.wood,0,.21,0,.025);box(1.97,1.05,.12,m.wood,0,.67,-1.06,.035);
  box(1.86,.63,.09,m.fabric,0,.81,-.97,.07);box(1.79,.27,2.01,linen,0,.45,.01,.12);
  // A subdivided draped quilt; side drops and folds are actual geometry.
  const geo=new THREE.PlaneGeometry(2.04,1.56,40,40),a=geo.attributes.position;
  for(let i=0;i<a.count;i++){const x=a.getX(i),z=a.getY(i);const edge=Math.max(0,Math.abs(x)-.82);a.setXYZ(i,x,.61-edge*1.25+.013*Math.sin(x*24+z*6)+.009*Math.cos(z*31),z+.32);}const indices=geo.index!;for(let i=0;i<indices.count;i+=3){const b=indices.getX(i+1);indices.setX(i+1,indices.getX(i+2));indices.setX(i+2,b);}geo.computeVertexNormals();mesh(geo,m.fabric,0,0,0);
  box(1.8,.045,.39,m.accent,0,.63,.82,.012);
  for(const x of [-.45,.45]){const pillow=box(.7,.18,.47,linen,x,.66,-.65,.12);pillow.rotation.x=-.13;}
  line([new THREE.Vector3(-.86,.52,-.91),new THREE.Vector3(-.88,.52,1),new THREE.Vector3(.88,.52,1),new THREE.Vector3(.86,.52,-.91)],.004,seam);
 }else if(asset==='oak_chair'){
  box(.49,.08,.47,m.fabric,0,.45,0,.04);
  for(const x of [-.2,.2])for(const z of [-.18,.18]){const leg=cylinder(.018,.45,m.wood,x,.22,z);leg.rotation.z=-x*.3;}
  for(const side of [-1,1])line([new THREE.Vector3(side*.21,.28,-.2),new THREE.Vector3(side*.24,.62,-.24),new THREE.Vector3(side*.22,.86,-.25)],.021,m.wood);
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-.24,.77,-.2),new THREE.Vector3(0,.8,-.31),new THREE.Vector3(.24,.77,-.2)]);
  const back=mesh(new THREE.TubeGeometry(curve,30,.065,12,false),m.wood,0,0,0);back.scale.y=1.7;back.position.y=-.53;
 }else if(asset==='oak_dining_table'){
  box(2.3,.065,1.02,m.wood,0,.75,0,.045);
  for(const x of [-.8,.8])box(.085,.71,.69,m.wood,x,.36,0,.012);
  for(const x of [-.72,0,.72])for(const z of [-.31,.31]){cylinder(.11,.012,linen,x,.795,z);cylinder(.028,.085,ceramic,x+.16,.829,z+.01);}
  vase(0,.79,0);
 }else if(asset==='kitchen_island'){
  box(2.3,.83,.87,m.wood,0,.42,0,.006);box(2.45,.07,1.05,m.stone,0,.87,0,.013);
  for(let i=0;i<33;i++)box(.025,.69,.022,m.wood,-1.12+i*.07,.46,.449,.005);
  box(.45,.009,.35,black,.52,.91,-.12,.06);
  line([new THREE.Vector3(.52,.9,-.35),new THREE.Vector3(.52,1.16,-.35),new THREE.Vector3(.52,1.2,-.16),new THREE.Vector3(.52,1.1,-.1)],.011,m.metal);
  books(-.67,.91,0);vase(-.23,.91,.05);
 }else if(asset==='round_coffee_table'){
  cylinder(.52,.065,m.wood,0,.36,0);cylinder(.3,.32,m.wood,0,.17,0);
  for(let i=0;i<40;i++){const a=i*Math.PI/20;cylinder(.013,.3,m.wood,Math.cos(a)*.298,.17,Math.sin(a)*.298);}
  books(-.18,.404,.04);vase(.19,.39,-.05);cylinder(.11,.018,ceramic,.17,.403,.2);
 }else return null;
 return g;
}
