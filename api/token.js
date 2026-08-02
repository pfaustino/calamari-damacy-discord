/** Vercel serverless handler for Discord OAuth token exchange. */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const clientId = process.env.VITE_DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.status(500).json({ error: 'Discord OAuth is not configured' });
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
}
