import test from 'node:test';
import assert from 'node:assert/strict';
import { withRelay } from './src/relay-core.js';

const reply = (status, body = '{}') => new Response(body, { status });
const refused = () => reply(400, JSON.stringify([{ error: { code: 400, message: 'User location is not supported for the API use.', status: 'FAILED_PRECONDITION' } }]));
const quiet = { log: () => {} };

test('a normal answer never touches the relay', async () => {
  let relayed = 0;
  const f = withRelay(async () => reply(200, 'ok'), async () => { relayed++; return reply(200); }, quiet);
  assert.equal(await (await f('u', {})).text(), 'ok');
  assert.equal(relayed, 0);
});

test('other 400s are passed back as they are', async () => {
  let relayed = 0;
  const f = withRelay(async () => reply(400, 'bad image'), async () => { relayed++; return reply(200); }, quiet);
  const r = await f('u', {});
  assert.equal(r.status, 400);
  assert.equal(await r.text(), 'bad image');
  assert.equal(relayed, 0);
});

test('a refused location retries through the relay, then the round keeps using it', async () => {
  let direct = 0, relayed = 0;
  const f = withRelay(async () => { direct++; return refused(); }, async (url, init) => { relayed++; assert.equal(init.body, 'photo'); return reply(200, 'from relay'); }, quiet);
  assert.equal(await (await f('u', { body: 'photo' })).text(), 'from relay');
  assert.equal(await (await f('u', { body: 'photo' })).text(), 'from relay');
  assert.deepEqual([direct, relayed], [1, 2]);
});

test('always sends everything through the relay', async () => {
  let direct = 0;
  const f = withRelay(async () => { direct++; return reply(200); }, async () => reply(200, 'relay'), { ...quiet, always: true });
  assert.equal(await (await f('u', {})).text(), 'relay');
  assert.equal(direct, 0);
});
