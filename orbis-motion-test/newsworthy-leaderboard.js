// Leaderboard popup: top 10, each player's best round, this week (the default) or all time, with every player's
// lifetime earnings (GET /api/leaderboard, worker/src/leaderboard.js). Every round with a score is posted by the
// Worker, so there is nothing to submit here. Approved in news-leaderboard-design.html and news-social-design.html.
const $=s=>document.querySelector(s),dollars=n=>'$'+Number(n||0).toLocaleString();
// Solid 24×24 trophy in currentColor, gold, silver and bronze for the top 3.
const TROPHY='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 2h12v2h3.5v2.5A5 5 0 0 1 17.2 11.4 6 6 0 0 1 13 14.8V17h3.5v2h-9v-2H11v-2.2a6 6 0 0 1-4.2-3.4A5 5 0 0 1 2.5 6.5V4H6zm0 4H4.5v.5a3 3 0 0 0 1.8 2.8A6 6 0 0 1 6 8zm12 0v2a6 6 0 0 1-.3 1.3 3 3 0 0 0 1.8-2.8V6z"/><path d="M6 20h12v2.5H6z"/></svg>';
const PLACES=['gold','silver','bronze'];
// The player's country (Cloudflare's code for their IP) as an SVG flag from /flags/ (flag-icons): Windows shows flag
// emoji as two letters. Its name is the alt text and tooltip. No country keeps the space, so names line up.
const COUNTRY=new Intl.DisplayNames(['en'],{type:'region'});
function flag(code){if(!/^[A-Z]{2}$/.test(code||'')){const none=document.createElement('span');none.className='lb-flag none';return none;}const img=new Image();img.className='lb-flag';img.src=`/flags/${code.toLowerCase()}.svg`;img.alt=img.title=COUNTRY.of(code)||code;img.onerror=()=>img.replaceWith(flag(''));return img;}
function place(rank){const n=document.createElement('span');n.className='lb-n';if(rank<=3){n.classList.add(PLACES[rank-1]);n.innerHTML=TROPHY;n.setAttribute('aria-label','#'+rank);}else n.textContent=rank;return n;}
function photoCard(p){const card=document.createElement('div');card.className='recap-card';const frame=document.createElement('span');frame.className='np-print';const img=new Image();img.src=p.src;img.alt='';img.loading='lazy';const tag=document.createElement('strong');tag.className='recap-tag';tag.textContent=dollars(p.earned);frame.append(img,tag);const title=document.createElement('b');title.textContent=p.headline;card.append(frame,title);return card;}
let tab='week',opened={};
const WHEN={week:'this week',all:'all time'};
function openPlayer(row,rank){$('#lb-player-rank').textContent=`#${rank} ${WHEN[tab]}`;const name=$('#lb-player-name');name.replaceChildren();if(rank<=3)name.append(place(rank));if(/^[A-Z]{2}$/.test(row.country||''))name.append(flag(row.country));name.append(row.name+(row.you?' (you)':''));$('#lb-player-lifetime').textContent=`${dollars(row.lifetime)} in total`;$('#lb-player-label').textContent=tab==='week'?'Best this week':'Score';$('#lb-player-total').textContent=dollars(row.total);$('#lb-player-photos').replaceChildren(...row.photos.map(photoCard));$('#lb-player').showModal();}
function line(row,rank){const li=document.createElement('li'),button=document.createElement('button');button.className='lb-row'+(row.you?' you':'');const who=document.createElement('span');who.className='lb-name';const name=document.createElement('b');name.append(flag(row.country),row.name+(row.you?' (you)':''));const lifetime=document.createElement('span');lifetime.className='lifetime';lifetime.textContent=`${dollars(row.lifetime)} in total`;who.append(name,lifetime);const thumbs=document.createElement('span');thumbs.className='lb-thumbs';for(const p of row.photos.slice(0,3)){const img=new Image();img.src=p.src;img.alt='';img.loading='lazy';thumbs.append(img);}const money=document.createElement('strong');money.className='np-money';money.textContent=dollars(row.total);button.append(place(rank),who,thumbs,money);button.onclick=()=>openPlayer(row,rank);li.append(button);return li;}
// The viewer's own row goes under the board when they're outside the top 10.
function render(board){$('#lb-rows').replaceChildren(...board.top.map((row,i)=>line(row,i+1)));const you=board.you&&!board.top.some(r=>r.you)?{...board.you,you:true}:null;$('#lb-you').replaceChildren(...(you?[line(you,you.rank)]:[]));$('#lb-you').hidden=!you;$('#lb-status').textContent=board.top.length?'':tab==='week'?'No rounds yet this week. Play one to take #1.':'No scores yet. Play a round to be the first.';}
// Boards fetched so far, by query. Opening the board or switching tabs shows the last copy at once and swaps in the
// fresh one only if it changed, so the list never flashes empty. The weekly board is fetched in the background
// after the page loads, and the other tab right after the first one shows.
const boards=new Map(),queries=new Map(),boardQuery=(board,round)=>new URLSearchParams(round?{board,round}:{board}).toString();
function fetchBoard(q){if(queries.has(q))return queries.get(q);const p=fetch('/api/leaderboard?'+q,{signal:AbortSignal.timeout(15000)}).then(async r=>{const board=await r.json();if(!r.ok)throw new Error(board.error||'Couldn’t load the leaderboard.');boards.set(q,{board,json:JSON.stringify(board)});return board;}).finally(()=>queries.delete(q));queries.set(q,p);return p;}
// Loads the thumbnails into the browser cache (they never change), so rows don't open with empty frames.
function warmPhotos(board){for(const row of board.top.slice(0,10))for(const p of row.photos.slice(0,3))new Image().src=p.src;}
export function prefetchLeaderboard(round,{photos=false}={}){const q=boardQuery('week',round),have=boards.get(q);if(have){if(photos)warmPhotos(have.board);return;}fetchBoard(q).then(b=>{if(photos)warmPhotos(b);},()=>{});}
async function load(){const which=tab,q=boardQuery(which,opened.round),other=boardQuery(which==='week'?'all':'week',opened.round);for(const b of document.querySelectorAll('#lb-tabs button'))b.setAttribute('aria-pressed',String(b.dataset.board===which));
  // Without this round's copy, the same board without it is close enough to show while the right one loads.
  const shown=boards.get(q)||(opened.round&&boards.get(boardQuery(which)));
  if(shown)render(shown.board);else{$('#lb-rows').replaceChildren();$('#lb-you').replaceChildren();$('#lb-you').hidden=true;$('#lb-status').textContent='Loading…';}
  try{const board=await fetchBoard(q);if(which===tab&&JSON.stringify(board)!==shown?.json)render(board);if(!boards.has(other))fetchBoard(other).then(warmPhotos,()=>{});}
  catch(e){if(which===tab&&!shown)$('#lb-status').textContent=e.name==='TimeoutError'?'Couldn’t load the leaderboard. Try again.':e.message;}}
