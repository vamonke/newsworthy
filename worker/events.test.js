import test from 'node:test';
import assert from 'node:assert/strict';
import { toDataPoint, playerId, SERVER_EVENT_TYPES } from './src/events.js';

test('an event fills the fixed columns', () => {
  const point = toDataPoint({ type: 'command_ack', session: 's-1', run: 'newsworthy-1', label: 'set_prompt', detail: 'x', value: 120 }, 'p1');
  assert.deepEqual(point, { indexes: ['newsworthy-1'], blobs: ['command_ack', 'set_prompt', 'x', 'p1', 's-1', 'newsworthy-1', ''], doubles: [120, 0, 0] });
});

test('outside a round the session is the index', () => {
  const point = toDataPoint({ type: 'link_clicked', session: 's-1', label: 'reactor' }, '');
  assert.deepEqual(point.indexes, ['s-1']);
  assert.deepEqual(point.blobs, ['link_clicked', 'reactor', '', '', 's-1', '', '']);
  assert.deepEqual(point.doubles, [0, 0, 0]);
});

test('unknown types, bad ids and bad fields are refused or cleaned', () => {
  assert.equal(toDataPoint({ type: 'anything', session: 's' }, ''), null);
  assert.equal(toDataPoint({ type: 'closed' }, ''), null);
  assert.equal(toDataPoint({ type: 'closed', session: 'a b' }, ''), null);
  const point = toDataPoint({ type: 'closed', session: 's', run: '../x', label: 5, detail: 'd'.repeat(300), value: 'NaN' }, '');
  assert.equal(point.blobs[1], '');
  assert.equal(point.blobs[2].length, 200);
  assert.equal(point.blobs[5], '');
  assert.deepEqual(point.doubles, [0, 0, 0]);
});

test('player ids are stable per salt and absent without one', async () => {
  const a = await playerId('salt', '1.2.3.4');
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(await playerId('salt', '1.2.3.4'), a);
  assert.notEqual(await playerId('other', '1.2.3.4'), a);
  assert.notEqual(await playerId('salt', '1.2.3.5'), a);
  assert.equal(await playerId('', '1.2.3.4'), '');
});

test('demand events are only accepted from the Worker', () => {
  assert.equal(toDataPoint({ type: 'turned_away', session: 's', label: 'full' }, ''), null);
  assert.deepEqual(toDataPoint({ type: 'turned_away', session: 's', label: 'full' }, 'p', SERVER_EVENT_TYPES, 'SG').blobs, ['turned_away', 'full', '', 'p', 's', '', 'SG']);
  assert.equal(toDataPoint({ type: 'closed', session: 's' }, '', SERVER_EVENT_TYPES), null);
});

test('stream frame rate fills the extra number columns, and the country is kept only when valid', () => {
  const point = toDataPoint({ type: 'stream_fps', session: 's', run: 'r-1', label: 'ended', value: 11.4, value2: 35, value3: 2.5 }, 'p', undefined, 'SG');
  assert.deepEqual(point.doubles, [11.4, 35, 2.5]);
  assert.equal(point.blobs[6], 'SG');
  assert.equal(toDataPoint({ type: 'slow_video', session: 's' }, '', undefined, 'Singapore').blobs[6], '');
  assert.equal(toDataPoint({ type: 'slow_video', session: 's' }, '').blobs[6], '');
});
