import { DurableObject } from 'cloudflare:workers';
import { createNewsJudge } from '../../orbis-motion-test/news-judge-api.js';
import { withRelay } from './relay-core.js';
import { relayStub } from './relay.js';

const KEEP_MS = 60 * 60 * 1000;

// Pulls the bytes out of a JPEG data URL, for R2.
const jpeg = (dataUrl) => Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0));

// One instance per round. It is saved after every photo, because an idle object is evicted
// from memory (the stream can take up to 2 minutes to load before the first photo).
export class Round extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Rounds run near the player. If Gemini refuses this location, calls go through the US relay.
    const fetcher = withRelay((url, init) => fetch(url, init), (url, init) => relayStub(env).fetch(url, init), { always: env.GEMINI_RELAY_ALWAYS === '1' });
    this.judge = createNewsJudge(env.GEMINI_API_KEY, fetcher);
    this.written = []; // the accepted photos as last saved, to write only new or replaced ones
    ctx.blockConcurrencyWhile(async () => {
      const meta = await ctx.storage.get('meta');
      if (!meta) return;
      const accepted = [];
      for (let i = 0; i < meta.acceptedCount; i++) accepted.push(await ctx.storage.get(`accepted:${i}`));
      this.id = meta.id;
      this.written = [...accepted];
      this.judge.restore(meta.id, { ...meta.round, accepted });
    });
  }

  async save() {
    const { accepted, ...round } = this.judge.snapshot(this.id);
    const entries = { meta: { id: this.id, acceptedCount: accepted.length, round } };
    // Accepted photos are stored one per key: together they can pass the 2 MB value limit. Only new
    // photos, or one replaced by a later shot of the same incident, are written again.
    accepted.forEach((photo, i) => { if (this.written[i] !== photo) entries[`accepted:${i}`] = photo; });
    await this.ctx.storage.put(entries);
    this.written = [...accepted];
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
    // Every judged photo is kept in R2 with its result. A failed write never costs the player the photo.
    const key = `rounds/${this.id}/${photo.photoId}`;
    this.ctx.waitUntil(Promise.all([
      this.env.PHOTOS?.put(`${key}.jpg`, jpeg(photo.image), { httpMetadata: { contentType: 'image/jpeg' } }),
      this.env.PHOTOS?.put(`${key}.json`, JSON.stringify({ roundId: this.id, photoId: photo.photoId, custom: Boolean(photo.custom), at: Date.now(), result })),
    ]).catch((error) => console.error('[photos] save failed:', error?.message)));
    return result;
  }

  // Copies the round as saved here (results, and thumbnails of the accepted photos) to R2.
  // Covers rounds from before photos were saved one by one.
  async archive() {
    const snapshot = this.id && this.judge.snapshot(this.id);
    if (!snapshot || !this.env.PHOTOS) return { saved: 0 };
    const { accepted, ...round } = snapshot;
    await this.env.PHOTOS.put(`rounds/${this.id}/round.json`, JSON.stringify({ roundId: this.id, ...round, accepted: accepted.map(({ image, ...rest }) => rest) }));
    await Promise.all(accepted.map((p, i) => this.env.PHOTOS.put(`rounds/${this.id}/accepted-${i}.jpg`, jpeg(p.image), { httpMetadata: { contentType: 'image/jpeg' } })));
    return { saved: accepted.length };
  }

  // Rounds are no longer deleted: the round is copied to R2 an hour after it starts and kept.
  async alarm() {
    await this.archive();
  }
}
