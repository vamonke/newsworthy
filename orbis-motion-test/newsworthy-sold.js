// "Just sold": the 3 latest sales by other players, stacked at the bottom left, with how long ago each sold
// (GET /api/sold, worker/src/leaderboard.js). When the page opens the stack shows as it is, without motion: the best
// photo of each of the 3 rounds that sold last. After that, each new sale slides in at the bottom and pushes the
// oldest out. The feed is checked every 15 s while the tab is visible; the stack is hidden while the player is in a
// round. Approved in news-social-design.html, then changed to a stack of 3 on 2026-09-30.
const POLL_MS=15000,SHOWN=3,MAX_PENDING=3,GAP_MS=900;
const stack=document.querySelector('#sold-toast'),dollars=n=>'$'+Number(n||0).toLocaleString();
const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
// seen: sales already in the stack or passed over. quiet: the next check refreshes the stack without motion (after a
// round or a hidden tab, so a backlog doesn't slide in). own: the player's own round, whose sales never show.
// items: the sales in the stack, newest first. pending: new sales waiting to slide in, oldest first.
let seen=null,quiet=false,paused=false,own='',items=[],pending=[],moving=false;
function ago(at){const m=Math.floor((Date.now()-at)/60000);return m<1?'just now':m<60?`${m} min ago`:m<1440?`${Math.floor(m/60)} h ago`:`${Math.floor(m/1440)} d ago`;}
function card(sale){const box=document.createElement('div');box.className='card';box.dataset.key=sale.key;const print=document.createElement('span');print.className='np-print';const img=new Image();img.src=sale.src;img.alt='';const tag=document.createElement('strong');tag.className='tag';tag.textContent=dollars(sale.earned);print.append(img,tag);const text=document.createElement('div'),who=document.createElement('p');who.className='who';if(/^[A-Z]{2}$/.test(sale.country||'')){const f=new Image();f.src=`/flags/${sale.country.toLowerCase()}.svg`;f.alt='';f.onerror=()=>f.remove();who.append(f);}const name=document.createElement('span');name.textContent=sale.name;const when=document.createElement('time');when.dateTime=new Date(sale.at).toISOString();when.dataset.at=sale.at;when.textContent=ago(sale.at);who.append(name,when);const headline=document.createElement('b');headline.textContent=sale.headline;text.append(who,headline);box.append(print,text);return box;}
// Newest at the bottom, next to the corner.
function draw(){stack.replaceChildren(...items.map(card).reverse());show();}
function show(){const on=!paused&&items.length>0;if(on&&!stack.matches(':popover-open'))stack.showPopover();else if(!on&&stack.matches(':popover-open'))stack.hidePopover();}
const loads=src=>{const img=new Image();img.src=src;return img.decode().then(()=>true,()=>false);};
async function slideIn(){
  if(moving||paused||!pending.length)return;
  moving=true;const sale=pending.shift();
  // A sale whose photo won't load is skipped; the photo loads first so the card never slides in empty.
  if(!(await loads(sale.src))||paused){moving=false;void slideIn();return;}
  items=[sale,...items].slice(0,SHOWN);
  const cards=[...stack.children],old=cards.length>=SHOWN?cards[0]:null;
  if(old&&!still())await old.animate([{opacity:1},{opacity:0,transform:'translateY(-8px)'}],{duration:200,easing:'ease-in'}).finished.catch(()=>{});
  old?.remove();
  // The cards above move up by the new card's height: measured before and after, then eased (FLIP).
  const before=new Map([...stack.children].map(c=>[c,c.getBoundingClientRect().top]));
  const fresh=card(sale);stack.append(fresh);show();
  if(!still()){for(const [c,top] of before){const dy=top-c.getBoundingClientRect().top;if(dy)c.animate([{transform:`translateY(${dy}px)`},{transform:'none'}],{duration:350,easing:'cubic-bezier(.2,.8,.3,1)'});}
    await fresh.animate([{transform:'translateX(-120%)'},{transform:'none'}],{duration:350,easing:'cubic-bezier(.2,.9,.3,1.2)'}).finished.catch(()=>{});}
  setTimeout(()=>{moving=false;void slideIn();},GAP_MS);
}
async function check(){
  if(paused||document.visibilityState!=='visible')return;
  try{
    const r=await fetch('/api/sold',{signal:AbortSignal.timeout(10000)});const {sold}=await r.json();
    if(!r.ok||!Array.isArray(sold)||paused)return;
    const others=sold.filter(s=>!(own&&s.key.startsWith(own+'/')));
    if(!seen||quiet){
      // The stack as it is now, one photo per round (their best), without motion.
      const rounds=new Set();items=others.filter(s=>{const round=s.key.split('/')[0];if(rounds.has(round))return false;rounds.add(round);return true;}).slice(0,SHOWN);
      const ok=await Promise.all(items.map(s=>loads(s.src)));items=items.filter((_,i)=>ok[i]);pending=[];if(!paused&&!moving)draw();
    }else pending=[...pending,...others.filter(s=>!seen.has(s.key)).reverse()].slice(-MAX_PENDING);
    seen=new Set([...(seen||[]),...sold.map(s=>s.key)]);quiet=false;
    void slideIn();
  }catch{}
}
// The game calls this all the time (every control update). While `on`, the stack is hidden and nothing is checked.
export function pauseSold(on,round){
  if(round)own=round;
  if(on===paused)return;
  paused=on;
  if(on){pending=[];quiet=true;show();}else void check();
}
setInterval(()=>void check(),POLL_MS);
// "4 min ago" moves on by itself.
setInterval(()=>{for(const t of stack.querySelectorAll('time'))t.textContent=ago(Number(t.dataset.at));},30000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void check();else{pending=[];quiet=true;}});
void check();
