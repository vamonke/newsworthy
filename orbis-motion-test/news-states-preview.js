import {addEventHistory,resetEventHistory} from './newsworthy-event-history.js';
import {EVENTS,EVENT_WINDOW_MS} from './newsworthy-events.js';
import {tintPhoto,photoTitle,countMoney} from './newsworthy-photo-ui.js';
const $=s=>document.querySelector(s);
let timer,selected='ufo',hasSelection=false;
const sample={headline:'Giant Rubber Duck Brings Downtown Traffic to a Stop',earned:750,repeat:false};
$('#sale-image').src='/news-judge/busy-opening-ufo-v4.png';
$('#sound').textContent='PREVIEW ONLY';
$('#sound').disabled=true;
$('#restart').textContent='RESET PREVIEW';
$('#restart').onclick=()=>scene('available');
$('#welcome').remove();
for(const event of EVENTS){const button=document.createElement('button');const icon=document.createElement('span');icon.className='event-icon';icon.textContent=event.code;const label=document.createElement('span');label.textContent=event.label;button.append(icon,label);button.dataset.event=event.id;button.onclick=()=>{selected=event.id;addEventHistory(event.label,Math.floor((performance.now()-previewStart)/1000));scene('active');};$('#event-options').append(button);}
function paintScene(state,seconds=state==='cooldown'?10:20){
 const busy=state!=='available',sending=state==='waiting';if(busy)hasSelection=true;
 $('#event-playing').hidden=!busy;
 $('#event-name').textContent=EVENTS.find(e=>e.id===selected)?.label||selected;
 $('#cooldown').textContent=sending?'Sending…':`More in ${Math.ceil(seconds)}s`;
 document.querySelectorAll('[data-event]').forEach(b=>{b.disabled=busy;b.classList.toggle('event-cooling',busy);b.style.setProperty('--cooldown-fill',(seconds/20*100)+'%');});
 $('#custom button').disabled=sending;
 $('#notice').textContent=state==='available'?'Find your next story.':sending?'Sending: '+$('#event-name').textContent:'Incoming: '+$('#event-name').textContent;
 $('#notice').classList.toggle('incoming',busy&&!sending);
 $('#preview-note').textContent=state==='active'?'Active = prompt accepted; appearance is not confirmed.':'Preview only · no live session';
}
function scene(state){clearInterval(timer);$('#scene-state').value=state;paintScene(state);}
$('#scene-state').onchange=e=>scene(e.target.value);
$('#play-cooldown').onclick=()=>{scene('active');const start=performance.now();timer=setInterval(()=>{const remaining=(EVENT_WINDOW_MS-(performance.now()-start))/1000;if(remaining<=0)scene('available');else paintScene('cooldown',remaining);},100);};
$('#custom').onsubmit=e=>{e.preventDefault();if($('#idea').value.trim()){selected=$('#idea').value.trim();addEventHistory(selected,Math.floor((performance.now()-previewStart)/1000));scene('active');}};
function photo(state){const pending=state==='loading';$('#sale').classList.toggle('pending-photo',pending);photoTitle($('#sale-headline'),pending?null:sample,'Reviewing…');$('#sale-price').hidden=pending;if(pending)$('#sale-price').textContent='';else{tintPhoto($('#sale'),sample.earned);countMoney($('#sale-price'),sample.earned);}$('#dismiss-sale').disabled=pending;$('#dismiss-sale').textContent=pending?'WAITING FOR EDITOR…':'BACK TO THE CITY →';document.querySelectorAll('[data-photo]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.photo===state)));if(!$('#sale').open)$('#sale').showModal();}
for(const button of document.querySelectorAll('[data-photo]'))button.onclick=()=>photo(button.dataset.photo);
$('#close-preview').onclick=()=>$('#sale').close();
$('#dismiss-sale').onclick=()=>$('#sale').close();
const previewStart=performance.now()-60000;
addEventHistory('Red balloon',8);addEventHistory('Rubber duck',29);addEventHistory('Aliens',51);
scene('available');
