/**
 * Discord Activity diagnostics (external file — inline scripts are CSP-blocked).
 * Plays a repeating C-E-G arpeggio and shows a debug strip on discordsays.com.
 */
(function () {
  var isDiscord = /discordsays\.com$/i.test(location.hostname);
  if (isDiscord) {
    document.documentElement.classList.add('discord-embedded');
  }

  var LOG = ['probe v3'];
  var MAX = 10;

  function log(msg) {
    LOG.push(msg);
    if (LOG.length > MAX) LOG.shift();
    var el = document.getElementById('discord-probe');
    if (el) el.textContent = LOG.join('\n');
  }

  function showBootError(msg) {
    var splash = document.getElementById('boot-splash');
    var err = document.getElementById('boot-error');
    if (splash) splash.style.display = 'none';
    if (err) {
      err.textContent = msg;
      err.style.display = 'flex';
    }
    log('ERR ' + msg);
  }

  window.__discordProbeLog = log;
  window.__showBootError = showBootError;

  function applyStyles() {
    var body = document.body;
    if (body) {
      body.setAttribute(
        'style',
        'margin:0;min-height:100dvh;background:#0a3d5c;color:#f0f7fa;font-family:system-ui,sans-serif;overflow:hidden;',
      );
    }
    var root = document.getElementById('game-root');
    if (root) {
      root.setAttribute('style', 'position:relative;width:100%;min-height:100dvh;');
    }
    var canvas = document.getElementById('game-canvas');
    if (canvas && !canvas.classList.contains('is-playing')) {
      canvas.setAttribute('style', 'display:none;position:absolute;inset:0;z-index:1;');
      canvas.setAttribute('hidden', '');
    }
    var title = document.getElementById('title-screen');
    if (title) {
      title.setAttribute(
        'style',
        'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:1.5rem;box-sizing:border-box;background:linear-gradient(165deg,#0a4a6e 0%,#062838 45%,#0d2137 100%);color:#f0f7fa;text-align:center;font-family:system-ui,sans-serif;overflow:auto;',
      );
    }
  }

  if (isDiscord) {
    var panel = document.createElement('div');
    panel.id = 'discord-probe';
    panel.setAttribute(
      'style',
      'position:fixed;left:6px;top:6px;right:5.5rem;z-index:2147483647;padding:8px 10px;background:#ff00aa;color:#fff;font:bold 12px/1.35 system-ui,sans-serif;border:2px solid #fff;pointer-events:none;white-space:pre-wrap;max-height:40vh;overflow:hidden;',
    );
    panel.textContent = LOG.join('\n');
    document.documentElement.appendChild(panel);

    var ctx = null;
    var notes = [523.25, 659.25, 783.99];
    var step = 0;

    function beep(freq, when) {
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.18, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
      osc.connect(g).connect(ctx.destination);
      osc.start(when);
      osc.stop(when + 0.25);
    }

    setInterval(function () {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!ctx) ctx = new AC();
        if (ctx.state === 'suspended') ctx.resume();
        var t = ctx.currentTime + 0.05;
        beep(notes[step % 3], t);
        step += 1;
        log(
          'beep#' + step + ' ' + window.innerWidth + 'x' + window.innerHeight,
        );
      } catch (e) {
        log('beep-fail ' + (e && e.message ? e.message : e));
      }
    }, 1000);

    document.addEventListener('securitypolicyviolation', function (e) {
      log('CSP ' + e.violatedDirective);
    });

    log('discord probe on');
  }

  window.addEventListener('error', function (e) {
    if (window.__calamariBooted) return;
    showBootError('Load error: ' + (e.message || 'unknown'));
  });
  window.addEventListener('unhandledrejection', function (e) {
    if (window.__calamariBooted) return;
    var reason = e.reason;
    var msg = reason && reason.message ? reason.message : String(reason);
    showBootError('Startup error: ' + msg);
  });
  setTimeout(function () {
    if (window.__calamariBooted) return;
    var splash = document.getElementById('boot-splash');
    if (splash && splash.style.display !== 'none') {
      showBootError('Game script did not start. Force-quit Discord and reopen.');
    }
  }, 15000);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      applyStyles();
      log('DOM ready');
    });
  } else {
    applyStyles();
    log('DOM already ready');
  }
})();
