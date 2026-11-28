import './telemetry.ts';
const form=document.querySelector<HTMLFormElement>('#waitlist');
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
form?.addEventListener('submit',async event=>{
 event.preventDefault();
 const status=document.querySelector<HTMLElement>('#waitlist-status'),button=form.querySelector<HTMLButtonElement>('button');
 if(!status||!button)return;
 const data=new FormData(form);
 const email=String(data.get('email')??'').trim();
 const honeypot=String(data.get('website')??'').trim();
 const setState=(state:'busy'|'ok'|'local'|'error',message:string)=>{
  status.className=state==='ok'?'ok':state==='error'?'error':'';
  status.textContent=message;
  button.disabled=state==='busy';
  button.setAttribute('aria-busy',state==='busy'?'true':'false');
 };
 if(!EMAIL.test(email)||email.length>254){setState('error','Please enter a valid email address.');return;}
 // Bots fill the hidden honeypot: pretend success without posting or storing anything.
 if(honeypot){setState('ok','You joined the Nopple Pro waitlist.');return;}
 // The human chooses the destination later: VITE_WAITLIST_ENDPOINT (or the older
 // VITE_WAITLIST_URL). Without one, interest is kept locally on this device.
 const endpoint=import.meta.env.VITE_WAITLIST_ENDPOINT??import.meta.env.VITE_WAITLIST_URL;
 setState('busy','Sending…');
 try{
  if(endpoint){
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
   if(!response.ok)throw new Error('request failed');
   setState('ok','You joined the Nopple Pro waitlist.');
  }else{
   try{localStorage.setItem('mopple_pro_interest',email);}catch{}
   setState('local','Interest saved on this device. The online waitlist is not available yet.');
  }
 }catch{
  setState('error','Could not join the waitlist. Please try again.');
 }
});
