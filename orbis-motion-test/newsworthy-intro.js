// Scripted loading intro: fixed story beats that frame the round while the live video starts.
// The beats run on their own clock; the game only decides when the last line may give way to "live".
const BEATS=[
 [0,'Something’s happening downtown.'],
 [1300,'The story is developing.'],
 [2600,'We’re rushing to the scene.'],
 [3900,'Clear, dramatic shots earn more.'],
 [5200,'Get ready…'],
];
// Slower three-line version for the camcorder viewfinder look (mocked in news-loading-design.html).
export const VIEWFINDER_BEATS=[
 [0,'The story is developing.'],
 [2600,'We’re rushing to the scene.'],
 [5200,'Get ready…'],
];
const SLOW_MS=12000;

export function playIntro(root,{beats=BEATS,typeMs=0}={}){
 const title=root.querySelector('#connection-title'),sub=root.querySelector('#intro-sub'),stage=root.closest('.picture-stage');
 let timers=[],typing=0,readyDone,stopped=false;
 const ready=new Promise(r=>readyDone=r);
 const later=(fn,ms)=>timers.push(setTimeout(fn,ms));
 // typeMs>0 types each line out character by character, like on-screen camera text.
 const type=text=>{clearInterval(typing);if(!typeMs){title.textContent=text;return;}let n=0;title.textContent='';typing=setInterval(()=>{title.textContent=text.slice(0,++n);if(n>=text.length)clearInterval(typing);},typeMs);};
 const show=i=>{title.classList.remove('intro-line');void title.offsetWidth;type(beats[i][1]);title.classList.add('intro-line');if(i===beats.length-1){root.classList.add('intro-hold');readyDone();}};
 const skip=e=>{if(e.target.closest('button')||root.classList.contains('intro-hold'))return;timers.forEach(clearTimeout);timers=[];show(beats.length-1);later(slow,SLOW_MS);};
 const slow=()=>{sub.textContent='Taking a bit longer than usual.';sub.hidden=false;};
 root.classList.remove('intro-hold');root.classList.add('intro');stage?.classList.add('intro-zoom');
 sub.hidden=true;sub.textContent='';root.hidden=false;root.addEventListener('click',skip);
 beats.forEach(([at],i)=>later(()=>show(i),at));later(slow,SLOW_MS);
 function stop(){if(stopped)return;stopped=true;clearInterval(typing);timers.forEach(clearTimeout);timers=[];root.removeEventListener('click',skip);root.classList.remove('intro','intro-hold');title.classList.remove('intro-line');sub.hidden=true;stage?.classList.remove('intro-zoom');}
 // The first seconds of a round matter, so the overlay goes away the instant video is ready.
 function live(){stop();root.hidden=true;}
 return {ready,live,stop};
}
