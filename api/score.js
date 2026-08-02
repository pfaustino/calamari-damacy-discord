/** Proxy POST /api/score → shared leaderboards service (Discord Activity safe). */
const LEADERBOARD_API = (
  process.env.VITE_LEADERBOARD_API || 'https://leaderboards-opal.vercel.app'
).replace(/\/$/, '');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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
}
