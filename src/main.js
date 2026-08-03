import { armDiscordProbe, dismissHtmlSmokeTest } from './discord/discordBootProbe.js';
import { setupDiscordSdk, isDiscordEmbedded } from './discord/setupDiscordSdk.js';
import { Game } from './game/Game.js';
import '../css/style.css';

armDiscordProbe();

const DISCORD_SETUP_MS = 12_000;

function hideBootSplash() {
  const el = document.getElementById('boot-splash');
  if (el) el.style.display = 'none';
}

function showBootError(message) {
  if (typeof window.__showBootError === 'function') {
    window.__showBootError(message);
    return;
  }
  hideBootSplash();
  const el = document.getElementById('boot-error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'flex';
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
  window.__discordProbeLog?.('main boot');

  const game = new Game({ discord: null });

  try {
    game.init();
    hideBootSplash();
    dismissHtmlSmokeTest();
    window.__calamariBooted = true;
    window.__discordProbeLog?.('game init ok');
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
