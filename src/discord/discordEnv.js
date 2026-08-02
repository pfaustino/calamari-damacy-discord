const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID ?? '';

/** @returns {boolean} True when running inside a Discord Activity iframe. */
export function isDiscordEmbedded() {
  return Boolean(CLIENT_ID) && /discordsays\.com$/i.test(window.location.hostname);
}
