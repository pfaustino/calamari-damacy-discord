# Calamari Damacy

**Roll up the ocean floor. Grow your sticky squid-ball. Hang new stars for the King of the Cosmos.**

A browser-based **Katamari Damacy**–inspired roller built for **Discord Activities** — play in voice, in DMs, or in any browser. This repo is the Discord Activity port of [Calamari Damacy](https://github.com/pfaustino/calamari-damacy).

| | |
|---|---|
| **Play in Discord** | Launch the Activity from a voice channel (after [setup](#discord-activity-setup)) |
| **Play in browser** | [pfaustino.github.io/calamari-damacy-discord](https://pfaustino.github.io/calamari-damacy-discord/) |
| **Production host** | [calamari-damacy.vercel.app](https://calamari-damacy.vercel.app) |

---

## Why you'll love it

- **Instant sticky satisfaction** — scoop junk, grow your calamari, and present completed stars to a very dramatic King.
- **Built for Discord** — OAuth, embedded SDK, and CSP-safe leaderboard proxy so it actually works inside the Activity iframe.
- **Phone-friendly** — landscape play with **tilt** (marble-tray style) or a **thumb pad** on the bottom left. Pick your vibe in the pause menu.
- **Six ocean stages** — tide pools to boardwalk carnivals, each with size goals, collect missions, and royal commentary.
- **Global leaderboard** — chase the biggest clears worldwide (when configured).
- **Multiplayer races** — host a room, bump rivals, steal sticky volume. *(PeerJS today; WebSocket lobby planned.)*

*Not affiliated with Bandai Namco or Katamari Damacy.*

---

## Controls

### Desktop

| Input | Action |
|-------|--------|
| **Click / hold** | Roll toward the cursor |
| **WASD / arrows** | Move relative to the camera |
| **Scroll** | Zoom |
| **Esc** | Pause |

### Mobile (Discord & browser)

1. **Rotate to landscape** when prompted.
2. Choose **Tilt** or **Thumb pad** (after rotate, or anytime via **☰ → Controls**).
3. **Tilt** — lay the phone flat like a marble tray and lean to roll.
4. **Thumb pad** — virtual stick, bottom-left.
5. **☰** — pause (positioned below Discord's exit button).

Mobile roll speed is tuned separately from desktop so tilt and thumb pad feel controllable, not chaotic.

---

## Discord Activity setup

### 1. Developer Portal

[Discord Developer Portal](https://discord.com/developers/applications) → your app:

1. **OAuth2** → add redirect `https://127.0.0.1`
2. **Activities** → enable Activity → **Supported Platforms** → check **Android** and **iOS** for mobile
3. **URL Mapping** → `/` → `https://calamari-damacy.vercel.app` (or your Vercel URL)
4. **Installation** → enable User Install + Guild Install

> Unverified apps can only run in servers with fewer than 25 members or in DMs.

### 2. Deploy (Vercel)

GitHub Pages serves the static game only. Discord OAuth needs `/api/token`, so deploy the **full project** to Vercel:

```bash
npx vercel
```

**Environment variables:**

| Variable | Purpose |
|----------|---------|
| `VITE_DISCORD_CLIENT_ID` | Discord app client ID |
| `DISCORD_CLIENT_SECRET` | OAuth token exchange |
| `VITE_BASE_PATH` | `/` |
| `VITE_LEADERBOARD_WRITE_KEY` | Optional — submit global scores |

Point **URL Mapping** `/` at your production URL.

### 3. Leaderboard in the iframe

Global scores use a same-origin proxy (`/.proxy/api/leaderboard`) so Discord's CSP doesn't block external fetches. No extra URL mapping required for the default setup.

Optional fallback mapping if you bypass the proxy:

| Prefix | Target |
|--------|--------|
| `/leaderboards` | `https://leaderboards-opal.vercel.app` |

---

## Play locally

```bash
npm install
npm --prefix server install
cp .env.example .env   # Discord + leaderboard keys
npm run dev:discord    # Vite :5174 + OAuth server
```

Open http://localhost:5174

For in-Discord dev, tunnel with [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) and set that URL in **URL Mappings**.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite only (no OAuth) |
| `npm run dev:discord` | Vite + OAuth server for Activity dev |
| `npm run check` | Smoke + production build |
| `npm run test:e2e` | Playwright smoke |

---

## Stack

| Layer | Choice |
|-------|--------|
| Bundler | Vite |
| 3D | Three.js |
| Discord | `@discord/embedded-app-sdk` |
| OAuth | Express (local) / Vercel serverless (prod) |
| Multiplayer | PeerJS (WebSocket migration planned) |

---

## Roadmap

- [x] Discord Embedded App SDK + OAuth
- [x] Mobile landscape + tilt controls (table-flat marble tray)
- [x] Thumb pad + controller mode picker (pause menu & post-rotate)
- [x] Mobile HUD pause button
- [x] Global leaderboard via same-origin Discord proxy
- [x] Mobile push tuning (`mobilePushScale` in `data/game.json`)
- [ ] WebSocket multiplayer (replace PeerJS for Discord sandbox)
- [ ] Discord instance-based lobby (drop room codes)
- [ ] Self-hosted fonts (Google Fonts CSP in Discord)
- [ ] App verification for large servers

---

## Credits

**Calamari Damacy** — Patrick Faustino & AI collaborators.

Engine: Three.js · Bundler: Vite · Music: [Pixabay](https://pixabay.com/) (vintage tracks).

Forked from [calamari-damacy](https://github.com/pfaustino/calamari-damacy). Not affiliated with Bandai Namco.
