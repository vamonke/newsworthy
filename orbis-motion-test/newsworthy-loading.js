// Loading screen for the start of a round: the opening still hunts for focus under light TV static, a status card and
// a progress bar, so the player can tell the round hasn't started. Styles live in news-loading-motion.css.
const SLOW_MS=12000,TIP_MS=3000,NOISE_W=320,NOISE_H=180,NOISE_FRAMES=6,NOISE_FPS=10;
// Tips rotate under the bar so the wait teaches the game. One short line each, plain words only.
const TIPS=[
 'Move your mouse to aim. Click to shoot.',
 'Only 12 shots. Keep the action in frame.',
 'Pick a scene to make something happen.',
 'Write your own scene for 1.5× pay.',
 'The same story twice pays half.',
];

// A few pre-made frames of TV static, cycled; cheap enough to leave running during the load.
function noiseFrames(ctx){
 return Array.from({length:NOISE_FRAMES},()=>{const img=ctx.createImageData(NOISE_W,NOISE_H),px=new Uint32Array(img.data.buffer);
  for(let i=0;i<px.length;i++){const v=Math.random()*255|0;px[i]=0xff000000|v<<16|v<<8|v;}return img;});
}

export function playLoading(root){
 root.querySelectorAll('.load-card,.tv-noise').forEach(n=>n.remove());
 const canvas=Object.assign(document.createElement('canvas'),{className:'tv-noise',width:NOISE_W,height:NOISE_H});root.prepend(canvas);
 const card=document.createElement('div');card.className='load-card';
 card.innerHTML='<strong>Loading live feed</strong><span class="load-bar" aria-hidden="true"><i></i></span><small></small>';
 root.querySelector('#connection-title').before(card);
 const bar=card.querySelector('.load-bar i'),note=card.querySelector('small'),t0=performance.now();
 const ctx=canvas.getContext('2d'),frames=noiseFrames(ctx),still=matchMedia('(prefers-reduced-motion: reduce)').matches;let f=0;ctx.putImageData(frames[0],0,0);
 const noise=still?0:setInterval(()=>ctx.putImageData(frames[++f%NOISE_FRAMES],0,0),1000/NOISE_FPS);
 root.classList.remove('intro','intro-hold');root.classList.add('tuning');root.hidden=false;
 // The real wait is unknown, so the bar eases toward 92% and never claims to be done.
 const timer=setInterval(()=>{bar.style.width=(92*(1-Math.exp(-(performance.now()-t0)/4000))).toFixed(1)+'%';},100);
 let tip=0;const showTip=()=>{note.classList.remove('tip-in');void note.offsetWidth;note.textContent=TIPS[tip++%TIPS.length];note.classList.add('tip-in');};
 showTip();let tips=setInterval(showTip,TIP_MS);
 // A wait message (slow start, queue) replaces the tips so the player sees why it's taking a while.
 const hold=text=>{clearInterval(tips);note.textContent=text;};
 const slow=setTimeout(()=>hold('Taking a bit longer than usual.'),SLOW_MS);
 function stop(){clearInterval(timer);clearInterval(tips);clearInterval(noise);clearTimeout(slow);root.classList.remove('tuning');card.remove();canvas.remove();}
 // The first seconds of a round matter, so the screen goes away the instant video is ready.
 function live(){stop();root.hidden=true;}
 return {live,stop,note:hold};
}
