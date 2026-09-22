import { defineConfig, loadEnv } from 'vite';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNewsJudge } from './news-judge-api.js';
import { MODEL } from './prompts.js';

const root = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(root, '..');
const send = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
async function body(req, limit = 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('Request too large'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
export default defineConfig(({ mode }) => {
  const apiKey = loadEnv(mode, workspace, '').REACTOR_API_KEY;
  // Only sessions registered with the short-lived JWT issued by this test.
  const newsJudge = createNewsJudge(loadEnv(mode, workspace, '').FAL_KEY);
  const sessions = new Map();
  const issued = new Set();
  async function cleanup(id, jwt) {
    const response = await fetch(`https://api.reactor.inc/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${jwt}` }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok && response.status !== 404) throw new Error(`Session cleanup failed (${response.status})`);
    const owned = sessions.get(id); if (owned) clearTimeout(owned.timer);
    sessions.delete(id);
  }
  return {
    root, build: { rollupOptions: { input: { news: resolve(root, 'news-design.html') } } }, server: { host: '127.0.0.1', port: 4318, strictPort: true },
    plugins: [{
      name: 'orbis-test-api', configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url.split('?')[0].endsWith('/reactor_wasm_bg.wasm')) return next();
          res.setHeader('Content-Type', 'application/wasm');
          createReadStream(resolve(workspace, 'node_modules/@reactor-team/js-sdk/dist/wasm/reactor_wasm_bg.wasm')).pipe(res);
        });
        server.middlewares.use('/api', async (req, res, next) => {
          try {
            const path = req.url.split('?')[0];
            if (path === '/status') return send(res, 200, { configured: Boolean(apiKey), model: MODEL, activeSessions: sessions.size });
            if (req.method !== 'POST') return next();
            // Local dev API: reject cross-origin writes.
            if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'Invalid origin' });
            if (path === '/news-round') return send(res, 200, newsJudge.create());
            if (path === '/news-photo') return send(res, 200, await newsJudge.judge(JSON.parse(await body(req, 1900000))));
            if (path === '/stop-sessions') { await Promise.all([...sessions].map(([id, s]) => cleanup(id, s.jwt))); return send(res,200,{stopped:true}); }
            if (path === '/token') {
              if (!apiKey) return send(res, 503, { error: 'REACTOR_API_KEY is missing in the workspace .env.local.' });
              if (sessions.size) return send(res, 409, { error: 'Another live session is still open. Stop it before starting another.' });
              const reply = await fetch('https://api.reactor.inc/tokens', {
                method: 'POST', headers: { 'Reactor-API-Key': apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ authorization_details: [{ type: 'session', resources: { models: { match: [MODEL] } }, constraints: { max_sessions: 1, max_session_duration_seconds: 900 } }] }),
                signal: AbortSignal.timeout(20000),
              });
              const value = await reply.json();
              if (!reply.ok || !value.jwt) return send(res, reply.status || 502, { error: `Reactor token request failed (${reply.status})` });
              issued.add(value.jwt);
              setTimeout(() => issued.delete(value.jwt), 20 * 60 * 1000).unref();
              return send(res, 200, { jwt: value.jwt });
            }
            if (path === '/session' || path === '/cleanup') {
              const { sessionId, jwt } = JSON.parse(await body(req, 20000));
              if (typeof sessionId !== 'string' || sessionId.length > 200 || !issued.has(jwt)) return send(res, 400, { error: 'Unknown test session' });
              if (path === '/cleanup') { await cleanup(sessionId, jwt); return send(res, 200, { stopped: true }); }
              if (!sessions.has(sessionId)) {
                const timer = setTimeout(() => cleanup(sessionId, jwt).catch(() => {}), 14 * 60 * 1000); timer.unref();
                sessions.set(sessionId, { jwt, timer });
              }
              return send(res, 200, { registered: true });
            }
            if (path === '/save' || path.startsWith('/recording/')) {
              let id, data, ext;
              if (path === '/save') {
                const log = JSON.parse(await body(req, 2 * 1024 * 1024)); id = log.id;
                // Only explicitly structured client telemetry. Tokens are never included.
                data = JSON.stringify({ id, model: log.model, reference: log.reference, created: log.created, events: log.events, prompts: log.prompts, note: log.note }, null, 2); ext = 'json';
              } else { id = path.slice('/recording/'.length); data = await body(req, 150 * 1024 * 1024); ext = 'webm'; }
              if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) return send(res, 400, { error: 'Invalid run id' });
              await mkdir(resolve(root, 'runs'), { recursive: true });
              await writeFile(resolve(root, 'runs', `${id}.${ext}`), data);
              return send(res, 200, { saved: `runs/${id}.${ext}` });
            }
            next();
          } catch (error) { send(res, 502, { error: error.message }); }
        });
        server.httpServer?.on('close', () => { for (const [id, { jwt }] of sessions) void cleanup(id, jwt).catch(() => {}); });
      },
    }],
  };
});
