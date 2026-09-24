// Shareable keepsakes, drawn on a canvas so they save as one PNG.
// Front page: one photo under its headline (1080 × 1350). Photo package: the round's best shots (1200 wide).
// Approved design: news-keepsake-design.html. Both share the masthead and the footer.
import {starsFor} from './newsworthy-stars.js';
import {dollars} from './newsworthy-photo-ui.js';

const INK='#101414',RED='#d62825',MONEY='#087b50',YELLOW='#f0c94d',PAPER='#e5e6e1',PRINT='#f6f5f0',BODY='#2c2f2b',GOLD='#dca31c';
const COND='"Barlow Condensed",Impact,sans-serif',MONO='"Space Mono",ui-monospace,monospace';
const TAGLINE='Create chaos. Make headlines.',LINK='Play at newsworthy.vamonke.com';

const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('A photo could not be loaded. Please retry.'));i.src=src;});
async function ready(){await Promise.all(['900 64px','400 22px','700 16px'].map((w,i)=>document.fonts.load(w+' '+(i?'"Space Mono"':'"Barlow Condensed"')).catch(()=>{})));}
const texture=load('/news-design/wire-paper-texture.webp').catch(()=>null);
function toBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not make the image.')),'image/png'));}
function canvasFor(w,h){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return [canvas,canvas.getContext('2d')];}
function font(c,f,spacing=0){c.font=f;if('letterSpacing' in c)c.letterSpacing=spacing+'px';}
function caps(s){return String(s||'').toUpperCase();}
function lines(c,text,width){const out=[];let line='';for(const word of String(text).split(/\s+/).filter(Boolean)){const next=line?line+' '+word:word;if(line&&c.measureText(next).width>width){out.push(line);line=word;}else line=next;}if(line)out.push(line);return out;}
// Wraps to at most `max` lines, ending the last one with … when text is cut.
function clamp(c,text,width,max){const all=lines(c,text,width);if(all.length<=max)return all;const kept=all.slice(0,max);let last=kept[max-1];while(last&&c.measureText(last+'…').width>width)last=last.replace(/\s*\S+$/,'')||last.slice(0,-1);kept[max-1]=last+'…';return kept;}

// Paper colour, the wire texture multiplied in, and a light wash on top (as in news-popups.css).
async function paper(c,w,h){c.fillStyle=PAPER;c.fillRect(0,0,w,h);const t=await texture;if(t){c.save();c.globalCompositeOperation='multiply';const s=Math.max(w/t.width,h/t.height);c.drawImage(t,(w-t.width*s)/2,(h-t.height*s)/2,t.width*s,t.height*s);c.restore();}c.fillStyle='rgba(236,233,222,.55)';c.fillRect(0,0,w,h);c.fillStyle=RED;c.fillRect(0,0,w,16);}
function mark(c,x,y,size){c.save();c.translate(x,y);c.scale(size/512,size/512);const eye=new Path2D('M55 256c55-91 117-136 201-136s146 45 201 136c-55 91-117 136-201 136S110 347 55 256Z');c.fillStyle='#101820';c.fill(eye);c.fillStyle='#e8e0cf';c.fill(new Path2D('M106 256c43-60 91-90 150-90s107 30 150 90c-43 60-91 90-150 90s-107-30-150-90Z'));c.fillStyle='#d9362b';c.beginPath();c.arc(256,256,92,0,Math.PI*2);c.fill();c.save();c.translate(256,256);c.rotate(Math.PI/6);c.translate(-256,-256);c.fillStyle='#101820';c.fill(new Path2D('M256 164 309 195 309 256 256 287 203 256 203 195Z'));c.restore();c.fillStyle='#e8e0cf';c.beginPath();c.arc(256,256,29,0,Math.PI*2);c.fill();c.strokeStyle='#d9362b';c.lineWidth=24;c.lineCap='square';c.stroke(new Path2D('M72 172v-68h68M440 172v-68h-68M72 340v68h68M440 340v68h-68'));c.restore();}
// Masthead: mark + NEWSWORTHY, two small lines on the right, a double rule, then the date line. Returns the y under it.
function masthead(c,w,side,right){const base=104;mark(c,side,40,64);font(c,`900 64px ${COND}`,-1);c.textBaseline='alphabetic';c.fillStyle=INK;c.fillText('NEWS',side+76,base);c.fillStyle=RED;c.fillText('WORTHY',side+76+c.measureText('NEWS').width,base);
 font(c,`700 16px ${MONO}`,2.2);c.fillStyle=INK;c.textAlign='right';right.forEach((t,i)=>c.fillText(caps(t),w-side,base-23*(right.length-1-i)));
 c.fillRect(side,116,w-side*2,2);c.fillRect(side,120,w-side*2,2);
 const date=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});font(c,`700 17px ${MONO}`,2.4);c.textAlign='left';c.fillText(caps(date),side,149);c.textAlign='right';c.fillStyle=RED;c.fillText('● LIVE FROM CHOPPER 01',w-side,149);c.fillStyle=INK;c.fillRect(side,163,w-side*2,2);c.textAlign='left';return 165;}
