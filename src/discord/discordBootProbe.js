/** Discord Activity boot probe — must live in the Vite entry bundle (/assets/*.js). */

const PROBE_VERSION = 'v4';

/** @type {string[]} */
const LOG = [`probe ${PROBE_VERSION}`];
const MAX_LOG = 10;

/** @type {AudioContext | null} */
let audioCtx = null;
/** @type {ReturnType<typeof setInterval> | null} */
let beepTimer = null;

function isDiscordHost() {
  return /discordsays\.com$/i.test(window.location.hostname);
}

function log(msg) {
  LOG.push(msg);
  if (LOG.length > MAX_LOG) LOG.shift();
  const el = document.getElementById('discord-probe');
  if (el) el.textContent = LOG.join('\n');
}

function showBootError(msg) {
  const splash = document.getElementById('boot-splash');
  const err = document.getElementById('boot-error');
  const smoke = document.getElementById('html-smoke-test');
  if (splash) splash.style.display = 'none';
  if (smoke) smoke.style.display = 'none';
  if (err) {
    err.textContent = msg;
    err.style.display = 'flex';
  }
  log(`ERR ${msg}`);
}

function applyLayout() {
  document.body?.setAttribute(
    'style',
    'margin:0;min-height:100dvh;background:#0a3d5c;color:#f0f7fa;font-family:system-ui,sans-serif;overflow:hidden;',
  );
  const title = document.getElementById('title-screen');
  if (title) {
    title.setAttribute(
      'style',
      'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:1.5rem;box-sizing:border-box;background:linear-gradient(165deg,#0a4a6e 0%,#062838 45%,#0d2137 100%);color:#f0f7fa;text-align:center;font-family:system-ui,sans-serif;overflow:auto;',
    );
  }
  const canvas = document.getElementById('game-canvas');
  if (canvas && !canvas.classList.contains('is-playing')) {
    canvas.style.display = 'none';
    canvas.setAttribute('hidden', '');
  }
}

function startBeepLoop() {
  if (beepTimer) return;
  const notes = [523.25, 659.25, 783.99];
  let step = 0;

  function beep(freq, when) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.18, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(when);
    osc.stop(when + 0.25);
  }

  beepTimer = setInterval(() => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime + 0.05;
      beep(notes[step % 3], t);
      step += 1;
      log(`beep#${step} ${window.innerWidth}x${window.innerHeight}`);
    } catch (e) {
      log(`beep-fail ${e instanceof Error ? e.message : String(e)}`);
    }
  }, 1000);
}

function ensurePanel() {
  if (document.getElementById('discord-probe')) return;
  const panel = document.createElement('div');
  panel.id = 'discord-probe';
  panel.setAttribute(
    'style',
    'position:fixed;left:6px;top:6px;right:5.5rem;z-index:2147483647;padding:8px 10px;background:#ff00aa;color:#fff;font:bold 12px/1.35 system-ui,sans-serif;border:2px solid #fff;pointer-events:none;white-space:pre-wrap;max-height:40vh;overflow:hidden;',
  );
  panel.textContent = LOG.join('\n');
  document.documentElement.appendChild(panel);
}

/** Runs synchronously when the /assets entry module loads. */
export function armDiscordProbe() {
  window.__discordProbeLog = log;
  window.__showBootError = showBootError;

  if (isDiscordHost()) {
    document.documentElement.classList.add('discord-embedded');
    ensurePanel();
    applyLayout();
    startBeepLoop();
    log('entry module ran');

    document.addEventListener('securitypolicyviolation', (e) => {
      log(`CSP ${e.violatedDirective}`);
    });
  }

  window.addEventListener('error', (e) => {
    if (window.__calamariBooted) return;
    showBootError(`Load error: ${e.message || 'unknown'}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (window.__calamariBooted) return;
    const reason = e.reason;
    const msg = reason instanceof Error ? reason.message : String(reason);
    showBootError(`Startup error: ${msg}`);
  });
  setTimeout(() => {
    if (window.__calamariBooted) return;
    const splash = document.getElementById('boot-splash');
    if (splash && splash.style.display !== 'none') {
      showBootError('Game script did not start. Force-quit Discord and reopen.');
    }
  }, 15000);
}

/** Hide the yellow HTML smoke-test once the game boots. */
export function dismissHtmlSmokeTest() {
  const smoke = document.getElementById('html-smoke-test');
  if (smoke) smoke.style.display = 'none';
}
