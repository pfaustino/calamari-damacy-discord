import '../css/style.css';
import { setupDiscordSdk } from './discord/setupDiscordSdk.js';
import { isDiscordEmbedded } from './discord/discordEnv.js';
import { Game } from './game/Game.js';

const DISCORD_SETUP_MS = 12_000;

function showBootError(message) {
  const el = document.getElementById('boot-error');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

/**
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Discord SDK timeout')), ms);
    }),
  ]);
}

async function boot() {
  let discord = null;
  try {
    discord = await withTimeout(setupDiscordSdk(), DISCORD_SETUP_MS);
  } catch (err) {
    console.warn('Discord SDK setup skipped or failed:', err);
  }

  const game = new Game({ discord });
  try {
    game.init();
    if (isDiscordEmbedded()) {
      requestAnimationFrame(() => {
        game.onResize();
        setTimeout(() => game.onResize(), 400);
      });
    }
  } catch (err) {
    console.error('Failed to start Calamari Damacy', err);
    showBootError('Could not start the game. Try refreshing the Activity.');
    return;
  }

  window.__game = game;
}

boot();
