import { validateProject } from '../project/validation.ts';
import type { MoppleProject } from '../project/schema.ts';
export interface SavedHome { id: string; name: string; model: MoppleProject; versions: MoppleProject[] }
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudConfigured = Boolean(url && key);
const storageKey = 'mopple_homes_v1';
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.has('access_token')) {
 sessionStorage.setItem('mopple_auth', JSON.stringify({ token: hash.get('access_token'), refresh: hash.get('refresh_token'), expires: Date.now() + Number(hash.get('expires_in') ?? 3600)*1000 }));
 history.replaceState(null,'',location.pathname + location.search);
}
function token(): string | undefined {
 try { const auth = JSON.parse(sessionStorage.getItem('mopple_auth') ?? 'null'); return auth?.expires > Date.now() ? auth.token : undefined; } catch { return undefined; }
}
export const isSignedIn = () => Boolean(token());
export function signIn() {
 if (!cloudConfigured) throw new Error('Cloud accounts are not configured. Your homes are saved on this device.');
 location.href = `${url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(location.origin+'/homes')}`;
}
export function signOut() { const access=token();sessionStorage.removeItem('mopple_auth');if(url&&key&&access)void fetch(`${url}/auth/v1/logout`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${access}`}}).catch(()=>{}); }
let refreshing: Promise<void> | undefined;
async function refreshSession() {
 if (!cloudConfigured || token()) return;
 const auth=JSON.parse(sessionStorage.getItem('mopple_auth') ?? 'null');if(!auth?.refresh)return;
 refreshing ??= (async()=>{const response=await fetch(`${url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:key!,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:auth.refresh})});if(!response.ok){sessionStorage.removeItem('mopple_auth');throw new Error('Session expired. Sign in again; your local home is saved.');}const next=await response.json();sessionStorage.setItem('mopple_auth',JSON.stringify({token:next.access_token,refresh:next.refresh_token,expires:Date.now()+next.expires_in*1000}));})();
 try {await refreshing;}finally{refreshing=undefined;}
}
export const saveLocation = () => cloudConfigured && token() ? 'Saved to cloud' : 'Saved locally';
async function rest(path: string, init: RequestInit = {}, publicRead = false) {
 if(!publicRead)await refreshSession();
 const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key!, Authorization: `Bearer ${publicRead ? key : token() ?? key}`, 'Content-Type':'application/json', ...init.headers } });
 if (!response.ok) throw new Error('Cloud saving unavailable. Your local copy is kept.');
 return response.status === 204 ? null : response.json();
}
export function localHomes(): SavedHome[] {
 try {
  const rows: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(row => {
   try {
    const model = validateProject(row.model);
    const versions = Array.isArray(row.versions) ? row.versions.flatMap((version: unknown) => { try { return [validateProject(version)]; } catch { return []; } }).slice(0,10) : [];
    return [{ id: model.project.id, name: model.project.name, model, versions }];
   } catch { return []; }
  });
 } catch { return []; }
}
function write(homes: SavedHome[]) { localStorage.setItem(storageKey, JSON.stringify(homes)); }
export async function listHomes(): Promise<SavedHome[]> {
 try {
 await refreshSession();
 if (!cloudConfigured || !token()) return localHomes();
 const rows = await rest('projects?select=id,name,model,versions&order=updated_at.desc');
 const merged = new Map(localHomes().map(h => [h.id,h]));
 for (const h of rows) if (!merged.has(h.id) || Date.parse(h.model.project.updatedAt) > Date.parse(merged.get(h.id)!.model.project.updatedAt)) merged.set(h.id,h);
 return [...merged.values()];
 } catch { window.dispatchEvent(new CustomEvent('mopple-storage-warning', {detail:'Cloud is unavailable. Showing the homes saved on this device.'})); return localHomes(); }
}
let cloudSaveQueue: Promise<unknown> = Promise.resolve();
export async function saveHome(input: MoppleProject) {
 const model = validateProject(input), homes = localHomes(), previous = homes.find(h => h.id === model.project.id);
 const same = previous && JSON.stringify(previous.model) === JSON.stringify(model);
 const versions = previous ? same ? previous.versions : [previous.model, ...previous.versions].slice(0,10) : [];
 const home = {id:model.project.id,name:model.project.name,model,versions};
 write([home,...homes.filter(h => h.id !== home.id)]);
 const save = cloudSaveQueue.catch(() => {}).then(async () => {
  await refreshSession();
  if (cloudConfigured && token()) await rest('rpc/save_home', {method:'POST',body:JSON.stringify({home_id:home.id,home_name:home.name,home_model:model})});
 });
 cloudSaveQueue = save; await save;
 return home;
}
export async function deleteHome(id: string) {
 await cloudSaveQueue.catch(() => {}); await refreshSession();
 if (cloudConfigured && token()) await rest(`projects?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});
 write(localHomes().filter(h => h.id !== id));
}
export async function shareHome(model: MoppleProject): Promise<string> {
 await refreshSession();
 if (cloudConfigured && token()) {
  await saveHome(model);
  const rows = await rest(`projects?id=eq.${encodeURIComponent(model.project.id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({shared:true})});
  return `${location.origin}/share?id=${rows[0].share_id}`;
 }
 const bytes = new TextEncoder().encode(JSON.stringify(model));
 if (bytes.length > 100000) throw new Error('This home is too large for a portable link. Sign in for cloud sharing.');
 const encoded = btoa(Array.from(bytes,b => String.fromCharCode(b)).join(''));
 return `${location.origin}/share#home=${encodeURIComponent(encoded)}`;
}
export async function loadShared(): Promise<MoppleProject> {
 const id = new URLSearchParams(location.search).get('id');
 if (id && cloudConfigured) { const rows = await rest(`rpc/read_shared`,{method:'POST',body:JSON.stringify({share_token:id})},true); if (!rows.length) throw new Error('This share is unavailable.'); return validateProject(rows[0].model); }
 const encoded = new URLSearchParams(location.hash.slice(1)).get('home');
 if (!encoded || encoded.length > 150000) throw new Error('Invalid share link.');
 return validateProject(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)))));
}
