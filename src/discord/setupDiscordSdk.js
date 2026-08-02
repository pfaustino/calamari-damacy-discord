import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import { isDiscordEmbedded } from './discordEnv.js';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID ?? '';

export { isDiscordEmbedded };

/** Remap direct leaderboard API fetches through Discord's /.proxy/ tunnel. */
function patchLeaderboardUrlMappings() {
  const apiBase = (
    import.meta.env.VITE_LEADERBOARD_API || 'https://leaderboards-opal.vercel.app'
  ).replace(/\/$/, '');
  let host;
  try {
    host = new URL(apiBase).host;
  } catch {
    return;
  }
  try {
    patchUrlMappings([{ prefix: '/.proxy/leaderboards', target: host }]);
  } catch (err) {
    console.warn('Leaderboard URL mapping failed:', err);
  }
}

function tokenUrl() {
  return isDiscordEmbedded() ? '/.proxy/api/token' : '/api/token';
}

/**
 * Authenticate with Discord when running inside an Activity iframe.
 * @returns {Promise<{ sdk: DiscordSDK, auth: import('@discord/embedded-app-sdk').Auth } | null>}
 */
export async function setupDiscordSdk() {
  if (!isDiscordEmbedded()) {
    return null;
  }

  const discordSdk = new DiscordSDK(CLIENT_ID);
  await discordSdk.ready();
  patchLeaderboardUrlMappings();

  const { code } = await discordSdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'applications.commands'],
  });

  const response = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error(`Discord token exchange failed (${response.status})`);
  }

  const { access_token: accessToken } = await response.json();
  const auth = await discordSdk.commands.authenticate({ access_token: accessToken });

  if (!auth) {
    throw new Error('Discord authenticate command failed');
  }

  return { sdk: discordSdk, auth };
}

/** @param {{ auth?: { user?: { username?: string, global_name?: string } } } | null} discord */
export function discordDisplayName(discord) {
  const user = discord?.auth?.user;
  if (!user) return '';
  return (user.global_name || user.username || '').trim();
}
