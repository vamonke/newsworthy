// Gemini refuses some Cloudflare locations (Hong Kong among them) with a 400: "User location is not
// supported for the API use." Rounds stay near the player for speed; when Gemini refuses a round's
// location, that call and the rest of the round go through the relay, which runs in the US.
export const refusedLocation = (status, body) => status === 400 && /location is not supported/i.test(body);

// Wraps fetch for the judge. `relay(url, init)` makes the same request from the US.
export function withRelay(direct, relay, { always = false, log = console.log } = {}) {
  let relayed = always;
  return async (url, init) => {
    if (relayed) return relay(url, init);
    const response = await direct(url, init);
    if (response.status !== 400) return response;
    const body = await response.clone().text().catch(() => '');
    if (!refusedLocation(response.status, body)) return response;
    relayed = true;
    log('Gemini refused this round\'s location; using the US relay for the rest of the round');
    return relay(url, init);
  };
}
