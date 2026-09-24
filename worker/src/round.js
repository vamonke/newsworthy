import { DurableObject } from 'cloudflare:workers';
import { createNewsJudge } from '../../orbis-motion-test/news-judge-api.js';
import { withRelay } from './relay-core.js';
import { relayStub } from './relay.js';

const KEEP_MS = 60 * 60 * 1000;

// One instance per round. It is saved after every photo, because an idle object is evicted
// from memory (the stream can take up to 2 minutes to load before the first photo).
export class Round extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Rounds run near the player. If Gemini refuses this location, calls go through the US relay.
    const fetcher = withRelay((url, init) => fetch(url, init), (url, init) => relayStub(env).fetch(url, init), { always: env.GEMINI_RELAY_ALWAYS === '1' });
    this.judge = createNewsJudge(env.GEMINI_API_KEY, fetcher);
    ctx.blockConcurrencyWhile(async () => {
      const meta = await ctx.storage.get('meta');
      if (!meta) return;
      const accepted = [];
      for (let i = 0; i < meta.acceptedCount; i++) accepted.push(await ctx.storage.get(`accepted:${i}`));
      this.id = meta.id;
      this.judge.restore(meta.id, { ...meta.round, accepted });
    });
  }

  async save() {
    const { accepted, ...round } = this.judge.snapshot(this.id);
    const entries = { meta: { id: this.id, acceptedCount: accepted.length, round } };
    // Accepted photos are stored one per key: together they can pass the 2 MB value limit.
    accepted.forEach((photo, i) => { entries[`accepted:${i}`] = photo; });
    await this.ctx.storage.put(entries);
  }

  async start(id) {
    this.id = id;
    this.judge.create(id);
    await this.save();
    await this.ctx.storage.setAlarm(Date.now() + KEEP_MS);
    return { roundId: id };
  }

  async judgePhoto(photo) {
    if (!this.id || photo?.roundId !== this.id) throw new Error('Round expired. Start a new round.');
    const result = await this.judge.judge(photo);
    await this.save();
    return result;
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
