import { DurableObject } from 'cloudflare:workers';

// One instance, created in western North America, where Gemini works. It only forwards requests to
// Gemini for rounds whose own location Gemini refuses (see relay-core.js).
export const RELAY_HINT = { locationHint: 'wnam' };
const GEMINI = 'https://generativelanguage.googleapis.com/';

export class GeminiRelay extends DurableObject {
  async fetch(request) {
    if (!request.url.startsWith(GEMINI)) return new Response('Not a Gemini request', { status: 400 });
    console.log('Relayed a Gemini call from the US');
    return fetch(request);
  }
}

export const relayStub = (env) => env.GEMINI_RELAY.get(env.GEMINI_RELAY.idFromName('us-west'), RELAY_HINT);
