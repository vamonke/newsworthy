import {STAR_THRESHOLDS,starsFor} from './newsworthy-stars.js';
import {wrapSound,stopWrapSound} from './newsworthy-sounds.js';
// Results reveal follows the wrap stinger: photos drop in from the first note, each star is stamped on a hit
// (2.34s top of the swell, 2.82s accent, 4.10s big hit), then the total shows. A stamp lands 176ms into its animation.
const PHOTO_START=80,PHOTO_STEP=160,STAR_HITS=[2340,2820,4100],TOTAL_AT=4600,CHOP_LANDS=176,CHOP_TILT=[-7,4,-3];
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
export function installDialogMotion(dialog){
 if(dialog.dataset.motion)return;dialog.dataset.motion='true';
 const show=dialog.showModal.bind(dialog),close=dialog.close.bind(dialog);let exit;
 dialog.showModal=()=>{if(exit){exit.cancel();exit=null;}if(dialog.open)return;show();if(!reduced())dialog.animate([{opacity:0,transform:'translateY(16px) scale(.96)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:220,easing:'cubic-bezier(.16,1,.3,1)'});};
 dialog.close=(value)=>{if(!dialog.open||exit)return;if(reduced()){close(value);return;}exit=dialog.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'translateY(8px) scale(.97)'}],{duration:140,easing:'ease-in',fill:'forwards'});exit.finished.then(()=>{close(value);exit.cancel();exit=null;}).catch(()=>{});};
 dialog.addEventListener('cancel',e=>{if(e.defaultPrevented)return;e.preventDefault();dialog.close();});
 dialog.addEventListener('submit',e=>{if(e.target.method==='dialog'){e.preventDefault();dialog.close(e.submitter?.value);}});
}
export function shutter(node){
 if(reduced()||document.hidden)return Promise.resolve();
 const flash=node.animate([{opacity:0,offset:0},{opacity:.95,offset:.22},{opacity:.95,offset:.4},{opacity:0,offset:1}],{duration:200,easing:'ease-out'});
 // Browsers pause animations in hidden or covered windows, and the photo is only sent once this settles.
 return Promise.race([flash.finished.catch(()=>{}),new Promise(done=>setTimeout(done,300))]);
}
export function revealRecap(dialog,total){
 const cards=[...dialog.querySelectorAll('.recap-card')],number=dialog.querySelector('#final-total'),row=dialog.querySelector('#recap-stars'),band=dialog.querySelector('.recap-band'),earned=starsFor(total);
 row.setAttribute('aria-label',earned+' of 3 stars');
 row.replaceChildren(...STAR_THRESHOLDS.map((threshold,i)=>{const item=document.createElement('span');item.className='recap-star';item.innerHTML='<span class="chop" style="--r:'+CHOP_TILT[i]+'deg"><span class="chop-ink" aria-hidden="true">★</span></span><small>$'+threshold.toLocaleString()+'</small>';return item;}));
 const chops=[...row.querySelectorAll('.chop')];
 number.textContent='$'+total.toLocaleString();
 const clock=wrapSound();
 const finish=()=>{cards.forEach(card=>card.style.opacity='');chops.forEach((chop,i)=>chop.classList.toggle('earned',i<earned));number.style.visibility='';};
 if(reduced()){finish();return;}
 cards.forEach(card=>card.style.opacity=0);number.style.visibility='hidden';
 const drop=(card,i)=>{card.style.opacity='';card.animate([{opacity:0,transform:`translateY(-14px) scale(.92) rotate(${i%2?2:-2}deg)`},{opacity:1,transform:'none'}],{duration:260,easing:'cubic-bezier(.2,.9,.3,1)'});};
 const stamp=chop=>{chop.classList.add('earned');chop.firstChild.animate([{transform:'scale(1.9) rotate(-14deg)',opacity:0},{transform:'scale(.9)',opacity:1,offset:.55},{transform:'scale(1.04)',offset:.8},{transform:'none',opacity:1}],{duration:320,easing:'cubic-bezier(.3,.7,.3,1)'});band.animate([{transform:'none'},{transform:'translateY(2px)',offset:.6},{transform:'none'}],{duration:180,delay:CHOP_LANDS});};
 const miss=chop=>chop.animate([{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(-3px)'},{transform:'none'}],{duration:340,delay:CHOP_LANDS});
 const showTotal=()=>{number.style.visibility='';number.animate([{transform:'scale(1.5)',opacity:0},{transform:'scale(.96)',opacity:1,offset:.6},{transform:'none',opacity:1}],{duration:300,easing:'cubic-bezier(.3,.7,.3,1)'});};
 const cues=[...cards.map((card,i)=>({at:PHOTO_START+i*PHOTO_STEP,run:()=>drop(card,i)})),...STAR_HITS.map((hit,i)=>({at:hit-CHOP_LANDS,run:()=>i<earned?stamp(chops[i]):miss(chops[i])})),{at:TOTAL_AT,run:showTotal}].sort((a,b)=>a.at-b.at);
 const start=performance.now();let frame;
 const cancel=()=>{cancelAnimationFrame(frame);stopWrapSound();finish();};dialog.addEventListener('close',cancel,{once:true});
 function tick(){if(!dialog.open){cancel();return;}const now=clock?clock():performance.now()-start;while(cues.length&&now>=cues[0].at)cues.shift().run();if(cues.length)frame=requestAnimationFrame(tick);}
 frame=requestAnimationFrame(tick);
}
