export const EVENT_WINDOW_MS=20000;
export const EVENTS=[
 {id:'ufo',code:'UFO',name:'Aliens',label:'Aliens',prompt:'A huge silver flying saucer flies low above the intersection. Blue light shines onto the street.'},
 {id:'meteor',code:'MET',name:'Meteor crash',label:'Meteor crash',prompt:'A gigantic glowing meteor has crashed into the downtown intersection. The meteor sits fully visible inside a smoking crater as broken asphalt and small flames surround it.'},
 {id:'monster',code:'MON',name:'Flying monster',label:'Flying monster',prompt:'A colossal flying monster circles low above the downtown intersection. Its enormous bat-like wings fill the sky and cast a dark shadow over the traffic. The creature stays fully visible above the street.'},
 {id:'fireworks',code:'FWK',name:'Fireworks',label:'Fireworks',prompt:'Huge colorful fireworks burst above the rooftops. Bright sparks fill the sky.'},
 {id:'rainbow',code:'RNB',name:'Rainbow',label:'Rainbow',prompt:'A huge vivid rainbow stretches across the sky above the city rooftops.'},
 {id:'balloon',code:'BAL',name:'Red balloon',label:'Red balloon',prompt:'A giant round red helium balloon floats above the intersection. Its glossy rubber surface and long dangling string are clearly visible.'},
 {id:'duck',code:'DUK',name:'Rubber duck',label:'Rubber duck',prompt:'A giant yellow rubber duck fills the intersection. The duck is taller than the cars around it.'},
 {id:'doughnut',code:'DNT',name:'Giant doughnut',label:'Giant doughnut',prompt:'A giant doughnut with pink icing and colorful sprinkles fills the intersection. Cars look tiny beside it.'},
 {id:'plane',code:'AIR',name:'Plane crash',label:'Plane crash',prompt:'A passenger plane crashes onto the broad city street. Broken wings and the aircraft body fill the road as flames and smoke rise around them.'},
];
export function optionsFor(turn){return EVENTS.slice((turn%2)*3,(turn%2)*3+3);}
export const CAMERA='A wide view from a helicopter high above the city, looking down at the streets. Roads, intersections and traffic fill most of the frame. The distant skyline stays along the upper edge. The camera stays high and keeps the streets in the center.';