function footer(c,w,side,y){c.fillStyle=INK;c.fillRect(side,y,w-side*2,2);font(c,`700 16px ${MONO}`,2.2);c.textBaseline='top';c.fillText(caps(TAGLINE),side,y+16);c.textAlign='right';c.fillText(caps(LINK),w-side,y+16);c.textAlign='left';c.textBaseline='alphabetic';}
function cover(c,img,x,y,w,h){const s=Math.max(w/img.width,h/img.height),sw=w/s,sh=h/s;c.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,x,y,w,h);}
// A tilted print: white border with a drop shadow, photo cropped to fill. draw(c,w,h) adds the caption and tapes in the print's frame.
function print(c,img,x,y,w,imgH,pad,deg,extraH,draw){const h=imgH+pad*2+extraH;c.save();c.translate(x+w/2,y+h/2);c.rotate(deg*Math.PI/180);c.translate(-w/2,-h/2);c.save();c.shadowColor='rgba(0,0,0,.28)';c.shadowBlur=36;c.shadowOffsetY=16;c.fillStyle=PRINT;c.fillRect(0,0,w,h);c.restore();c.fillStyle='rgba(0,0,0,.14)';c.fillRect(0,h,w,3);cover(c,img,pad,pad,w-pad*2,imgH);draw?.(c,w,h);c.restore();}
function tape(c,text,x,y,deg,size,padX,padY,bg,fg){font(c,`700 ${size}px ${MONO}`,size*.16);const tw=c.measureText(text).width+padX*2,th=size+padY*2;c.save();c.translate(x,y);c.rotate(deg*Math.PI/180);c.shadowColor='rgba(0,0,0,.2)';c.shadowBlur=6;c.shadowOffsetY=2;c.fillStyle=bg;c.fillRect(0,0,tw,th);c.shadowColor='transparent';c.fillStyle=fg;c.textBaseline='middle';c.fillText(text,padX,th/2+1);c.restore();c.textBaseline='alphabetic';return tw;}
function dots(c,x,y,value){for(let i=0;i<4;i++){c.beginPath();c.arc(x+i*23+8,y,6.5,0,Math.PI*2);c.lineWidth=3;c.strokeStyle=RED;c.stroke();if(i<value){c.fillStyle=RED;c.fill();}}}
const cleanReason=r=>String(r?.reason||'').replace(/^(Another shot of this story|Exclusive)[^(]*\([^)]*\)\.\s*/,'').replace(/^Repeat photo[^.]*\.\s*/,'');
const rating=r=>Number.isFinite(r?.baseScore)?r.baseScore.toFixed(1):'—';

