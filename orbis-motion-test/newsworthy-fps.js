// Live video frame rate, counted from the frames the page actually shows (requestVideoFrameCallback).
// From Singapore the stream sometimes arrives at 2–3 fps while Reactor's own recording of the same session
// runs at 18 (2026-09-27), so this measures delivery to the player, not the model.
// second() is called once a second while the tab is visible; hidden tabs don't paint video, so those seconds are skipped.
export const SLOW_FPS=5,SMOOTH_FPS=8,SWITCH_AFTER=5,START_SECONDS=15;
export class FrameRate{
 constructor(){this.seconds=0;this.frames=0;this.slowSeconds=0;this.startFrames=0;this.startSeconds=0;this.slow=false;this.streak=0;}
 // Returns true when `slow` changed. Slow starts after 5 seconds in a row under 5 fps and ends after 5 in a row at 8 or more.
 second(frames){this.seconds++;this.frames+=frames;if(frames<SLOW_FPS)this.slowSeconds++;if(this.startSeconds<START_SECONDS){this.startSeconds++;this.startFrames+=frames;}
  const toward=this.slow?frames>=SMOOTH_FPS:frames<SLOW_FPS;this.streak=toward?this.streak+1:0;if(this.streak<SWITCH_AFTER)return false;this.slow=!this.slow;this.streak=0;return true;}
 // Average fps, share of seconds under 5 fps (%), and average fps over the first 15 seconds.
 summary(){const avg=(f,s)=>s?Math.round(f/s*10)/10:0;return{fps:avg(this.frames,this.seconds),slowShare:this.seconds?Math.round(this.slowSeconds/this.seconds*100):0,startFps:avg(this.startFrames,this.startSeconds),seconds:this.seconds};}
}
