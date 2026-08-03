import '../css/style.css';

const DISCORD_SETUP_MS = 12_000;

function hideBootSplash() {
  document.getElementById('boot-splash')?.classList.add('hidden');
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
  let isDiscordEmbedded = () => /discordsays\.com$/i.test(window.location.hostname);

  try {
    const discordMod = await import('./discord/setupDiscordSdk.js');
    isDiscordEmbedded = discordMod.isDiscordEmbedded;
    if (isDiscordEmbedded()) {
      document.documentElement.classList.add('discord-embedded');
    }

    const { Game } = await import('./game/Game.js');
    const game = new Game({ discord: null });

    try {
      game.init();
      hideBootSplash();
      window.__calamariBooted = true;
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

    withTimeout(discordMod.setupDiscordSdk(), DISCORD_SETUP_MS)
      .then((discord) => {
        if (discord) game.applyDiscord(discord);
      })
      .catch((err) => {
        console.warn('Discord SDK setup skipped or failed:', err);
      });
  } catch (err) {
    console.error('Failed to load game modules', err);
    showBootError('Could not load game files. Force-quit Discord and reopen the Activity.');
  }
}

boot();
