/**
 * Background music playlist + procedural shlurp / bonk SFX (Web Audio).
 */
const PLAYLIST = [
  'audio/vintage-mouse-hunt.mp3',
  'audio/vintage-piano.mp3',
  'audio/vintage-jazz-coffee.mp3',
  'audio/vintage-comedy.mp3',
];

export class AudioManager {
  constructor() {
    /** @type {HTMLAudioElement | null} */
    this.music = null;
    /** @type {AudioContext | null} */
    this.ctx = null;
    this.musicVolume = 0.65;
    this.sfxVolume = 0.55;
    this._unlocked = false;
    this._lastBonkAt = 0;
    this._trackIndex = 0;
    this._duckFactor = 1;
    this._loadSettings();
  }

  _settingsKey() {
    return 'calamari-damacy-audio-v1';
  }

  _loadSettings() {
    try {
      const raw = localStorage.getItem(this._settingsKey());
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.musicVolume === 'number') {
        this.musicVolume = Math.min(1, Math.max(0, data.musicVolume));
      }
      if (typeof data.sfxVolume === 'number') {
        this.sfxVolume = Math.min(1, Math.max(0, data.sfxVolume));
      }
    } catch {
      /* keep defaults */
    }
  }

  _saveSettings() {
    localStorage.setItem(
      this._settingsKey(),
      JSON.stringify({
        musicVolume: this.musicVolume,
        sfxVolume: this.sfxVolume,
      }),
    );
  }

  /** @param {number} v 0..1 */
  setMusicVolume(v) {
    this.musicVolume = Math.min(1, Math.max(0, v));
    if (this.music) this.music.volume = this.musicVolume * this._duckFactor;
    this._saveSettings();
  }

  /** @param {number} v 0..1 */
  setSfxVolume(v) {
    this.sfxVolume = Math.min(1, Math.max(0, v));
    this._saveSettings();
  }

  getMusicVolumePct() {
    return Math.round(this.musicVolume * 100);
  }

  getSfxVolumePct() {
    return Math.round(this.sfxVolume * 100);
  }

  _trackUrl(relPath) {
    return new URL(`${import.meta.env.BASE_URL}${relPath}`, window.location.href).href;
  }

  init() {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = this.musicVolume;
    audio.addEventListener('error', () => {
      console.error('Soundtrack failed to load', {
        src: audio.src,
        code: audio.error?.code,
        track: PLAYLIST[this._trackIndex],
      });
    });
    audio.addEventListener('ended', () => this._nextTrack());
    this.music = audio;
    this._loadTrack(this._trackIndex, false);
  }

  _loadTrack(index, autoplay) {
    if (!this.music) return;
    this._trackIndex = ((index % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
    const src = this._trackUrl(PLAYLIST[this._trackIndex]);
    this.music.loop = false;
    this.music.src = src;
    this.music.load();
    this.music.volume = this.musicVolume * this._duckFactor;
    if (autoplay && this._unlocked) {
      const p = this.music.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => console.warn('Next track play failed', err));
      }
    }
  }

  _nextTrack() {
    this._loadTrack(this._trackIndex + 1, true);
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** Call synchronously from a click handler. */
  unlockAndPlay() {
    if (!this.music) this.init();
    this._unlocked = true;
    this._ensureCtx();
    this._duckFactor = 1;
    this.music.muted = false;
    this.music.volume = this.musicVolume;
    // Restart current track if stopped at 0 from title
    if (this.music.paused) {
      const p = this.music.play();
      if (p && typeof p.then === 'function') {
        p.then(() => console.info('Soundtrack playing', PLAYLIST[this._trackIndex])).catch((err) => {
          console.warn('Music play() failed', err);
          this._unlocked = false;
        });
      }
    }
  }

  play() {
    if (!this.music || !this._unlocked) return;
    this.music.muted = false;
    this.music.volume = this.musicVolume * this._duckFactor;
    const p = this.music.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  pause() {
    this.music?.pause();
  }

  duck(factor = 0.35) {
    this._duckFactor = factor;
    if (!this.music) return;
    this.music.volume = this.musicVolume * factor;
  }

  unduck() {
    this._duckFactor = 1;
    if (!this.music) return;
    this.music.volume = this.musicVolume;
  }

  stop() {
    if (!this.music) return;
    this.music.pause();
    this.music.currentTime = 0;
    this._duckFactor = 1;
  }

  /**
   * Wet scoop / stick sound. Higher pitch for smaller bits.
   * @param {number} [size=0.3]
   */
  shlurp(size = 0.3) {
    if (!this._unlocked) return;
    const ctx = this._ensureCtx();
    const t0 = ctx.currentTime;
    const pitch = 420 + Math.max(0.1, 1.2 - size) * 280;
    const dur = 0.18 + Math.min(0.12, size * 0.08);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, pitch * 0.35), t0 + dur);

    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.0001, t0);
    toneGain.gain.exponentialRampToValueAtTime(0.22 * this.sfxVolume, t0 + 0.02);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    const noiseDur = dur * 0.7;
    const noiseBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * noiseDur), ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = pitch * 0.8;
    noiseFilter.Q.value = 1.2;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15 * this.sfxVolume, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + noiseDur);

    osc.connect(toneGain).connect(ctx.destination);
    noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    noise.start(t0);
    noise.stop(t0 + noiseDur + 0.02);
  }

  /**
   * Impact when hitting something too big. intensity 0..1+ from closing speed.
   * @param {number} [intensity=0.6]
   */
  bonk(intensity = 0.6) {
    if (!this._unlocked) return;
    const now = performance.now();
    if (now - this._lastBonkAt < 70) return;
    this._lastBonkAt = now;

    const ctx = this._ensureCtx();
    const t0 = ctx.currentTime;
    const amp = Math.min(1, 0.35 + intensity * 0.5) * this.sfxVolume;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140 + intensity * 40, t0);
    osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.12);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.0001, t0);
    thudGain.gain.exponentialRampToValueAtTime(0.35 * amp, t0 + 0.01);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);

    const clickDur = 0.04;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * clickDur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.25));
    }
    const click = ctx.createBufferSource();
    click.buffer = buf;
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.value = 600;
    const clickGain = ctx.createGain();
    clickGain.gain.value = 0.28 * amp;

    osc.connect(thudGain).connect(ctx.destination);
    click.connect(clickFilter).connect(clickGain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.18);
    click.start(t0);
    click.stop(t0 + clickDur + 0.01);
  }
}
