// Match object-fit: cover, then map the visible aiming rectangle into source pixels.
export function cropRect(vw,vh,bw,bh,x=.5,y=.48,fraction=.48){
 const scale=Math.max(bw/vw,bh/vh),w=Math.min(bw*fraction,bh*.66*4/3),h=w*3/4;
 const left=Math.max(0,Math.min(bw-w,x*bw-w/2)),top=Math.max(0,Math.min(bh-h,y*bh-h/2));
 return {left,top,width:w,height:h,sx:(left+(vw*scale-bw)/2)/scale,sy:(top+(vh*scale-bh)/2)/scale,sw:w/scale,sh:h/scale};
}