export async function createFrontPage(shot,index,count){
 await ready();const r=shot.result||{},img=await load(shot.image);const W=1080,H=1350,side=64,inner=W-side*2;const [canvas,c]=canvasFor(W,H);await paper(c,W,H);
 masthead(c,W,side,['Special edition',`Photo ${index+1} of ${count}`]);
 // Headline: two lines at 92px when it fits, shrinking for long ones, never more than three lines.
 let size=92,head;for(;size>=60;size-=4){font(c,`900 ${size}px ${COND}`,-1.5);head=lines(c,caps(r.headline||'Not scored'),inner);if(head.length<=2)break;}if(head.length>3){font(c,`900 ${size+4}px ${COND}`,-1.5);head=clamp(c,caps(r.headline),inner,3);}
 const lh=Math.round(size*.86),headTop=193;c.fillStyle=INK;c.textBaseline='top';head.forEach((l,i)=>c.fillText(l,side,headTop+i*lh-size*.07));c.textBaseline='alphabetic';
 // Bottom block: description | ratings | Sold for stamp, with the same space above and below the dividers.
 const footY=H-72,rateW=250,stampW=166,descW=inner-rateW-30-stampW-30-60;font(c,`400 22px ${MONO}`);const desc=clamp(c,cleanReason(r),descW,5),deckH=Math.max(desc.length*32,147,166),deckTop=footY-37-deckH,ruleY=deckTop-36;
 const printTop=headTop+head.length*lh+26,printH=ruleY-14-printTop,imgH=printH-32;
 print(c,img,side+6,printTop,inner-12,imgH,16,-1,0,(c)=>{if(r.custom)tape(c,'EXCLUSIVE',-22,-14,-6,22,26,10,'rgba(240,201,77,.92)',INK);else if(r.repeat)tape(c,'REPEAT',-22,-14,-6,22,26,10,'rgba(16,20,20,.9)','#fff');});
 c.fillStyle=INK;c.fillRect(side,ruleY,inner,2);
 font(c,`400 22px ${MONO}`);c.fillStyle=BODY;c.textBaseline='top';desc.forEach((l,i)=>c.fillText(l,side,deckTop+i*32+1));
 const rx=side+descW+30;c.fillStyle=INK;c.fillRect(rx,deckTop,2,deckH);const lx=rx+32,rw=rateW-30;
 font(c,`900 26px ${COND}`);[['IMPACT','event'],['CLARITY','clarity'],['SPECTACLE','spectacle']].forEach(([label,key],i)=>{const y=deckTop+i*34;c.fillStyle=INK;c.fillText(label,lx,y);dots(c,lx+rw-85,y+13,r.grades?.[key]??0);});
 const by=deckTop+3*34+4;c.fillStyle=INK;c.fillRect(lx,by,rw,1);font(c,`900 32px ${COND}`);c.fillText('RATING',lx,by+9);c.textAlign='right';c.fillText(rating(r)+'/10',lx+rw,by+9);c.textAlign='left';
 const sx=rx+rateW+30;c.fillRect(sx,deckTop,2,deckH);
 const cx=sx+32+stampW/2,cy=deckTop+78;c.save();c.translate(cx,cy);c.rotate(-8*Math.PI/180);c.strokeStyle=MONEY;c.lineWidth=3;c.beginPath();c.arc(0,0,76.5,0,Math.PI*2);c.stroke();c.lineWidth=2;c.beginPath();c.arc(0,0,82,0,Math.PI*2);c.stroke();c.fillStyle=MONEY;c.textAlign='center';c.textBaseline='middle';font(c,`700 14px ${MONO}`,2);c.fillText(r.earned?'SOLD FOR':'NO SALE',0,-24);let ps=50;do{font(c,`900 ${ps}px ${COND}`);ps-=2;}while(c.measureText(dollars(r.earned)).width>132&&ps>30);c.fillText(dollars(r.earned),0,14);c.restore();c.textAlign='left';c.textBaseline='alphabetic';
 footer(c,W,side,footY);
 return toBlob(canvas);
}

