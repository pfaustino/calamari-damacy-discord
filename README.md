# Calamari Damacy (Discord)

A browser-based **Katamari Damacy**-inspired roller — this repo is the home for the [Discord Activity](https://docs.discord.com/developers/activities/overview) port of [Calamari Damacy](https://github.com/pfaustino/calamari-damacy).

**Play:** [pfaustino.github.io/calamari-damacy-discord](https://pfaustino.github.io/calamari-damacy-discord/)

## Play locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 — click **Start Rolling**, then WASD / arrows to roll.

## Core loop

1. Pick a mission from **The Cosmos** (or Start Rolling)  
2. Roll into anything **smaller than you** — it sticks and melts into volume  
3. Hit the size goal before time runs out  
4. **Present to the King** → your calamari becomes a star  
5. Unlock the next stage  

On failure: **Try Again** (same mission).

## Stack

| Layer | Choice |
|-------|--------|
| Bundler | Vite |
| 3D | Three.js |
| Balance | `data/*.json` |
| Quality | smoke-check + Playwright |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local play |
| `npm run check` | Smoke + production build |
| `npm run test:e2e` | Playwright smoke |
| `npm run test:e2e:headed` | Visible e2e |

Dev cheats: open with `?dev=1` (also auto-on in Vite DEV).

## Roadmap

- [ ] Discord Embedded App SDK + OAuth server
- [ ] WebSocket multiplayer (replace PeerJS for Discord sandbox)
- [ ] Touch controls for mobile Discord

## Multiplayer (current)

Title → **Multiplayer**: host a room (share the code) or join. Race to the size goal; bump rivals to steal volume. Host simulates; guests send input (PeerJS). Works in a normal browser; PeerJS will be replaced for the Discord Activity build.
