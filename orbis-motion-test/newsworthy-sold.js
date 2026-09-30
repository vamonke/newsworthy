// "Just sold" pop-up: other players' photos, bottom left, as they sell (GET /api/sold, worker/src/leaderboard.js).
// Checks every 15 s while the tab is visible and the player isn't in a round. When the page opens, the latest sale
// shows if it's under 10 minutes old; after that, only new sales, one at a time, 4 s each.
// Approved in news-social-design.html.
const POLL_MS=15000,SHOW_MS=4000,RECENT_MS=600000,MAX_QUEUED=3;
const toast=document.querySelector('#sold-toast'),dollars=n=>'$'+Number(n||0).toLocaleString();
// seen: sales already shown or passed over. quiet: the next check only marks what's there as seen (after a round
// or a hidden tab, so a backlog doesn't pop up all at once). own: the player's own round, whose sales never pop up.
let seen=null,quiet=false,queue=[],paused=false,own='',showing=false,timers=[];
const later=(fn,ms)=>timers.push(setTimeout(fn,ms));
function hide(){timers.forEach(clearTimeout);timers=[];showing=false;toast.classList.remove('out');if(toast.matches(':popover-open'))toast.hidePopover();}
function card(sale){const box=document.createElement('div');box.className='card';const print=document.createElement('span');print.className='np-print';const img=new Image();img.src=sale.src;img.alt='';const tag=document.createElement('strong');tag.className='tag';tag.textContent=dollars(sale.earned);print.append(img,tag);const text=document.createElement('div'),who=document.createElement('p');who.className='who';if(/^[A-Z]{2}$/.test(sale.country||'')){const f=new Image();f.src=`/flags/${sale.country.toLowerCase()}.svg`;f.alt='';f.onerror=()=>f.remove();who.append(f);}who.append(Object.assign(document.createElement('span'),{textContent:`${sale.name} just sold`}));const headline=document.createElement('b');headline.textContent=sale.headline;text.append(who,headline);box.append(print,text);return box;}
async function next(){
  if(showing||paused||!queue.length)return;
  const sale=queue.shift();showing=true;
  // The photo loads first, so the card never slides in empty. A sale whose photo won't load is skipped.
  const img=new Image();img.src=sale.src;const loaded=await img.decode().then(()=>true,()=>false);
  if(paused||!loaded){showing=false;if(!paused)void next();return;}
  toast.replaceChildren(card(sale));toast.classList.remove('out');
  // Shown again each time, so it sits above any popup opened since.
  if(toast.matches(':popover-open'))toast.hidePopover();toast.showPopover();
  later(()=>{toast.classList.add('out');later(()=>{hide();later(next,400);},300);},SHOW_MS);
}
async function check(){
  if(paused||document.visibilityState!=='visible')return;
  try{
    const r=await fetch('/api/sold',{signal:AbortSignal.timeout(10000)});const {sold}=await r.json();
    if(!r.ok||!Array.isArray(sold)||paused)return;
    const fresh=sold.filter(s=>!seen?.has(s.key)&&!(own&&s.key.startsWith(own+'/')));
    // The first check shows only the latest sale, and only if it's recent; later ones show every new sale, oldest first.
    if(!quiet)queue=seen?[...queue,...fresh.reverse()].slice(-MAX_QUEUED):fresh.slice(0,1).filter(s=>Date.now()-s.at<RECENT_MS);
    seen=new Set([...(seen||[]),...sold.map(s=>s.key)]);quiet=false;
    void next();
  }catch{}
}
// The game calls this all the time (every control update). While `on`, nothing shows and nothing is checked.
export function pauseSold(on,round){
  if(round)own=round;
  if(on===paused)return;
  paused=on;
  if(on){queue=[];hide();quiet=true;}else void check();
}
setInterval(()=>void check(),POLL_MS);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void check();else{queue=[];hide();quiet=true;}});
void check();
