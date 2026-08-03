import { setupDiscordSdk } from './discord/setupDiscordSdk.js';
import { Game } from './game/Game.js';

async function boot() {
  let discord = null;
  try {
    discord = await setupDiscordSdk();
  } catch (err) {
    console.warn('Discord SDK setup skipped or failed:', err);
  }

  const game = new Game({ discord });

  try {
    game.init();
  } catch (err) {
    console.error('Failed to start Calamari Damacy', err);
    const el = document.getElementById('boot-error');
    if (el) {
      el.textContent = 'Could not start the game. Try refreshing the Activity.';
      el.classList.remove('hidden');
    }
    return;
  }

  window.__game = game;
}

boot();
