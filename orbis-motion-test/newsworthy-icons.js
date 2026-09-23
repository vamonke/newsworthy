// Solid 24×24 incident icons, one colour (currentColor); details are evenodd cut-outs.
// Keyed by event id in newsworthy-events.js. Approved in news-icons-design.html.
const ICONS={
 ufo:'<path d="M8 8.5a4 4 0 0 1 8 0z"/><ellipse cx="12" cy="10.5" rx="10" ry="3"/><path d="M8.6 14.2h6.8L18.5 22h-13z" opacity=".45"/>',
 airstrike:'<path fill-rule="evenodd" d="M12 22.5c-1.8-1.6-3-4-3-6.8V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v10.2c0 2.8-1.2 5.2-3 6.8zM12 11.6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/><path d="M9 5.8 5.5 2.2v6L9 11zM15 5.8l3.5-3.6v6L15 11z"/><path d="M10.4 4.5h3.2L12 1z" opacity=".45"/>',
 monster:'<g transform="translate(12 11.5) scale(1.18) translate(-12 -11.5)"><path d="M12 7.5c-1 0-1.7.6-2 1.5L9 7.6 8.3 10C6.4 7.3 3.4 6.3 1 7.2c1.8 1.1 2.9 2.9 3 5.2 1-1 2.6-1.1 3.6-.1.6-.9 1.6-1.2 2.4-.8.2 1.4.9 2.8 2 3.9 1.1-1.1 1.8-2.5 2-3.9.8-.4 1.8-.1 2.4.8 1-1 2.6-.9 3.6.1.1-2.3 1.2-4.1 3-5.2-2.4-.9-5.4.1-7.3 2.8L15 7.6 14 9c-.3-.9-1-1.5-2-1.5z"/></g>',
 fireworks:'<circle cx="12" cy="12" r="2.6"/><path d="M12 2.5v4.2M12 17.3v4.2M2.5 12h4.2M17.3 12h4.2M5.3 5.3l3 3M15.7 15.7l3 3M18.7 5.3l-3 3M8.3 15.7l-3 3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>',
 octopus:'<path fill-rule="evenodd" d="M12 2C8 2 5 5 5 9c0 2 .8 3.6 2 4.6L4 18c-.5 1 .5 2 1.5 1.3L9 16l-.5 5c0 1 1.5 1.3 1.8.3L12 16l1.7 5.3c.3 1 1.8.7 1.8-.3L15 16l3.5 3.3c1 .7 2-.3 1.5-1.3l-3-4.4c1.2-1 2-2.6 2-4.6 0-4-3-7-7-7zM9.6 8.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm4.8 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"/>',
 gorilla:'<path fill-rule="evenodd" d="M12 1.8c-2 0-3.6 1-4.3 2.4C5.3 4.6 3.6 6.8 3.6 9.4c0 1 .2 2 .6 2.8-.3.8-.4 1.6-.4 2.4 0 4.2 3.6 7.6 8.2 7.6s8.2-3.4 8.2-7.6c0-.8-.1-1.6-.4-2.4.4-.8.6-1.8.6-2.8 0-2.6-1.7-4.8-4.1-5.2C15.6 2.8 14 1.8 12 1.8zM6.6 9.8c1.6-1 3.4-1.5 5.4-1.5s3.8.5 5.4 1.5l-.4 1c-1.5-.8-3.2-1.2-5-1.2s-3.5.4-5 1.2zM9.3 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm5.4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM10.8 14.4a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6zm2.4 0a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6zM9.2 18c.9.6 1.8.9 2.8.9s1.9-.3 2.8-.9l.3.7c-1 .7-2 1-3.1 1s-2.1-.3-3.1-1z"/>',
 robot:'<path fill-rule="evenodd" d="M11 1.5h2V5h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4zM8.5 9v3h2.5V9zm4.5 0v3h2.5V9zm-4 5v1.5h6V14z"/><path d="M2 9h2v5H2zM20 9h2v5h-2zM9 19h6v3.5H9z"/>',
 balloon:'<path d="M12 2c3.9 0 7 3.1 7 7 0 4.4-3.5 8-7 8s-7-3.6-7-8c0-3.9 3.1-7 7-7z"/><path d="M10.6 16.6h2.8l.7 1.7h-4.2z"/><path d="M12 18.3c-1.2 1.3 1.2 2.4 0 3.9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>',
 doughnut:'<path fill-rule="evenodd" d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm0 6a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM6.2 8.4l2 .9-.4.9-2-.9zm9.9-3.1 1.2 1.8-.8.6-1.2-1.8zm1.5 9.6 1.9-1 .5.9-1.9 1zM9.4 17.7l-.3 2.1-1-.1.3-2.1z"/>',
 plane:'<g transform="rotate(135 12 12) translate(12 12) scale(.82) translate(-12 -12)"><path d="M12 2c.8 0 1.5 1 1.5 2.5V9l7.5 4.5v2L13.5 13v4.5l2.5 2V21L12 20l-4 1v-1.5l2.5-2V13L3 15.5v-2L10.5 9V4.5C10.5 3 11.2 2 12 2z"/></g><circle cx="5" cy="4.5" r="2.2" opacity=".45"/><circle cx="8.2" cy="3" r="1.5" opacity=".45"/>',
};
export function eventIcon(id,fallback=''){
 if(!ICONS[id]){const code=document.createElement('span');code.className='event-icon';code.textContent=fallback;return code;}
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
 icon.setAttribute('class','event-icon');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('fill','currentColor');icon.setAttribute('aria-hidden','true');
 icon.innerHTML=ICONS[id];return icon;
}
