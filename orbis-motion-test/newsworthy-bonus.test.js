import test from 'node:test';import assert from 'node:assert/strict';import {isCustom,presetIn} from './newsworthy-bonus.js';import {createNewsJudge} from './news-judge-api.js';
// Headlines and reasons taken from logged rounds in runs/.
const custom=[
 ['Giant green dinosaur spotted near city building','Clear shot of a massive dinosaur creature emerging from a building structure.'],
 ['Street Flooding Submerges Vehicles','Visible standing water covers a roadway surrounding vehicles.'],
 ['Bright rainbow appears over city','An unusual bright rainbow spans across the sky above city buildings.'],
 ['Red spherical object spotted near high-rise building','A strange red orb-like object is hovering near a skyscraper, distinct from the previous vehicle fires.'],
];
const preset=[
 ['Giant pastry blocks city street','The giant donut-like object from previous photo 1 has shifted position.'],
 ['Saucer hovers over city street','A silver disc hangs above traffic.'],
 ['UFO Hovers Over City Street With Blue Beam','The craft shines down onto one lane.'],
 ['Vehicle Fire Blazes on City Street','Flames and smoke rise from a car.'],
 ['Massive fireball erupts from skyscraper facade','Clear shot of a large explosion.'],
 ['Giant purple creature grips skyscraper window','An extraordinary giant purple tentacled creature is visible.'],
 ['Close-up of Large Creature','An extreme close-up view of the same winged creature from photo 5.'],
 ['Giant ape scales tower','A huge dark primate clings to the windows.'],
 ['Rubber duck blocks intersection','Cars drive around a giant yellow toy.'],
 ['Colorful bursts light the rooftops','Fireworks explode above the skyline.'],
];
test('invented subjects count as custom',()=>{for(const [headline,reason] of custom)assert.equal(isCustom({headline,reason}),true,headline);});
test('presets, their aftermath and the opening scene never count as custom',()=>{for(const [headline,reason] of preset)assert.equal(isCustom({headline,reason}),false,headline);});
test('every preset on the event desk blocks the bonus',()=>{assert.equal(presetIn('Giant robot stomps downtown',['ufo']),null);assert.equal(presetIn('Giant robot stomps downtown'),'robot');});
const image=n=>'data:image/jpeg;base64,'+Buffer.from('photo'+n).toString('base64');
const reply=v=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(v)}}]})});
const verdict=(headline,previous_index=-1,strength=2)=>({event_type:'other',event_strength:strength,clarity:4,spectacle:2,headline,reason:'Clearly visible.',previous_index});
test('custom photos pay 1.5×, repeats and duplicates keep the bonus at half rate',async()=>{const answers=[verdict('Giant dinosaur roars'),verdict('Giant dinosaur roars',0)];let n=0;const j=createNewsJudge('test',async()=>reply(answers[n++]));const {roundId}=j.create();
 const first=await j.judge({roundId,photoId:'shot-1',image:image(1),custom:true});assert.equal(first.value,500);assert.equal(first.earned,750);assert.equal(first.custom,true);assert.match(first.reason,/^Exclusive · 1\.5× \(\$500 to \$750\)\./);
 const repeat=await j.judge({roundId,photoId:'shot-2',image:image(2),custom:true});assert.equal(repeat.earned,375);assert.match(repeat.reason,/^Another shot of this story · 50% rate \(\$750 to \$375\)\./);
 const duplicate=await j.judge({roundId,photoId:'shot-3',image:image(1),custom:true});assert.equal(duplicate.earned,375);assert.equal(duplicate.total,1500);});
test('preset photos and empty streets get no bonus',async()=>{const answers=[verdict('UFO hovers over city street'),verdict('Nothing newsworthy yet',-1,0)];let n=0;const j=createNewsJudge('test',async()=>reply(answers[n++]));const {roundId}=j.create();
 const ufo=await j.judge({roundId,photoId:'shot-1',image:image(1),custom:true});assert.equal(ufo.earned,500);assert.equal(ufo.custom,false);assert.equal(ufo.reason,'Clearly visible.');
 const empty=await j.judge({roundId,photoId:'shot-2',image:image(2),custom:true});assert.equal(empty.earned,0);assert.equal(empty.custom,false);});
test('no bonus unless the player had sent their own scene before the shot',async()=>{const j=createNewsJudge('test',async()=>reply(verdict('Giant dinosaur roars')));const {roundId}=j.create();
 for(const [n,custom] of [[1,undefined],[2,false],[3,'true']]){const r=await j.judge({roundId,photoId:'shot-'+n,image:image(n),custom});assert.equal(r.custom,false);assert.equal(r.bonus,1);}});
