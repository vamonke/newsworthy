export function addEventHistory(label,elapsedSeconds){
 const list=document.querySelector('#event-history');
 list.querySelector('.history-empty')?.remove();
 const item=document.createElement('li'),time=document.createElement('time'),name=document.createElement('span');
 const seconds=Math.max(0,Math.floor(elapsedSeconds));
 time.textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
 name.textContent=label;
 item.append(time,name);list.prepend(item);
}
export function resetEventHistory(){
 const list=document.querySelector('#event-history');
 list.replaceChildren();const empty=document.createElement('li');empty.className='history-empty';empty.textContent='Your events appear here.';list.append(empty);
}
