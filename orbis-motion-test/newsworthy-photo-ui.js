export const dollars=n=>'$'+Number(n||0).toLocaleString();
export function tintPhoto(node,value){node.style.setProperty('--photo-color',value>=750?'#dc382d':value>=500?'#f1ba39':value>=250?'#154bae':'#607286');node.style.setProperty('--photo-ink',value>=500&&value<750?'#432e00':'#fff');node.classList.toggle('photo-unsold',!(value>0));}
export function photoTitle(node,result,fallback='Not scored'){node.textContent=result?.headline||fallback;for(const [on,cls,text] of [[result?.custom,'photo-custom','EXCLUSIVE'],[result?.repeat,'photo-repeat','REPEAT']])if(on){const tag=document.createElement('span');tag.className=cls;tag.textContent=text;node.append(' ',tag);}}
export function countMoney(node,value){
 node.getAnimations().forEach(animation=>animation.cancel());
 node.textContent=dollars(value);
 node.setAttribute('aria-label',dollars(value)+' earned');
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 node.animate([{transform:'scale(.82)',opacity:0},{transform:'scale(1.09)',opacity:1,offset:.6},{transform:'scale(1)',opacity:1}],{duration:340,easing:'cubic-bezier(.2,.7,.3,1)'});
}
// Photo details score box: Photo rating (grades, then x/10) beside You received (the maths, then the amount).
// The bonus row carries the Exclusive / Repeat colour, so the title needs no tag.
export function payoutRows(r){const value=Number.isFinite(r.value)?r.value:Math.round((r.baseScore||0)*100),bonus=r.bonus||(r.custom?1.5:1),full=Math.round(value*bonus),rows=[[`${(value/100).toFixed(1)} rating`,dollars(value),'']];if(r.custom)rows.push([`Exclusive ${bonus}×`,'+'+dollars(full-value),'custom']);if(r.repeat)rows.push(['Repeat 0.5×','−'+dollars(full-r.earned),'repeat']);if(rows.length===1)rows.push(['No bonus','+$0','']);return rows;}
export function detailsFor(node,r){node.replaceChildren();if(!r)return;const add=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=text;return e;};
 const score=add('div','score',''),left=add('div','',''),right=add('div','','');
 const grades=add('ul','np-grades','');for(const [key,label] of [['event','Impact'],['clarity','Clarity'],['spectacle','Spectacle']]){const value=r.grades?.[key],row=add('li','',''),dots=add('span','np-dots','');dots.setAttribute('role','img');dots.setAttribute('aria-label',(value??'—')+' of 4');for(let i=0;i<4;i++)dots.append(add('i',i<value?'on':'',''));row.append(add('b','',label),dots);grades.append(row);}
 const rating=add('strong','rating total',Number.isFinite(r.baseScore)?r.baseScore.toFixed(1):'—');rating.append(add('small','','/10'));left.append(add('span','np-label','Photo rating'),grades,rating);
 const math=add('div','math','');for(const [label,amount,cls] of payoutRows(r)){const row=add('span',cls,'');row.append(add('span','',label),add('span','',amount));math.append(row);}
 right.append(add('span','np-label','You received'),math,add('strong','np-money total',dollars(r.earned)));score.append(left,right);node.append(score);
 const reason=String(r.reason||'').replace(/^(Another shot of this story|Exclusive)[^(]*\([^)]*\)\.\s*/,'').replace(/^Repeat photo[^.]*\.\s*/,'');if(reason)node.append(add('p','np-body',reason));
 const help=document.createElement('details');help.className='rating-help';help.append(add('summary','','How ratings work'),add('p','','Rating = (Impact + Spectacle) × Clarity ÷ 3.2, out of 10. Each point is worth $100.'),add('p','','Exclusive (something you made up): 1.5×. Repeat of a story you already sold: 0.5×.'));node.append(help);}
// The Newsworthy eye, inline so its iris can look around while a photo is reviewed.
// Each copy gets its own clip id; the popup and every camera-roll card use one.
let eyes=0;
export function reviewEye(){
 const n=++eyes,white='M106 256c43-60 91-90 150-90s107 30 150 90c-43 60-91 90-150 90s-107-30-150-90Z',eye=document.createElement('span');
 eye.className='review-eye';eye.setAttribute('aria-hidden','true');
 eye.innerHTML=`<svg viewBox="40 90 432 332"><defs><clipPath id="review-eye-${n}"><path d="${white}"/></clipPath></defs><g class="eye-lid"><path d="M55 256c55-91 117-136 201-136s146 45 201 136c-55 91-117 136-201 136S110 347 55 256Z" fill="#101820"/><path d="${white}" fill="#e8e0cf"/><g clip-path="url(#review-eye-${n})"><g class="eye-iris"><circle cx="256" cy="256" r="92" fill="#d9362b"/><g class="eye-aperture"><path d="M256 164 309 195 309 256 256 287 203 256 203 195Z" fill="#101820" transform="rotate(30 256 256)"/></g><circle cx="256" cy="256" r="29" fill="#e8e0cf"/></g></g></g><path class="eye-corners" d="M72 172v-68h68M440 172v-68h-68M72 340v68h68M440 340v68h-68" fill="none" stroke="#d9362b" stroke-width="24" stroke-linecap="square"/></svg>`;
 return eye;
}
