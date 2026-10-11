import './telemetry.ts';
const form=document.querySelector<HTMLFormElement>('#waitlist');
form?.addEventListener('submit',async event=>{
 event.preventDefault();const status=document.querySelector<HTMLElement>('#waitlist-status')!,button=form.querySelector<HTMLButtonElement>('button')!;
 const email=new FormData(form).get('email');button.disabled=true;
 try{
  const url=import.meta.env.VITE_WAITLIST_URL;
  if(url){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});if(!response.ok)throw new Error('Could not join the waitlist. Please try again.');status.textContent='You joined the Nopple Pro waitlist.';}
  else{localStorage.setItem('mopple_pro_interest',String(email));status.textContent='Interest saved on this device. The online waitlist is not available yet.';}
 }catch(e){status.textContent=e instanceof Error?e.message:'Please try again.';}finally{button.disabled=false;}
});