for(const b of document.querySelectorAll('#lb-tabs button'))b.onclick=()=>{if(tab===b.dataset.board)return;tab=b.dataset.board;void load();};
// From the results popup, the board opens on top of it: Back returns there and Play again starts a round.
// From the header it only has Close. `round` marks the player's row. It always opens on This week.
export async function openLeaderboard({round,onPlay}={}){const dialog=$('#scores-dialog');opened={round};tab='week';$('#lb-back').hidden=$('#lb-again').hidden=!onPlay;$('#lb-close').hidden=Boolean(onPlay);$('#lb-again').onclick=()=>{dialog.close();onPlay?.();};if(!dialog.open)dialog.showModal();await load();}
// Results popup: the player's lifetime earnings under "You earned", when they've played before. It's fetched when the
// round starts (rememberLifetime), before the round has a score, so at the end it's that plus this round's money,
// shown with the popup instead of popping in after it. If that fetch failed, it asks now: `asked` then says the
// server's `you` is this round, whose total may trail the last photo by a moment.
let before=null;
export function rememberLifetime(){before=fetchBoard(boardQuery('all')).then(b=>b.you?b.you.lifetime:0,()=>null);}
export async function showLifetime(round,money){const el=$('#final-lifetime');el.hidden=true;let lifetime=null;const earlier=await before;
  if(earlier!=null)lifetime=earlier+money;
  else if(round)try{const r=await fetch('/api/leaderboard?'+boardQuery('all',round),{signal:AbortSignal.timeout(15000)});const you=(await r.json()).you;if(r.ok&&you)lifetime=you.lifetime-(you.asked?you.total:0)+money;}catch{}
  if(lifetime==null||lifetime<=money)return;el.replaceChildren(Object.assign(document.createElement('b'),{textContent:dollars(lifetime)}),' in total');el.hidden=false;}
$('#lb-back').onclick=$('#lb-close').onclick=()=>$('#scores-dialog').close();
// The board opens instantly: the weekly board loads once the page has settled, and its photos when the player heads for it.
(window.requestIdleCallback||(f=>setTimeout(f,2000)))(()=>prefetchLeaderboard(),{timeout:4000});
for(const type of ['pointerenter','focus','touchstart'])$('#high-scores').addEventListener(type,()=>prefetchLeaderboard(null,{photos:true}),{passive:true});
