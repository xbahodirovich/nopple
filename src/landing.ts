import {initLanguage} from './i18n/index.ts';
import '@fontsource-variable/inter';
import '@fontsource/anton';
import '@fontsource/oswald/600.css';
import '@fontsource/caveat';
import './landing.css';
document.querySelector('#year')!.textContent=String(new Date().getFullYear());
initLanguage();
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const targets=Array.from(document.querySelectorAll<HTMLElement>('.method-heading,.method-steps article,.perspective-copy,.perspective-board,.closing h2,.closing>div'));
const photograph=document.querySelector<HTMLElement>('.inspiration-frame img')!;
const visual=document.querySelector<HTMLElement>('.inspiration-visual')!,hero=document.querySelector<HTMLElement>('.opening-copy')!,headline=document.querySelector<HTMLElement>('.perspective-copy h2')!;
const orbit=document.querySelector<HTMLElement>('.hero-orbit')!;
let observer:IntersectionObserver|undefined,frame=0;
function updatePhoto(){frame=0;if(motion.matches)return;
 const rect=photograph.parentElement!.getBoundingClientRect(),progress=Math.max(-1,Math.min(1,(innerHeight/2-(rect.top+rect.height/2))/innerHeight));
 photograph.style.transform=`translateY(${progress*42}px) scale(1.16)`;
 const entry=Math.max(0,Math.min(1,(innerHeight-rect.top)/(innerHeight*.8))),mobile=innerWidth<641;
 visual.style.transform=`perspective(1400px) translateY(${(1-entry)*(mobile?20:50)}px) rotateX(${(1-entry)*(mobile?0:5)}deg) scale(${(mobile?.95:.88)+entry*(mobile?.05:.12)})`;
 orbit.style.transform=`translateY(${Math.min(scrollY*.18,150)}px) rotate(${-18+Math.min(scrollY*.025,30)}deg)`;
 const travel=Math.min(100,Math.max(0,scrollY)*.13);hero.style.transform=`translateY(${-travel}px)`;
 const h=headline.getBoundingClientRect(),reveal=Math.max(0,Math.min(1,(innerHeight-h.top)/innerHeight));headline.style.transform=`translateX(${(1-reveal)*(mobile?20:65)}px)`;
}
function onScroll(){if(!motion.matches&&!frame)frame=requestAnimationFrame(updatePhoto);}
function configure(){observer?.disconnect();for(const el of targets){el.classList.remove('reveal-wait');el.getAnimations().forEach(a=>a.cancel());}if(motion.matches){cancelAnimationFrame(frame);frame=0;for(const el of [photograph,visual,hero,headline,orbit])el.style.transform='none';return;}
 observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const el=entry.target as HTMLElement;el.classList.remove('reveal-wait');el.animate([{opacity:.3,transform:'translateY(24px)'},{opacity:1,transform:'translateY(0)'}],{duration:650,delay:Math.max(0,targets.indexOf(el)%3)*60,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});observer!.unobserve(el);}},{threshold:.12});
 for(const el of targets){if(el.getBoundingClientRect().top>innerHeight){el.classList.add('reveal-wait');observer.observe(el);}}onScroll();
}
configure();motion.addEventListener('change',configure);window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onScroll);
window.addEventListener('pagehide',()=>{observer?.disconnect();cancelAnimationFrame(frame);motion.removeEventListener('change',configure);window.removeEventListener('scroll',onScroll);window.removeEventListener('resize',onScroll);},{once:true});
