import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(express.json());

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

app.listen(port, () => {
  console.log(`OAuth server listening at http://localhost:${port}`);
});
