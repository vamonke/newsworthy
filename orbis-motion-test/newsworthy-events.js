export const EVENT_WINDOW_MS=20000;
export const EVENTS=[
 {id:'ufo',label:'🛸 Aliens',prompt:'A huge silver flying saucer flies low above the intersection. Blue light shines onto the street.'},
 {id:'explosion',label:'💥 Explosion',prompt:'A huge orange explosion bursts across the intersection. Debris flies above the street.'},
 {id:'flood',label:'🌊 Flood',prompt:'Fast floodwater rushes through the intersection. Cars float down the street.'},
 {id:'lightning',label:'⚡ Lightning',prompt:'Bright lightning strikes the street between the buildings. Repeated flashes light up the city.'},
 {id:'tornado',label:'🌪️ Tornado',prompt:'A huge rotating tornado fills the street between the buildings. Debris spins around the funnel.'},
 {id:'fireworks',label:'🎆 Fireworks',prompt:'Huge colorful fireworks burst above the rooftops. Bright sparks fill the sky.'},
 {id:'rainbow',label:'🌈 Rainbow',prompt:'A huge vivid rainbow stretches across the sky above the city rooftops.'},
 {id:'balloon',label:'🎈 Red balloon',prompt:'A giant round red helium balloon floats above the intersection. Its glossy rubber surface and long dangling string are clearly visible.'},
 {id:'duck',label:'🦆 Rubber duck',prompt:'A giant yellow rubber duck fills the intersection. The duck is taller than the cars around it.'},
 {id:'doughnut',label:'🍩 Giant doughnut',prompt:'A giant doughnut with pink icing and colorful sprinkles fills the intersection. Cars look tiny beside it.'},
 {id:'plane',label:'✈️ Plane crash',prompt:'A passenger plane crashes onto the broad city street. Broken wings and the aircraft body fill the road as flames and smoke rise around them.'},
];
export function optionsFor(turn){return EVENTS.slice((turn%2)*3,(turn%2)*3+3);}
export const CAMERA='A wide view from a helicopter high above the city, looking down at the streets. Roads, intersections and traffic fill most of the frame. The distant skyline stays along the upper edge. The camera stays high and keeps the streets in the center.';