// Slots for the four smaller prints: one under the total, then a row of three.
const RIGHT=[776,296,2],ROW=[[6,606,-1.5],[392,622,1.5],[776,618,-2]];
export async function createPhotoPackage(shots,total){
 await ready();const W=1200,side=48,top=195;
 const best=shots.filter(s=>s.result).sort((a,b)=>b.result.earned-a.result.earned).slice(0,5),images=await Promise.all(best.map(s=>load(s.image)));
 const row=best.length-2>0?best.length-2:0,winH=row?936:Math.max(620,best.length>1?640:600),H=top+winH+36;
 const [canvas,c]=canvasFor(W,H);await paper(c,W,H);masthead(c,W,side,['Photo package',`${shots.length} photo${shots.length===1?'':'s'}`]);
 const at=(x,y)=>[side+x,top+y];
 // Right column: what you earned and the stars.
 const tx=W-side;c.textAlign='right';c.fillStyle=INK;font(c,`700 18px ${MONO}`,2.9);c.fillText('YOU EARNED',tx,top+22);c.fillStyle=MONEY;let ms=116;do{font(c,`900 ${ms}px ${COND}`,-2);ms-=4;}while(c.measureText(dollars(total)).width>330&&ms>60);c.fillText(dollars(total),tx,top+130);
 const earned=starsFor(total);for(let i=0;i<3;i++){const x=tx-39-(2-i)*90,y=top+196;c.save();if(i<earned){c.strokeStyle=GOLD;c.lineWidth=3;c.beginPath();c.arc(x,y,37.5,0,Math.PI*2);c.stroke();c.lineWidth=2;c.beginPath();c.arc(x,y,43,0,Math.PI*2);c.stroke();c.fillStyle=GOLD;c.textAlign='center';c.textBaseline='middle';c.font='52px Arial,sans-serif';c.fillText('★',x,y+2);}else{c.setLineDash([6,6]);c.strokeStyle='rgba(16,20,20,.28)';c.lineWidth=2;c.beginPath();c.arc(x,y,33,0,Math.PI*2);c.stroke();}c.restore();}
 c.textAlign='right';c.fillStyle=INK;font(c,`700 18px ${MONO}`,2.9);c.fillText(`${earned} OF 3 STARS`,tx,top+264);c.textAlign='left';
 // Caption under a print: headline left (two lines at most), price right, both sitting on the same bottom line.
 const caption=(c,r,w,pad,imgH,hs,ps)=>{font(c,`900 ${ps}px ${COND}`);const price=dollars(r.earned),pw=c.measureText(price).width;font(c,`900 ${hs}px ${COND}`);const ls=clamp(c,caps(r.headline),w-pad*2-pw-(hs>30?24:10),2),lh=hs*.92,y0=pad+imgH+(hs>30?14:10);c.fillStyle=INK;c.textBaseline='top';ls.forEach((l,i)=>c.fillText(l,pad,y0+i*lh));c.textBaseline='alphabetic';font(c,`900 ${ps}px ${COND}`);c.fillStyle=MONEY;c.textAlign='right';c.fillText(price,w-pad,y0+ls.length*lh);c.textAlign='left';return ls.length*lh;};
 const small=(r)=>(c)=>r.custom?tape(c,'EXCLUSIVE',-10,-10,-5,13,12,6,'rgba(240,201,77,.92)',INK):r.repeat?tape(c,'REPEAT',-10,-10,-5,13,12,6,'rgba(16,20,20,.9)','#fff'):0;
 if(best[0]){const r=best[0].result,[x,y]=at(10,10);print(c,images[0],x,y,736,440,16,-1.5,14+64,(c,w)=>{caption(c,r,w,16,440,34,40);font(c,`700 22px ${MONO}`,3.5);tape(c,'TOP SHOT',w-40-c.measureText('TOP SHOT').width-52,-16,4,22,26,10,'rgba(214,40,37,.94)','#fff');});}
 const slots=[RIGHT,...(row===1?[[392,622,1.5]]:row===2?[[200,606,-1.5],[590,622,1.5]]:ROW)];
 best.slice(1).forEach((s,i)=>{const [sx,sy,deg]=slots[i],[x,y]=at(sx,sy);print(c,images[i+1],x,y,322,186,12,deg,10+40,(c,w)=>{caption(c,s.result,w,12,186,21,24);small(s.result)(c);});});
 footer(c,W,side,top+winH-32);
 return toBlob(canvas);
}
