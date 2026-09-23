export const EVENT_WINDOW_MS=20000;
export const EVENTS=[
 {id:'ufo',code:'UFO',name:'Aliens',label:'Aliens',prompt:'A huge silver flying saucer flies low above the intersection. Blue light shines onto the street.'},
 {id:'airstrike',code:'STK',name:'Air strike',label:'Air strike',prompt:'An artillery strike begins. Glowing shells streak down from the sky in long bright lines and slam into the street, each one bursting into a flash of orange fire and a tall column of gray smoke and dust. More shells keep falling.'},
 {id:'monster',code:'MON',name:'Monster',label:'Monster',prompt:'A colossal flying monster circles low above the downtown intersection. Its enormous bat-like wings fill the sky and cast a dark shadow over the traffic. The creature stays fully visible above the street.'},
 {id:'fireworks',code:'FWK',name:'Fireworks',label:'Fireworks',prompt:'Huge colorful fireworks burst above the rooftops. Bright sparks fill the sky.'},
 {id:'dinosaur',code:'DIN',name:'Giant dinosaur',label:'Giant dinosaur',prompt:'A giant green dinosaur stomps into the downtown intersection from a side street. It is taller than the buildings around it, with a long swinging tail, jagged spikes along its back and huge clawed feet, and the cars around it look tiny.'},
 {id:'robot',code:'BOT',name:'Robot',label:'Robot',prompt:'A big truck in the middle of the road unfolds into a giant robot. Its metal panels flip open, arms and legs swing out, and it rises up to stand taller than the buildings, its eyes glowing blue.'},
 {id:'balloon',code:'BAL',name:'Red balloon',label:'Red balloon',prompt:'A giant round red helium balloon floats above the intersection. Its glossy rubber surface and long dangling string are clearly visible.'},
 {id:'duck',code:'DUK',name:'Rubber duck',label:'Rubber duck',prompt:'A giant yellow rubber duck fills the intersection. The duck is taller than the cars around it.'},
 {id:'doughnut',code:'DNT',name:'Doughnut',label:'Doughnut',prompt:'A giant doughnut with pink icing and colorful sprinkles fills the intersection. Cars look tiny beside it.'},
 {id:'plane',code:'AIR',name:'Plane crash',label:'Plane crash',prompt:'A passenger plane crashes onto the broad city street. Broken wings and the aircraft body fill the road as flames and smoke rise around them.'},
];
export function optionsFor(turn){return EVENTS.slice((turn%2)*3,(turn%2)*3+3);}
export const CAMERA='A wide view from a helicopter high above the city, looking down at the streets. Roads, intersections and traffic fill most of the frame. The distant skyline stays along the upper edge. The camera stays high and keeps the streets in the center.';
