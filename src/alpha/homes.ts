import '../editor/editor.css';
import { listHomes,saveHome,deleteHome,signIn,signOut } from './projects.ts';
const root = document.querySelector<HTMLElement>('#homes')!;
const status = document.querySelector<HTMLElement>('#status')!;
document.querySelector('#signin')!.addEventListener('click',()=>{try{signIn();}catch(e){status.textContent=String(e);}});
document.querySelector('#signout')!.addEventListener('click',()=>{signOut();void render();});
async function render() {
 try {
  const homes = await listHomes(); root.replaceChildren();
  if (!homes.length) root.textContent='No saved homes yet. Open the editor to create your first home.';
  for (const home of homes) {
   const row = document.createElement('article'); row.className='home-row';
   const name = document.createElement('input');name.value=home.name;name.maxLength=200;name.setAttribute('aria-label','Home name');row.append(name);
   const action = (label:string,fn:()=>void|Promise<void>) => {const b=document.createElement('button');b.textContent=label;b.className='btn btn-secondary';b.onclick=()=>{void Promise.resolve().then(fn).catch(e=>status.textContent=String(e));};row.append(b);};
   action('Open',()=>{localStorage.setItem('mopple_editor_project',JSON.stringify(home.model));location.href='/editor.html';});
   action('Rename',async()=>{home.model.project.name=name.value;home.model.project.updatedAt=new Date().toISOString();await saveHome(home.model);await render();});
   action('Duplicate',async()=>{const model=structuredClone(home.model);model.project.id=`project_${crypto.randomUUID()}`;model.project.name+=' copy';await saveHome(model);await render();});
   action('Delete',async()=>{await deleteHome(home.id);await render();});
   const versions=document.createElement('select');versions.setAttribute('aria-label','Previous versions');versions.add(new Option('Restore a version',''));
   home.versions.forEach((v,i)=>versions.add(new Option(v.project.updatedAt,String(i))));
   versions.onchange=()=>{if(versions.value==='')return; const model=structuredClone(home.versions[Number(versions.value)]);model.project.updatedAt=new Date().toISOString();void saveHome(model).then(render).catch(e=>status.textContent=String(e));};row.append(versions);root.append(row);
  }
 }catch(e){status.textContent=String(e);}
}
void render();
