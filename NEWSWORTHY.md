# Newsworthy

A live-video news photography game: create incidents, frame photos, and sell them to an AI news editor. Two minutes, ten photos.

Play it at https://newsworthy.vamonke.com.

## Run locally

Requires Node.js 20.19+ (or 22.12+) and npm.

```sh
npm ci
cp .env.example .env.local
# Set REACTOR_API_KEY and GEMINI_API_KEY in .env.local.
npm run dev:newsworthy
```

Open http://127.0.0.1:4318/news-design.html. Live play uses Reactor for the video stream and Gemini for photo scoring. Keys stay on the local development server, which allows one live session at a time.

```sh
npm run test:newsworthy
npm run build:newsworthy
```

## Production

The game is served by a Cloudflare Worker in `worker/` with live slots, a waiting line and a Turnstile bot check. See [DEPLOYMENT.md](DEPLOYMENT.md) for the architecture, deploy steps, secrets and limits.

## Layout

- `orbis-motion-test/` — the game: `news-design.html` is the page, `newsworthy*.js` the client, `news-judge-api.js` and `prompts.js` the photo judge and stream prompts, `public/` the images and audio.
- `worker/` — the production Cloudflare Worker.

## Credits

Inspired by Nicky Case’s “We Become What We Behold”: https://ncase.itch.io/wbwwb

Sound credits and their source/license links are preserved in the game and audio asset folder. Live video uses Reactor / Visko Orbis. Photo judging uses Google’s Gemini API.

No project-wide open-source license has been selected yet.
