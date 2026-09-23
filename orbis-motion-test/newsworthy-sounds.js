// CC0 clips adapted by Nicky Case; original creators and sources in public/audio/wbwwb/CREDITS.md.
let audio;
let sound = true;
const buffers = new Map();
const loading = new Map();
const active = new Set();
const clips = { shutter: 'wbwwb/cam_snap.mp3', news: 'wbwwb/breaking_news.mp3', count: 'money-counter.m4a' };
const loadingClip = '/audio/helicopter-midflight-interior.m4a';
let loadingAudio;

export function setSound(value) {
  sound = Boolean(value);
  if (!sound) {
    for (const source of active) source.stop();
    stopLoadingSound();
  }
}
export function startLoadingSound() {
  if (!sound) return;
  loadingAudio ??= new Audio(loadingClip);
  loadingAudio.loop = true;
  loadingAudio.currentTime = 0;
  void loadingAudio.play().catch(error => console.warn('Could not play loading sound', error));
}
export function stopLoadingSound() {
  if (!loadingAudio) return;
  loadingAudio.pause();
  loadingAudio.currentTime = 0;
}
export function context() {
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  void audio.resume().catch(() => {});
  for (const name of Object.keys(clips)) void load(name).catch(() => {});
  return audio;
}
function load(name) {
  if (!loading.has(name)) {
    const request = fetch(`/audio/${clips[name]}`)
      .then(response => {
        if (!response.ok) throw new Error(`Sound download failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then(data => audio.decodeAudioData(data))
      .then(buffer => buffers.set(name, buffer))
      .catch(error => { loading.delete(name); console.warn('Could not load game sound', name, error); });
    loading.set(name, request);
  }
  return loading.get(name);
}
function play(name, volume) {
  if (!sound) return;
  try {
    const a = context(), buffer = buffers.get(name);
    // Never play a late shutter after a slow download. Clips preload at round start.
    if (!buffer) return;
    for (const source of active) if (source.clipName === name) source.stop();
    const source = a.createBufferSource(), gain = a.createGain();
    source.buffer = buffer;
    source.clipName = name;
    gain.gain.value = volume;
    source.connect(gain).connect(a.destination);
    active.add(source);
    source.onended = () => { active.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  } catch (error) { console.warn('Could not play game sound', error); }
}
export function shutterSound() { play('shutter', .7); }
export function moneySound() { play('news', .45); }
// Trimmed to 1.2s; the recap count-up runs for the same length (COUNT_MS in newsworthy-motion.js).
export function countSound() { play('count', .6); }
export function stopCountSound() { for (const source of active) if (source.clipName === 'count') source.stop(); }

export async function preloadSounds() { context(); await Promise.all(Object.keys(clips).map(load)); }
