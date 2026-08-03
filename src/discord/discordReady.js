import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID ?? '';

/** @type {DiscordSDK | null} */
let sdk = null;

export function isDiscordHost() {
  return /discordsays\.com$/i.test(window.location.hostname);
}

/** @returns {DiscordSDK | null} */
export function getDiscordSdk() {
  return sdk;
}

/** Discord keeps the Activity black until ready() — call this before loading the game. */
export async function ensureDiscordReady() {
  if (sdk) return sdk;
  if (!isDiscordHost() || !CLIENT_ID) return null;
  sdk = new DiscordSDK(CLIENT_ID);
  await sdk.ready();
  return sdk;
}

export function bootDiscordHandshake() {
  return ensureDiscordReady();
}
