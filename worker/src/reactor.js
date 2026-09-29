import { MODEL } from '../../orbis-motion-test/prompts.js';

export async function mintToken(apiKey, seconds) {
  if (!apiKey) throw new Error('REACTOR_API_KEY is not set on the Worker.');
  const reply = await fetch('https://api.reactor.inc/tokens', {
    method: 'POST', headers: { 'Reactor-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorization_details: [{ type: 'session', resources: { models: { match: [MODEL] } }, constraints: { max_sessions: 1, max_session_duration_seconds: seconds } }] }),
    signal: AbortSignal.timeout(20000),
  });
  const value = await reply.json().catch(() => ({}));
  if (!reply.ok || !value.jwt) throw new Error(`Reactor token request failed (${reply.status})`);
  return value.jwt;
}

export async function endSession(id, jwt) {
  const response = await fetch(`https://api.reactor.inc/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${jwt}` }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok && response.status !== 404) throw new Error(`Session cleanup failed (${response.status})`);
}

// The balance and recent sessions, from the account API the Reactor dashboard uses. It isn't
// documented, so it may change; see ANALYTICS.md, "Reactor credits".
export async function reactorAccount(apiKey) {
  if (!apiKey) throw new Error('REACTOR_API_KEY is not set on the Worker.');
  const get = async (path, name) => {
    const reply = await fetch(`https://api.reactor.inc${path}`, { headers: { 'Reactor-API-Key': apiKey }, signal: AbortSignal.timeout(15000) });
    if (!reply.ok) throw new Error(`Reactor ${name} returned ${reply.status}`);
    return reply.json();
  };
  const { account_id: account } = await get('/me', '/me');
  const [credits, recent] = await Promise.all([
    get(`/accounts/${account}/credits`, '/accounts/<id>/credits'),
    get(`/accounts/${account}/sessions?limit=20`, '/accounts/<id>/sessions'),
  ]);
  return { balance: Number(credits.balance_usd), sessions: recent.sessions || [] };
}

export { MODEL };
