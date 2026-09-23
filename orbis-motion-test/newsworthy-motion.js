import {STAR_THRESHOLDS,starsFor,starMessage} from './newsworthy-stars.js';
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
 if(reduced())return Promise.resolve();
 return node.animate([{opacity:0,offset:0},{opacity:.95,offset:.22},{opacity:.95,offset:.4},{opacity:0,offset:1}],{duration:200,easing:'ease-out'}).finished.catch(()=>{});
}
export function revealRecap(dialog,total){
 const cards=[...dialog.querySelectorAll('.recap-card')],number=dialog.querySelector('#final-total');
 let rating=dialog.querySelector('.round-rating');if(!rating){rating=document.createElement('div');rating.className='round-rating';dialog.querySelector('.recap-head').after(rating);}
 rating.innerHTML='<div class="round-stars" role="img"></div><p class="star-message"></p>';
 const starRow=rating.querySelector('.round-stars');STAR_THRESHOLDS.forEach(threshold=>{const item=document.createElement('span');item.className='round-star';item.innerHTML='<span aria-hidden="true">★</span><small>$'+threshold.toLocaleString()+'</small>';starRow.append(item);});
 const updateStars=(value,animate=true)=>{const count=starsFor(value);starRow.setAttribute('aria-label',count+' of 3 stars');[...starRow.children].forEach((item,i)=>{if(i<count&&!item.classList.contains('earned')){item.classList.add('earned');if(animate&&!reduced())item.animate([{transform:'scale(.65)'},{transform:'scale(1.2)'},{transform:'scale(1)'}],{duration:360,easing:'ease-out'});}});};
 const finish=()=>{updateStars(total,false);rating.querySelector('.star-message').textContent=starMessage(total);};updateStars(0,false);
 if(reduced()){number.textContent='$'+total.toLocaleString();finish();return;}
 const animations=cards.map((card,i)=>card.animate([{opacity:0,transform:'translateY(18px) scale(.95)'},{opacity:1,transform:'none'}],{duration:280,delay:140+i*150,fill:'backwards',easing:'cubic-bezier(.16,1,.3,1)'}));
 number.textContent='$0';let frame;const start=performance.now()+140+Math.max(0,cards.length-1)*150+280;
 const cancel=()=>{cancelAnimationFrame(frame);animations.forEach(a=>a.cancel());number.textContent='$'+total.toLocaleString();finish();};dialog.addEventListener('close',cancel,{once:true});
 function tick(now){if(!dialog.open){cancel();return;}const p=Math.min(1,Math.max(0,(now-start)/1000));const value=Math.round(total*(1-(1-p)**3));number.textContent='$'+value.toLocaleString();updateStars(value);if(p===1)finish();if(p<1)frame=requestAnimationFrame(tick);else number.animate([{transform:'scale(1)'},{transform:'scale(1.08)'},{transform:'scale(1)'}],{duration:230});}frame=requestAnimationFrame(tick);
}
