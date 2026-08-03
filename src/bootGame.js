import '../css/style.css';
import { setupDiscordSdk, isDiscordEmbedded } from './discord/setupDiscordSdk.js';
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

function boot() {
  const game = new Game({ discord: null });

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

  withTimeout(setupDiscordSdk(), DISCORD_SETUP_MS)
    .then((discord) => {
      if (discord) game.applyDiscord(discord);
    })
    .catch((err) => {
      console.warn('Discord SDK setup skipped or failed:', err);
    });
}

boot();
