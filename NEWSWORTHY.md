# Newsworthy

A live-video news photography game: create incidents, frame photos, and sell them to an AI news editor. Two minutes, ten photos.

## Run locally

Requires Node.js 20.19+ (or 22.12+) and npm.

```sh
npm ci
cp .env.example .env.local
# Set REACTOR_API_KEY and GEMINI_API_KEY in .env.local.
npm run dev:newsworthy
```

Open http://127.0.0.1:4320/news-design.html. Live play uses Reactor for the video stream and Gemini for photo scoring. Keys stay on the local development server, which allows one live session at a time.

## Production

The game is live at https://newsworthy.vamonke.com, served by a Cloudflare Worker in `worker/` with live slots, a waiting line and a Turnstile bot check. See [DEPLOYMENT.md](DEPLOYMENT.md) for the architecture, deploy steps, secrets, limits and how to take it down.

```sh
npm run test:newsworthy
npm run build:newsworthy
```

## Design previews

The playable game uses the approved 2000s broadcast design in `news-broadcast.css`. Its standalone preview is in `orbis-motion-test/news-broadcast-revised-preview.html`; the 1990s, 2000s, and 2010s alternatives are retained as separate HTML files.

To view the standalone art studies with their existing relative image paths:

```sh
python3 -m http.server 4188 --bind 127.0.0.1 --directory orbis-motion-test
```

Open http://127.0.0.1:4188/news-broadcast-revised-preview.html.

## Repository scope

This repository tracks Newsworthy in its existing `orbis-motion-test` directory. Other experiments in the original workspace, dependencies, build outputs, credentials, logs, and session recordings are excluded. Use the `:newsworthy` npm commands; legacy root commands belong to the original workspace.

Create focused commits as changes are made. Git history begins with the current game and all retained design previews; earlier uncommitted work cannot be reconstructed from Git.

## Credits and release status

Inspired by Nicky Case’s “We Become What We Behold”: https://ncase.itch.io/wbwwb

Sound credits and their source/license links are preserved in the game and audio asset folder. Live video uses Reactor / Visko Orbis. Photo judging uses Google’s Gemini API.

The repository is public. No project-wide open-source license has been selected yet.
