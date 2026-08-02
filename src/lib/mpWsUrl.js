import { patchUrlMappings } from '@discord/embedded-app-sdk';
import { isDiscordEmbedded } from '../discord/discordEnv.js';

let mpMappingsPatched = false;

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

/** Patch Discord proxy for multiplayer — only when opening a WS connection. */
export function ensureMpUrlMappings() {
  if (!isDiscordEmbedded() || mpMappingsPatched) return;
  const host = getMpRelayHost();
  if (!host) return;
  try {
    patchUrlMappings([{ prefix: '/.proxy/mp', target: host }]);
    mpMappingsPatched = true;
  } catch (err) {
    console.warn('Multiplayer URL mapping failed:', err);
  }
}
