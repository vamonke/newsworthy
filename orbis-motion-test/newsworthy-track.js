// Analytics: track(type, {run, label, detail, value}) sends one event to /api/event. The Worker only accepts
// the types listed in worker/src/events.js; the event table is in DEPLOYMENT.md, "Analytics".
// sendBeacon still delivers when the page is navigating away, e.g. after clicking an outside link.
const SESSION_KEY='newsworthy-page-session';
const session=(()=>{try{let id=sessionStorage.getItem(SESSION_KEY);if(!id){id=crypto.randomUUID();sessionStorage.setItem(SESSION_KEY,id);}return id;}catch{return crypto.randomUUID();}})();
export function track(type,{run='',label='',detail='',value=0}={}){
 const body=JSON.stringify({type,session,run,label:String(label).slice(0,64),detail:String(detail).slice(0,200),value:Number(value)||0});
 try{if(navigator.sendBeacon?.('/api/event',new Blob([body],{type:'application/json'})))return;}catch{}
 void fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
}
// Links marked <a data-track="name"> send link_clicked with that name. auxclick catches middle-clicks.
const linkClicked=e=>{const a=e.target.closest?.('a[data-track]');if(a&&(e.type==='click'||e.button===1))track('link_clicked',{label:a.dataset.track});};
document.addEventListener('click',linkClicked,true);
document.addEventListener('auxclick',linkClicked,true);
let referrer='';try{referrer=document.referrer?new URL(document.referrer).hostname:'';}catch{}
track('page_opened',{label:referrer});
