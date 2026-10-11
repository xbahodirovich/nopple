import { createProject } from './engine.ts';
import {polygonArea,roomPolygon} from './geometry.ts';
import { validateProject } from './validation.ts';
import type { MoppleInteriorObject, MoppleRoom, Point } from './schema.ts';

/** The reference residence is a real project, with editable architecture and furniture. */
export function createCourtyardResidence() {
  const p=createProject('Your home',{id:'courtyard_residence'});
  p.metadata.description='A furnished courtyard residence: limestone, natural oak and warm plaster.';
  p.metadata.sun={mode:'manual',azimuth:225,elevation:48,intensity:3.1,warmth:.25};
  p.lighting=[{id:'light_sun',type:'directional',color:'#fff1dc',intensity:2.6,position:{x:20,y:30,z:10},target:{x:5,y:0,z:5}},{id:'light_ambient',type:'ambient',color:'#dae5ed',intensity:.2}];
  p.building.floors=[{id:'ground',name:'Ground floor',elevation:0,height:3},{id:'upper',name:'Upper floor',elevation:3.12,height:2.8}];
  p.materials=[
    {id:'plaster',name:'Warm plaster',kind:'paint',color:'#e6dfd1',roughness:.92,metalness:0,opacity:1},
    {id:'limestone',name:'Limestone tile',kind:'stone',color:'#d9cebb',roughness:.75,metalness:0,opacity:1},
    {id:'oak',name:'Natural oak',kind:'wood',color:'#bc9b70',roughness:.65,metalness:0,opacity:1},
    {id:'linen',name:'Ivory linen',kind:'fabric',color:'#e3dace',roughness:.96,metalness:0,opacity:1},
    {id:'house_glass',name:'Clear glazing',kind:'glass',color:'#dce4df',roughness:.05,metalness:0,opacity:.15},
    {id:'house_stone',name:'Stone coping',kind:'stone',color:'#afa99d',roughness:.8,metalness:0,opacity:1},
  ];
  function room(id:string,name:string,type:MoppleRoom['type'],floorId:string,points:Point[],height?:number) {
    const boundary=points.map((start,i)=>{
      const end=points[(i+1)%points.length];
      const same=(a:Point,b:Point)=>a.x===b.x&&a.z===b.z;
      const existing=p.building.walls.find(w=>w.floorId===floorId&&((same(w.start,start)&&same(w.end,end))||(same(w.start,end)&&same(w.end,start))));
      if(existing)return {wallId:existing.id,reversed:!same(existing.start,start)};
      const wallId=`${id}_wall_${i}`;
      p.building.walls.push({id:wallId,floorId,start:{...start},end:{...end},thickness:.2,height:height??(floorId==='upper'?2.8:3),materialId:'plaster'});
      return {wallId,reversed:false};
    });
    p.building.rooms.push({id,name,type,floorId,boundary,height:floorId==='upper'?2.8:3,materials:{floor:floorId==='upper'?'oak':'limestone',wall:'plaster',ceiling:'plaster'}});
  }
  const rect=(x:number,z:number,w:number,d:number)=>[{x,z},{x:x+w,z},{x:x+w,z:z+d},{x,z:z+d}];
  room('living','Living room','living_room','ground',[{x:0,z:0},{x:9,z:0},{x:9,z:6},{x:4.8,z:6},{x:4.8,z:10},{x:0,z:10}]);
  room('garden','Courtyard garden','custom','ground',rect(4.8,6,4.2,4),.65);
  room('entry','Entry & stair','hallway','ground',rect(9,0,1.6,10),1.05);
  for(let i=0;i<3;i++)room(`bedroom_${i+1}`,i===0?'Primary bedroom':`Bedroom ${i+1}`,'bedroom','upper',rect(i*3,0,3,4.2));
  room('landing','Landing','hallway','upper',rect(0,4.2,9,1.25),1.05);
  room('bathroom_1','Bathroom 1','bathroom','upper',rect(9,0,2.3,2.65));
  room('bathroom_2','Bathroom 2','bathroom','upper',rect(9,2.65,2.3,2.8));
  function window(wallId:string,width:number,position=.5,height=2.5,sillHeight=.12){p.building.windows.push({id:`window_${p.building.windows.length}`,wallId,width,position,height,sillHeight,materialId:'house_glass'});}
  window('living_wall_0',7.8);window('living_wall_1',4.9);window('living_wall_2',3.8);window('living_wall_3',3.5);window('living_wall_4',3.9);window('living_wall_5',7.9);
  for(let i=1;i<=3;i++){
    window(`bedroom_${i}_wall_0`,2.4,.5,2.2,.28);
    p.building.doors.push({id:`bedroom_door_${i}`,wallId:`bedroom_${i}_wall_2`,position:.77,width:.78,height:2.25,materialId:'oak'});
  }
  for(let i=1;i<=2;i++)p.building.doors.push({id:`bath_door_${i}`,wallId:`bathroom_${i}_wall_3`,position:.5,width:.8,height:2.2,materialId:'oak'});
  function item(id:string,kind:MoppleInteriorObject['kind'],roomId:string,x:number,z:number,sx:number,sy:number,sz:number,rotation=0,assetId=kind as string,y?:number){
    p.interior.objects.push({id,kind,assetId,roomId,position:{x,y:y??(roomId.startsWith('bedroom')||roomId.startsWith('bathroom')?3.12:0),z},rotation:{x:0,y:rotation,z:0},scale:{x:1,y:1,z:1},size:{x:sx,y:sy,z:sz},materialId:['sofa','bed','chair'].includes(kind)||assetId.includes('rug')?'linen':'oak'});
  }
  item('living_rug','decoration','living',2.65,7.15,3.7,.018,3.3,0,'woven_rug');
  item('main_sofa','sofa','living',1,7.2,2.85,.83,1.05,Math.PI/2);
  item('return_sofa','sofa','living',2.6,8.8,2.25,.83,1.05,Math.PI);
  item('coffee_table','table','living',2.75,7,1.05,.38,1.05,0,'round_coffee_table');
  item('lounge_chair','chair','living',4,7.9,.73,.82,.78,-Math.PI/4);
  item('media_console','cabinet','living',4.35,5.25,2.25,.48,.42,Math.PI/2);
  item('floor_lamp','lamp','living',.5,9.35,.42,1.6,.42);
  item('dining_table','table','living',2.8,3.6,2.3,.77,1.02);
  for(let i=0;i<3;i++)for(const side of [-1,1])item(`dining_chair_${i}_${side===1?'a':'b'}`,'chair','living',2.05+i*.76,3.6+side*.82,.5,.81,.5,side===1?Math.PI:0);
  item('kitchen_island','cabinet','living',6.7,3.7,2.45,.92,1.05,0,'kitchen_island');
  for(let i=0;i<3;i++)item(`island_stool_${i}`,'chair','living',5.9+i*.8,4.65,.42,.72,.43,Math.PI);
  for(let i=0;i<3;i++)item(`kitchen_counter_${i}`,'cabinet','living',5.15+i*1.27,.5,1.24,.92,.64);
  item('cooker','appliance','living',8.55,1.55,.62,.93,.7,Math.PI/2);
  item('tall_storage','cabinet','living',.45,1.2,1.8,2.45,.6,Math.PI/2);
  item('interior_plant','decoration','living',.65,4.9,.65,1.6,.65);
  item('interior_plant_2','decoration','living',8.5,5.45,.65,1.4,.65);
  for(let i=0;i<3;i++){
    const r=`bedroom_${i+1}`,cx=1.5+3*i;
    item(`${r}_rug`,'decoration',r,cx,2.4,2.45,.015,2.7,0,'woven_rug');
    item(`${r}_bed`,'bed',r,cx,2.2,1.65,1.05,2.2);
    for(const side of [-1,1]){
      item(`${r}_nightstand_${side===1?'r':'l'}`,'cabinet',r,cx+side*1.12,1.45,.45,.48,.43);
      item(`${r}_lamp_${side===1?'r':'l'}`,'lamp',r,cx+side*1.12,1.45,.22,.4,.22,0,'lamp',3.6);
    }
  }
  for(let i=1;i<=2;i++){
    const z=i===1?0:2.65,r=`bathroom_${i}`;
    item(`${r}_shower`,'fixture',r,10.65,z+.65,.95,2.2,1.05,0,'shower_enclosure');
    item(`${r}_toilet`,'fixture',r,9.55,z+.55,.4,.75,.66,0,'toilet');
    item(`${r}_vanity`,'cabinet',r,10.4,z+2.2,1.2,.85,.5);
  }
  item('external_stair','stairs','entry',9.8,7.4,1.25,3.12,4.9,Math.PI);
  item('courtyard_tree','decoration','garden',6.7,7.95,2.6,3.5,2.6,0,'olive_tree');
  for(let i=0;i<8;i++)item(`garden_plant_${i}`,'decoration','garden',i<4?5.18+i*.95:8.5,i<4?9.6:6.6+(i-4)*.7,.55,.65+(i%3)*.18,.55,0,'garden_shrub');
  item('garden_bench','cabinet','garden',6.5,6.65,1.8,.42,.48,0,'garden_bench');
  for(const object of p.interior.objects){
    if(object.kind==='sofa')object.assetId='lounge_sofa';
    if(object.kind==='bed')object.assetId='linen_bed';
    if(object.kind==='chair')object.assetId='oak_chair';
    if(object.id==='dining_table')object.assetId='oak_dining_table';
  }
  // Planted perimeter beds are editable outdoor rooms, excluded from indoor area.
  p.materials.push({id:'garden_soil',name:'Garden soil',kind:'custom',color:'#424633',roughness:1,metalness:0,opacity:1});
  for(const [id,x,z,w,d] of [['west_garden',-1.2,-1.1,1.1,12.1],['east_garden',11.4,-1.1,1.1,12.1],['front_garden',0,10.25,11.3,.95],['rear_garden',0,-1.1,11.3,.95]] as const){
    room(id,'Perimeter garden','custom','ground',rect(x,z,w,d),.18);p.building.rooms.at(-1)!.materials!.floor='garden_soil';
    const length=Math.max(w,d),count=Math.floor(length/.7);
    for(let i=0;i<count;i++)item(`${id}_plant_${i}`,'decoration',id,x+(w>d?(i+.5)*w/count:w/2),z+(d>w?(i+.5)*d/count:d/2),.7,.55+(i%4)*.16,.7,0,'garden_shrub');
    if(d>w)for(let i=0;i<2;i++)item(`${id}_tree_${i}`,'decoration',id,x+w/2,z+2+i*6,1.8,2.8,1.8,0,'olive_tree');
  }
  const area=p.building.rooms.filter(r=>r.type!=='custom').reduce((sum,r)=>sum+polygonArea(roomPolygon(p,r)),0);
  const scale=Math.sqrt(180/area);
  for(const wall of p.building.walls)for(const point of [wall.start,wall.end]){point.x*=scale;point.z*=scale;}
  for(const opening of [...p.building.windows,...p.building.doors])opening.width*=scale;
  for(const object of p.interior.objects){object.position.x*=scale;object.position.z*=scale;if(object.size){object.size.x*=scale;object.size.z*=scale;}}
  return validateProject(p);
}
