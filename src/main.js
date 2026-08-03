import { bootDiscordHandshake } from './discord/discordReady.js';

bootDiscordHandshake()
  .then(() => import('./bootGame.js'))
  .catch((err) => {
    console.error('Failed to boot Calamari Damacy', err);
    const el = document.getElementById('boot-error');
    if (!el) return;
    el.textContent = 'Could not start the game. Force-quit Discord and reopen the Activity.';
    el.classList.remove('hidden');
  });
