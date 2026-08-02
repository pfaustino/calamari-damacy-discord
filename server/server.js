import express from 'express';
import dotenv from 'dotenv';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachMpRelay } from './mpRelay.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const LEADERBOARD_API = (
  process.env.VITE_LEADERBOARD_API || 'https://leaderboards-opal.vercel.app'
).replace(/\/$/, '');

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, mp: true });
});

app.post('/api/token', async (req, res) => {
  const clientId = process.env.VITE_DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.status(500).json({ error: 'Discord OAuth is not configured on the server' });
    return;
  }

  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code: req.body?.code ?? '',
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    res.status(response.status).json(data);
    return;
  }

  res.json({ access_token: data.access_token });
});

app.get('/api/leaderboard', async (req, res) => {
  const game = req.query.game ?? '';
  const limit = req.query.limit ?? '50';
  const url = `${LEADERBOARD_API}/api/leaderboard?game=${encodeURIComponent(game)}&limit=${encodeURIComponent(limit)}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch {
    res.status(502).json({ error: 'Could not reach leaderboard server' });
  }
});

app.post('/api/score', async (req, res) => {
  const writeKey = process.env.VITE_LEADERBOARD_WRITE_KEY;
  if (!writeKey) {
    res.status(500).json({ error: 'Leaderboard write key not configured' });
    return;
  }
  try {
    const response = await fetch(`${LEADERBOARD_API}/api/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Game-Key': writeKey,
      },
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch {
    res.status(502).json({ error: 'Could not reach leaderboard server' });
  }
});

const server = http.createServer(app);
attachMpRelay(server, '/mp');

server.listen(port, () => {
  console.log(`Dev server listening at http://localhost:${port} (HTTP + WS /mp)`);
});
