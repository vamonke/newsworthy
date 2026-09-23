import {optionsFor} from './newsworthy-events.js';
// Photos of something the player invented pay extra. The judge only sees pixels, so "invented" means its
// headline names nothing the player could have bought from the event desk or found in the opening scene.
// Any match means no bonus: a miss costs the player a bonus rather than paying 1.5× for a preset.
export const CUSTOM_BONUS=1.5;
export const PRESET_WORDS={
 ufo:/\b(ufos?|saucers?|aliens?|extraterrestrials?|space ?ships?|spacecraft|motherships?|flying (object|disc|disk)s?|discs?|disks?|craft|beams?)\b/,
 airstrike:/\b(air ?strikes?|artillery|shells?|shelling|missiles?|rockets?|bomb\w*|explo\w*|blasts?|detonat\w*|craters?|rubble|debris|shrapnel)\b/,
 monster:/\b(monsters?|beasts?|bats?|bat-like|wings?|winged|flying creatures?)\b/,
 fireworks:/\b(fireworks?|pyrotechnic\w*|sparks?|sparkl\w*)\b/,
 octopus:/\b(octop\w*|tentacle\w*|squids?|kraken|cephalopods?)\b/,
 gorilla:/\b(gorillas?|apes?|primates?|monkeys?|kong|chest-?beating)\b/,
 robot:/\b(robots?|robotic|mechs?|transform\w*|androids?)\b/,
 balloon:/\b(balloons?)\b/,
 doughnut:/\b(doughnuts?|donuts?|sprinkles|pastry|pastries)\b/,
 plane:/\b(planes?|airplanes?|aeroplanes?|aircraft|airliners?|jets?|jetliners?|fuselage)\b/,
};
// Every round opens on a burning crashed car, a rubber duck and a UFO (newsworthy-stream.js); fire and smoke also linger after strikes.
export const OPENING_WORDS=/\b(fire\w*|flames?|aviation|fiery|blaz\w*|burn\w*|ablaze|infern\w*|engulf\w*|ignit\w*|smok\w*|smould\w*|smold\w*|crash\w*|collisions?|accidents?|wreck\w*|pile-?ups?|ducks?|rubber)\b/;
const OFFERED=[...new Set([0,1].flatMap(t=>optionsFor(t).map(e=>e.id)))];
// Returns the preset (or 'opening') the text names, or null when it names none of them.
export function presetIn(text,offered=OFFERED){
 const t=String(text).toLowerCase();
 if(OPENING_WORDS.test(t))return 'opening';
 return offered.find(id=>PRESET_WORDS[id]?.test(t))||null;
}
// The reason often compares with earlier photos ("distinct from the previous vehicle fires"); those clauses describe other photos, not this one.
const COMPARISON=/\b(distinct|separate|different|apart) from [^.;]*|\b(unlike|besides) [^.;,]*/gi;
export function isCustom(v){return presetIn(v.headline+' '+String(v.reason).replace(COMPARISON,''))===null;}
