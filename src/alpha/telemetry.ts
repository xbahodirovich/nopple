type EventName = 'editor_opened'|'home_generated'|'home_edited'|'home_saved'|'home_shared'|'export_clicked';
const env=import.meta.env ?? {};
export function track(event:EventName,properties:Record<string,string|number|boolean>={}){
 const provider=env.VITE_ANALYTICS_PROVIDER,url=env.VITE_ANALYTICS_URL;
 if(!provider||!url)return;
 const body=provider==='plausible'?{name:event,url:location.origin+location.pathname,domain:location.hostname,props:properties}:{event,properties};
 void fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true}).catch(()=>{});
}
export function trackError(error:unknown){
 if(!env.VITE_ERROR_TRACKING_URL)return;
 void fetch(env.VITE_ERROR_TRACKING_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:error instanceof Error?error.message:String(error),path:location.pathname}),keepalive:true}).catch(()=>{});
}
if (typeof window !== 'undefined') window.addEventListener('error',event=>trackError(event.error ?? event.message));
if (typeof window !== 'undefined') window.addEventListener('unhandledrejection',event=>trackError(event.reason));
