const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID ?? '';

/** @type {import('@discord/embedded-app-sdk').DiscordSDK | null} */
let sdk = null;

export function isDiscordHost() {
  return /discordsays\.com$/i.test(window.location.hostname);
}

/** @returns {import('@discord/embedded-app-sdk').DiscordSDK | null} */
export function getDiscordSdk() {
  return sdk;
}

/** Discord keeps the Activity black until ready() — load SDK lazily so entry stays tiny. */
export async function ensureDiscordReady() {
  if (sdk) return sdk;
  if (!isDiscordHost() || !CLIENT_ID) return null;

  const { DiscordSDK } = await import('@discord/embedded-app-sdk');
  sdk = new DiscordSDK(CLIENT_ID);
  await sdk.ready();
  try {
    await sdk.commands.encourageHardwareAcceleration();
  } catch {
    /* optional on some clients */
  }
  return sdk;
}
