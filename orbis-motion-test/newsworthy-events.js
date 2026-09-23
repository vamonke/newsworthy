export const EVENT_WINDOW_MS=20000;
export const EVENTS=[
 {id:'ufo',code:'UFO',name:'Aliens',label:'Aliens',prompt:'A huge silver flying saucer flies low above the intersection. Blue light shines onto the street.'},
 {id:'airstrike',code:'STK',name:'Air strike',label:'Air strike',prompt:'An artillery strike begins. Glowing shells streak down from the sky in long bright lines and slam into the street, each one bursting into a flash of orange fire and a tall column of gray smoke and dust. More shells keep falling.'},
 {id:'monster',code:'MON',name:'Monster',label:'Monster',prompt:'A colossal flying monster circles low above the downtown intersection. Its enormous bat-like wings fill the sky and cast a dark shadow over the traffic. The creature stays fully visible above the street.'},
 {id:'fireworks',code:'FWK',name:'Fireworks',label:'Fireworks',prompt:'Huge colorful fireworks burst above the rooftops. Bright sparks fill the sky.'},
 {id:'octopus',code:'OCT',name:'Octopus',label:'Octopus',prompt:'A water tower on a rooftop bursts open and a giant purple octopus spills out. Its long tentacles slide down the side of the building and curl around the cars on the street below.'},
 {id:'gorilla',code:'GOR',name:'Gorilla',label:'Gorilla',prompt:'A giant black gorilla climbs up the side of the tallest building, gripping the windows with its huge hands. It stops near the top and beats its chest.'},
 {id:'robot',code:'BOT',name:'Robot',label:'Robot',prompt:'A big truck in the middle of the road unfolds into a giant robot. Its metal panels flip open, arms and legs swing out, and it rises up to stand taller than the buildings, its eyes glowing blue.'},
 {id:'balloon',code:'BAL',name:'Balloon',label:'Balloon',prompt:'A giant round red helium balloon floats above the intersection. Its glossy rubber surface and long dangling string are clearly visible.'},
 {id:'doughnut',code:'DNT',name:'Doughnut',label:'Doughnut',prompt:'A giant doughnut with pink icing and colorful sprinkles fills the intersection. Cars look tiny beside it.'},
 {id:'plane',code:'AIR',name:'Plane crash',label:'Plane crash',prompt:'A passenger plane crashes onto the broad city street. Broken wings and the aircraft body fill the road as flames and smoke rise around them.'},
];
export function optionsFor(turn){return EVENTS.slice((turn%2)*3,(turn%2)*3+3);}
// Said once, in the opening prompt. Orbis keeps the framing, so event prompts only describe what changes
// (https://docs.reactor.inc/model-api-reference/visko-orbis-stable/prompt-guide). "High angle", not "overhead", keeps it off top-down.
export const CAMERA='Wide shot, high angle from a helicopter above the city, angled down toward the streets with the skyline along the top of the frame. Static camera, deep depth of field.';
