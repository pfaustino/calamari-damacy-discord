import { isDiscordEmbedded } from '../discord/discordEnv.js';

/**
 * WebSocket URL for multiplayer relay.
 * - Dev: Vite proxies /mp → local server
 * - Discord: /.proxy/mp (patchUrlMappings → VITE_MP_WS_URL host)
 * - Production browser: VITE_MP_WS_URL when set
 */
export function getMpWebSocketUrl() {
  if (isDiscordEmbedded()) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/.proxy/mp`;
  }

  const configured = import.meta.env.VITE_MP_WS_URL;
  if (configured) {
    return String(configured).replace(/\/$/, '');
  }

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/mp`;
}

/** Hostname for Discord patchUrlMappings (from VITE_MP_WS_URL). */
export function getMpRelayHost() {
  const configured = import.meta.env.VITE_MP_WS_URL;
  if (!configured) return null;
  try {
    return new URL(configured).host;
  } catch {
    return null;
  }
}
