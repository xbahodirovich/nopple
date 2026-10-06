import '@fontsource-variable/inter';
import './surfaces.css';
import '../editor/editor.css';
import { listHomes,saveHome,deleteHome,signIn,signOut,isSignedIn } from './projects.ts';
const root = document.querySelector<HTMLElement>('#homes')!;
const status = document.querySelector<HTMLElement>('#status')!;
document.querySelector('#signin')!.addEventListener('click',()=>{try{signIn();}catch(e){status.textContent=String(e);}});
document.querySelector('#signout')!.addEventListener('click',()=>{signOut();void render();});
async function render() {
 try {
  const homes = await listHomes(); root.replaceChildren();
  root.setAttribute('aria-busy','false');
  const signedIn=isSignedIn();document.querySelector<HTMLElement>('#signin')!.hidden=signedIn;document.querySelector<HTMLElement>('#signout')!.hidden=!signedIn;document.querySelector('#storage-description')!.textContent=signedIn?'Your account homes and copies saved on this device.':'Your homes are saved on this device. Sign in to save them to your account.';
  if (!homes.length) { const empty=document.createElement('section');empty.className='empty-homes';empty.innerHTML='<h2>Your first home starts here.</h2><p>Try a layout, make it yours, and come back here to find your saved designs.</p><a class="btn btn-primary" href="/editor.html">Create a home</a>';root.append(empty); }
  for (const home of homes) {
   const row = document.createElement('article'); row.className='home-row';
   const name = document.createElement('input');name.value=home.name;name.maxLength=200;name.setAttribute('aria-label','Home name');const details=document.createElement('div');details.className='home-name';details.append(name);const date=document.createElement('span');date.className='home-date';date.textContent='Updated '+new Date(home.model.project.updatedAt).toLocaleString();details.append(date);row.append(details);const actions=document.createElement('div');actions.className='home-actions';row.append(actions);
   const action = (label:string,fn:()=>void|Promise<void>) => {const b=document.createElement('button');b.textContent=label;b.className='btn btn-secondary';b.onclick=()=>{void Promise.resolve().then(fn).catch(e=>status.textContent=String(e));};actions.append(b);};
   action('Open',()=>{localStorage.setItem('mopple_editor_project',JSON.stringify(home.model));location.href='/editor.html';});
   action('Rename',async()=>{home.model.project.name=name.value;home.model.project.updatedAt=new Date().toISOString();await saveHome(home.model);await render();});
   action('Duplicate',async()=>{const model=structuredClone(home.model);model.project.id=`project_${crypto.randomUUID()}`;model.project.name+=' copy';await saveHome(model);await render();});
   action('Delete',async()=>{await deleteHome(home.id);await render();});
   const versions=document.createElement('select');versions.setAttribute('aria-label','Previous versions');versions.add(new Option('Restore a version',''));
   home.versions.forEach((v,i)=>versions.add(new Option(v.project.updatedAt,String(i))));
   versions.onchange=()=>{if(versions.value==='')return; const model=structuredClone(home.versions[Number(versions.value)]);model.project.updatedAt=new Date().toISOString();void saveHome(model).then(render).catch(e=>status.textContent=String(e));};actions.append(versions);root.append(row);
  }
 }catch(e){root.setAttribute('aria-busy','false');status.textContent=e instanceof Error?e.message:'Could not load your homes. Please try again.';}
}
void render();
