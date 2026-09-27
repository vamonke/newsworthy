import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameRate} from './newsworthy-fps.js';

const feed=(meter,list)=>list.map(f=>meter.second(f));

test('smooth video never turns slow', () => {
  const m=new FrameRate();
  assert.ok(feed(m,Array(30).fill(18)).every(c=>!c));
  assert.equal(m.slow,false);
  assert.deepEqual(m.summary(),{fps:18,slowShare:0,startFps:18,seconds:30});
});

test('slow needs 5 seconds in a row under 5 fps', () => {
  const m=new FrameRate();
  feed(m,[2,2,2,2,9,2,2,2,2]);
  assert.equal(m.slow,false);
  assert.equal(m.second(3),true);
  assert.equal(m.slow,true);
});

test('smooth again needs 5 seconds in a row at 8 fps or more', () => {
  const m=new FrameRate();
  feed(m,[2,2,2,2,2]);
  feed(m,[9,9,9,6,9,9,9,9]);
  assert.equal(m.slow,true);
  assert.equal(m.second(12),true);
  assert.equal(m.slow,false);
});

test('summary splits the first 15 seconds from the whole round', () => {
  const m=new FrameRate();
  feed(m,[...Array(15).fill(2),...Array(15).fill(18)]);
  assert.deepEqual(m.summary(),{fps:10,slowShare:50,startFps:2,seconds:30});
  assert.deepEqual(new FrameRate().summary(),{fps:0,slowShare:0,startFps:0,seconds:0});
});
