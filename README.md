# Calamari Damacy (Discord)

A browser-based **Katamari Damacy**-inspired roller — Discord Activity port of [Calamari Damacy](https://github.com/pfaustino/calamari-damacy).

**Play (browser):** [pfaustino.github.io/calamari-damacy-discord](https://pfaustino.github.io/calamari-damacy-discord/)

**Play (Discord):** launch the Activity from a voice channel after URL mapping is configured (see below).

## Play locally

```bash
npm install
npm --prefix server install
cp .env.example .env   # fill in Discord + leaderboard keys
npm run dev:discord    # Vite + OAuth server
```

Open http://localhost:5174 — click **Start Rolling**, then WASD / arrows to roll.

For in-Discord testing, expose the dev server with [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) and set that URL in the Discord Developer Portal **URL Mappings**.

## Discord setup

1. [Developer Portal](https://discord.com/developers/applications) → your app → **OAuth2** → add redirect `https://127.0.0.1`
2. **Activities** → enable Activity → **URL Mapping** → `/` → your hosted URL (Vercel recommended; see below)
3. **Installation** → enable User Install + Guild Install

### Deploy for Discord (Vercel)

GitHub Pages serves the static game only. Discord OAuth needs `/api/token`, so deploy the full project to Vercel:

```bash
npx vercel
```

Set environment variables in Vercel:

- `VITE_DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `VITE_LEADERBOARD_WRITE_KEY` (optional, for global scores)
- `VITE_BASE_PATH=/`

Point Discord **URL Mapping** `/` at your Vercel URL (e.g. `https://calamari-damacy-discord.vercel.app`).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite only (no OAuth) |
| `npm run dev:discord` | Vite + OAuth server for Activity dev |
| `npm run check` | Smoke + production build |
| `npm run test:e2e` | Playwright smoke |

## Roadmap

- [x] Discord Embedded App SDK + OAuth
- [ ] WebSocket multiplayer (replace PeerJS for Discord sandbox)
- [ ] Touch controls for mobile Discord

## Stack

| Layer | Choice |
|-------|--------|
| Bundler | Vite |
| 3D | Three.js |
| Discord | `@discord/embedded-app-sdk` |
| OAuth | Express (local) / Vercel serverless (prod) |
