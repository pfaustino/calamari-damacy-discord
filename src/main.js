import { Game } from './game/Game.js';

const game = new Game();
try {
  game.init();
} catch (err) {
  console.error('Failed to start Calamari Damacy', err);
}

// Expose for Playwright / console debugging
window.__game = game;
