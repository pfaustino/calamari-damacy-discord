/** Proxy GET /api/leaderboard → shared leaderboards service (Discord Activity safe). */
const LEADERBOARD_API = (
  process.env.VITE_LEADERBOARD_API || 'https://leaderboards-opal.vercel.app'
).replace(/\/$/, '');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const game = req.query?.game ?? '';
  const limit = req.query?.limit ?? '50';
  const url = `${LEADERBOARD_API}/api/leaderboard?game=${encodeURIComponent(game)}&limit=${encodeURIComponent(limit)}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch {
    res.status(502).json({ error: 'Could not reach leaderboard server' });
  }
}
