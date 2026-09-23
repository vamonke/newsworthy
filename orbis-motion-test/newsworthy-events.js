export const EVENT_WINDOW_MS=20000;
export const EVENTS=[
 {id:'ufo',code:'UFO',label:'Aliens',prompt:'A huge silver flying saucer flies low above the intersection. Blue light shines onto the street.'},
 {id:'meteor',code:'MET',label:'Meteor crash',prompt:'A gigantic glowing meteor has crashed into the downtown intersection. The meteor sits fully visible inside a smoking crater as broken asphalt and small flames surround it.'},
 {id:'monster',code:'MON',label:'Flying monster',prompt:'A colossal flying monster circles low above the downtown intersection. Its enormous bat-like wings fill the sky and cast a dark shadow over the traffic. The creature stays fully visible above the street.'},
 {id:'robot',code:'BOT',label:'Giant robot',prompt:'A colossal retro robot marches through the downtown intersection. Its metal body towers above the cars and bright sparks fly from its joints. The robot stays fully visible in the street.'},
 {id:'tornado',code:'TRN',label:'Tornado',prompt:'A huge rotating tornado fills the street between the buildings. Debris spins around the funnel.'},
 {id:'fireworks',code:'FWK',label:'Fireworks',prompt:'Huge colorful fireworks burst above the rooftops. Bright sparks fill the sky.'},
 {id:'portal',code:'PRT',label:'Mysterious portal',prompt:'A gigantic circular portal floats above the downtown intersection. Its bright swirling center and glowing colored rim fill the sky while strange light shines onto the cars below. The portal stays fully visible.'},
 {id:'blimp',code:'BLP',label:'Runaway blimp',prompt:'A huge damaged news blimp drifts dangerously low between the downtown buildings. The blimp fills the sky above the intersection and trails a long plume of dark smoke.'},
 {id:'rainbow',code:'RNB',label:'Rainbow',prompt:'A huge vivid rainbow stretches across the sky above the city rooftops.'},
 {id:'balloon',code:'BAL',label:'Red balloon',prompt:'A giant round red helium balloon floats above the intersection. Its glossy rubber surface and long dangling string are clearly visible.'},
 {id:'duck',code:'DUK',label:'Rubber duck',prompt:'A giant yellow rubber duck fills the intersection. The duck is taller than the cars around it.'},
 {id:'doughnut',code:'DNT',label:'Giant doughnut',prompt:'A giant doughnut with pink icing and colorful sprinkles fills the intersection. Cars look tiny beside it.'},
 {id:'plane',code:'AIR',label:'Plane crash',prompt:'A passenger plane crashes onto the broad city street. Broken wings and the aircraft body fill the road as flames and smoke rise around them.'},
];
export function optionsFor(turn){return EVENTS.slice((turn%2)*3,(turn%2)*3+3);}
export const CAMERA='A wide view from a helicopter high above the city, looking down at the streets. Roads, intersections and traffic fill most of the frame. The distant skyline stays along the upper edge. The camera stays high and keeps the streets in the center.';
