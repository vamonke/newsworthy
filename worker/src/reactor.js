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

export { MODEL };
