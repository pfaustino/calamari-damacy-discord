import * as THREE from 'three';
import gameData from '../../data/game.json';
import stagesData from '../../data/stages.json';
import objectsData from '../../data/objects.json';
import { Input } from './Input.js';
import { World } from './World.js';
import { Katamari } from './Katamari.js';
import { Collectibles } from './Collectibles.js';
import { FollowCamera } from './FollowCamera.js';
import { UI } from './UI.js';
import { AudioManager } from './AudioManager.js';
import {
  loadProgress,
  recordClear,
  isStageUnlocked,
  clearProgress,
  setLeaderboardName,
} from './Progress.js';
import { Multiplayer } from './Multiplayer.js';
import { initDevPanel } from '../dev/DevPanel.js';
import { trySubmitGlobalClear } from '../lib/globalLeaderboard.js';

/** @typedef {'title' | 'playing' | 'paused' | 'mp-paused' | 'result' | 'present' | 'cosmos' | 'leaderboard' | 'lobby' | 'mp-playing' | 'mp-result'} GameState */

/**
 * Thin orchestrator — wires systems and owns the state machine.
 */
export class Game {
  constructor() {
    this.state = /** @type {GameState} */ ('title');
    this.tuning = null;
    this.stages = [];
    this.stage = null;
    this.objectTypes = [];
    this.progress = loadProgress();
    this._lastResult = null;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();

    this.input = new Input();
    this.ui = new UI();
    this.world = null;
    this.ball = null;
    this.collectibles = null;
    this.followCam = null;
    this.audio = new AudioManager();

    this.timeLeft = 0;
    this.collectCount = 0;
    this._escWasDown = false;
    this._raf = 0;
    this._worldBuilt = false;
    /** @type {Multiplayer | null} */
    this.mp = null;
    /** @type {import('./Katamari.js').Katamari[]} */
    this.mpBalls = [];
  }

  init() {
    this.tuning = gameData.tuning;
    this.stages = stagesData.stages;
    this.stage = this.stages[0];
    this.objectTypes = objectsData.types;

    this.setupRenderer();
    this.setupScene();
    this.input.init();
    this.world = new World(this);
    this.collectibles = new Collectibles(this);
    this.followCam = new FollowCamera(this);
    this.followCam.init();
    this.audio.init();

    this.bindUi();
    this.ui.syncSoundSliders(this.audio.getMusicVolumePct(), this.audio.getSfxVolumePct());
    this.ui.showTitle();

    initDevPanel({
      getStatus: () =>
        `${this.state} · ${this.stage?.id ?? '-'} · ${this.ball?.diameterCm ?? 0}cm`,
      actions: [
        { label: 'Win now', fn: () => this.endStage(true) },
        { label: 'Grow +10cm', fn: () => this.devGrow(10) },
        { label: 'Skip 30s', fn: () => {
          this.timeLeft = Math.max(0, this.timeLeft - 30);
          this.mp?.nudgeMatchClock?.(-30);
        } },
        { label: 'Restart stage', fn: () => this.startStage(this.stage.id) },
        { label: 'Clear progress', fn: () => { clearProgress(); this.progress = loadProgress(); this.showCosmos(); } },
        { label: 'Cosmos', fn: () => this.showCosmos() },
      ],
    });

    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  setupRenderer() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );
    this.camera.position.set(0, 8, 12);
  }

  /** Initialize persistent world lights/root once. Stage visuals rebuild per mission. */
  ensureWorld() {
    if (this._worldBuilt) return;
    this.world.init();
    this._worldBuilt = true;
  }

  pickKingLine(kind) {
    const lines = this.stage?.[kind];
    if (Array.isArray(lines) && lines.length > 0) {
      const seed = (this.ball?.count ?? 0) + (this.ball?.diameterCm ?? 0);
      return lines[seed % lines.length];
    }
    if (typeof lines === 'string') return lines;
    if (kind === 'kingFailure') return 'We expected the sky. You brought a damp suggestion.';
    if (kind === 'kingIntro') return 'Roll, little Prince. The Cosmos is waiting.';
    return 'Acceptable! Into the sky with it.';
  }

  bindUi() {
    document.getElementById('btn-play').addEventListener('click', () => {
      this.audio.unlockAndPlay();
      const next = this.stages.find((s) => isStageUnlocked(this.stages, this.progress, s.id)
        && !this.progress.completed.includes(s.id))
        ?? this.stages[0];
      this.startStage(next.id);
    });
    document.getElementById('btn-title-cosmos').addEventListener('click', () => {
      this.audio.unlockAndPlay();
      this.showCosmos();
    });
    document.getElementById('btn-leaderboard').addEventListener('click', () => {
      this.audio.unlockAndPlay();
      this.showLeaderboard();
    });
    document.getElementById('btn-leaderboard-close').addEventListener('click', () => {
      this.toTitle();
    });
    document.getElementById('btn-mp').addEventListener('click', () => {
      this.audio.unlockAndPlay();
      this.openMultiplayer();
    });
    document.getElementById('btn-mp-host').addEventListener('click', () => {
      const name = /** @type {HTMLInputElement} */ (document.getElementById('mp-name')).value.trim();
      this.mp?.createLobby(name);
    });
    document.getElementById('btn-mp-join').addEventListener('click', () => {
      const name = /** @type {HTMLInputElement} */ (document.getElementById('mp-name')).value.trim();
      const code = /** @type {HTMLInputElement} */ (document.getElementById('mp-code')).value.trim();
      this.mp?.joinLobby(code, name);
    });
    document.getElementById('btn-mp-start').addEventListener('click', () => {
      this.mp?.startMatch();
    });
    document.getElementById('btn-mp-leave').addEventListener('click', () => {
      this.leaveMultiplayer();
    });
    for (const btn of document.querySelectorAll('.mp-vote-btn')) {
      btn.addEventListener('click', () => {
        const vote = btn.getAttribute('data-vote');
        if (vote) this.mp?.castVote(vote);
      });
    }
    document.getElementById('btn-resume').addEventListener('click', () => this.resume());
    document.getElementById('btn-quit').addEventListener('click', () => {
      if (this.mp) this.leaveMultiplayer();
      else this.toTitle();
    });
    document.getElementById('btn-sound').addEventListener('click', () => {
      this.ui.syncSoundSliders(this.audio.getMusicVolumePct(), this.audio.getSfxVolumePct());
      this.ui.showPausePanel('sound');
    });
    document.getElementById('btn-about').addEventListener('click', () => {
      this.ui.showPausePanel('about');
    });
    document.getElementById('btn-sound-back').addEventListener('click', () => {
      this.ui.showPausePanel('main');
    });
    document.getElementById('btn-about-back').addEventListener('click', () => {
      this.ui.showPausePanel('main');
    });
    document.getElementById('slider-music').addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      this.audio.setMusicVolume(pct / 100);
      document.getElementById('slider-music-val').textContent = `${pct}%`;
    });
    document.getElementById('slider-sfx').addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      this.audio.setSfxVolume(pct / 100);
      document.getElementById('slider-sfx-val').textContent = `${pct}%`;
      // Preview click
      this.audio.bonk(0.45);
    });
    document.getElementById('btn-result-primary').addEventListener('click', () => {
      if (this._lastResult?.won) this.presentToKing();
      else {
        this.audio.unlockAndPlay();
        this.startStage(this.stage.id);
      }
    });
    document.getElementById('btn-title').addEventListener('click', () => this.toTitle());
    document.getElementById('btn-view-cosmos').addEventListener('click', () => this.showCosmos());
    document.getElementById('btn-cosmos-title').addEventListener('click', () => this.toTitle());
  }

  startStage(stageId = this.stage?.id) {
    const stage = this.stages.find((s) => s.id === stageId) ?? this.stages[0];
    if (!isStageUnlocked(this.stages, this.progress, stage.id)) return;

    this.stage = stage;
    this.ensureWorld();
    this.world.buildStage(this.stage);

    this.clearBalls();
    this.collectibles.clear();
    this.ball = new Katamari(this, this.stage.startRadius);
    this.collectCount = 0;
    this.collectibles.spawn();
    this.timeLeft = this.stage.timeLimit;
    this.followCam.reset();
    this.camera.position.set(0, 8, 12);
    this.state = 'playing';
    this.ui.showPlaying(this.stage);
    this.clock.getDelta();
    this.audio.unduck();
    this.audio.play();
  }

  onCollected(type) {
    if (this.stage?.mode !== 'collect') return;
    if (type?.id !== this.stage.collectType) return;
    this.collectCount += 1;
  }

  isMissionComplete() {
    if (this.stage?.mode === 'collect') {
      return this.collectCount >= (this.stage.collectGoal ?? 0);
    }
    return (this.ball?.diameterCm ?? 0) >= (this.stage?.goalCm ?? Infinity);
  }

  toTitle() {
    this.state = 'title';
    this.clearBalls();
    this.collectibles?.clear();
    this.ui.showTitle();
    this.audio.stop();
  }

  clearBalls() {
    if (this.ball) {
      this.scene.remove(this.ball.group);
      this.ball = null;
    }
    for (const b of this.mpBalls) {
      this.scene.remove(b.group);
    }
    this.mpBalls = [];
  }

  openMultiplayer() {
    this.clearBalls();
    this.collectibles?.clear();
    this.mp = new Multiplayer(this);
    this.state = 'lobby';
    this.ui.showMpMenu();
    this.audio.unlockAndPlay();
    this.audio.duck(0.45);
    this.audio.play();
  }

  async leaveMultiplayer() {
    await this.mp?.leave();
    this.mp = null;
    this.clearBalls();
    this.collectibles?.clear();
    this.toTitle();
  }

  /**
   * @param {object} stage
   * @param {{ id: string, name: string, color: number }[]} players
   */
  beginMultiplayerStage(stage, players) {
    this.stage = stage;
    this.ensureWorld();
    this.world.buildStage(this.stage);
    this.clearBalls();
    this.collectibles.clear();
    this.collectibles.spawn();
    this.timeLeft = this.stage.timeLimit;
    this.collectCount = 0;

    const n = players.length;
    const ballsById = {};
    players.forEach((p, i) => {
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = 4 + n;
      const ball = new Katamari(this, this.stage.startRadius, {
        color: p.color,
        spawnX: Math.cos(ang) * r,
        spawnZ: Math.sin(ang) * r,
      });
      ballsById[p.id] = ball;
      this.mpBalls.push(ball);
    });
    this.mp?.attachBalls(ballsById);
    this.ball = this.mp?.localBall ?? this.mpBalls[0];

    this.followCam.reset();
    this.camera.position.set(0, 8, 12);
    this.state = 'mp-playing';
    this.ui.showPlaying(this.stage, { multiplayer: true });
    this.clock.getDelta();
    this.audio.unduck();
    this.audio.play();
  }

  endMultiplayer(msg) {
    this.state = 'mp-result';
    this.clearBalls();
    this.collectibles?.clear();
    const youWon = msg.winnerId === this.mp?.localId;
    this.ui.showMpResult({
      youWon,
      reason: msg.reason,
      rankings: msg.rankings,
      stageName: this.stage?.name,
    });
    if (youWon) {
      const you = (msg.rankings || []).find((r) => r.you) ?? (msg.rankings || [])[0];
      if (you) {
        trySubmitGlobalClear(this.progress, {
          sizeCm: you.sizeCm,
          count: you.count,
          stageId: this.stage?.id,
          stageName: this.stage?.name,
          mode: this.stage?.mode ?? 'size',
          multiplayer: true,
          timeSec: Math.max(
            0,
            (this.stage?.timeLimit ?? 0) - Math.max(0, this.timeLeft),
          ),
        });
      }
    }
    this.audio.duck(0.4);
  }

  /** After a Pause vote — keep the room, show lobby again. */
  returnToMpLobby() {
    this.state = 'lobby';
    this.clearBalls();
    this.collectibles?.clear();
    this.audio.duck(0.45);
  }

  showCosmos() {
    this.state = 'cosmos';
    this.clearBalls();
    this.collectibles?.clear();
    this.ui.showCosmos(
      this.stages,
      this.progress,
      (id) => isStageUnlocked(this.stages, this.progress, id),
      (id) => {
        this.audio.unlockAndPlay();
        this.startStage(id);
      },
    );
    this.audio.duck(0.45);
    this.audio.play();
  }

  showLeaderboard() {
    this.state = 'leaderboard';
    this.clearBalls();
    this.collectibles?.clear();
    this.ui.showLeaderboard(this.progress, (next) => {
      this.progress = next;
    });
    this.audio.duck(0.45);
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'mp-playing') return;
    this.state = this.state === 'mp-playing' ? 'mp-paused' : 'paused';
    this.ui.showPause();
    this.audio.duck(0.3);
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'playing';
    } else if (this.state === 'mp-paused') {
      this.state = 'mp-playing';
    } else return;
    this.ui.hidePause();
    this.clock.getDelta();
    this.audio.unduck();
    this.audio.play();
  }

  endStage(forceWin = false) {
    if (this.state !== 'playing' && !forceWin) return;
    const sizeCm = this.ball?.diameterCm ?? 0;
    const won = forceWin || this.isMissionComplete();
    this._lastResult = {
      won,
      sizeCm,
      count: this.ball?.count ?? 0,
      collectCount: this.collectCount ?? 0,
      timeLeft: this.timeLeft,
    };
    this.state = 'result';
    const timeLimit = this.stage.timeLimit ?? 0;
    const timeSec = Math.max(0, timeLimit - Math.max(0, this.timeLeft));
    const runPayload = {
      sizeCm: this._lastResult.sizeCm,
      count: this._lastResult.count,
      collectCount: this._lastResult.collectCount,
      stageId: this.stage.id,
      stageName: this.stage.name,
      mode: this.stage.mode ?? 'size',
      multiplayer: false,
      timeSec,
    };
    this.ui.showResult({
      won,
      sizeCm,
      goalCm: this.stage.goalCm,
      count: this._lastResult.count,
      collectCount: this._lastResult.collectCount,
      collectGoal: this.stage.collectGoal,
      collectType: this.stage.collectType,
      mode: this.stage.mode ?? 'size',
      timeLeft: this.timeLeft,
      stageName: this.stage.name,
      kingLine: this.pickKingLine(won ? 'kingPraise' : 'kingFailure'),
      progress: this.progress,
      onSaveAndSubmit: (name) => {
        const next = setLeaderboardName(this.progress, name);
        if (!next) return { ok: false, error: 'Enter a name (max 24 chars).' };
        this.progress = next;
        return trySubmitGlobalClear(this.progress, runPayload);
      },
    });
    this.audio.duck(0.4);
  }

  presentToKing() {
    if (!this._lastResult?.won) return;
    this.progress = recordClear(
      this.progress,
      this.stage,
      this._lastResult.sizeCm,
      this._lastResult.count,
    );
    this.state = 'present';
    this.ui.showPresent({
      starName: this.stage.starName,
      kingPraise: this.pickKingLine('kingPraise'),
      sizeCm: this._lastResult.sizeCm,
      count: this._lastResult.count,
    });
    this.audio.duck(0.5);
  }

  devGrow(cm) {
    if (!this.ball) return;
    const addRadius = cm / 20;
    this.ball.radius += addRadius;
    this.ball.volume = this.ball.radius ** 3;
    this.ball._syncScale();
    this.ball.position.y = this.ball.radius;
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  animate = () => {
    this._raf = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    const esc = this.input.isEscapePressed();
    if (esc && !this._escWasDown) {
      if (this.state === 'playing' || this.state === 'mp-playing') this.pause();
      else if (this.state === 'paused' || this.state === 'mp-paused') {
        if (this.ui.pausePanel !== 'main') this.ui.showPausePanel('main');
        else this.resume();
      }
    }
    this._escWasDown = esc;

    if (this.state === 'playing' && this.ball) {
      const wishLocal = this.input.getMoveVector();
      const wish = this.followCam.wishToWorld(wishLocal);
      this.ball.update(dt, wish);
      this.collectibles.update(dt, this.ball);
      this.followCam.update(dt, this.ball, wish);

      this.timeLeft -= dt;
      this.ui.updateHud(this.ball.diameterCm, Math.max(0, this.timeLeft), {
        mode: this.stage.mode ?? 'size',
        collectCount: this.collectCount,
        collectGoal: this.stage.collectGoal,
        collectType: this.stage.collectType,
      });

      if (this.isMissionComplete()) {
        this.endStage(true);
      } else if (this.timeLeft <= 0) {
        this.endStage(false);
      }
    }

    if (this.state === 'mp-playing' && this.mp && this.ball) {
      const wishLocal = this.input.getMoveVector();
      const wish = this.followCam.wishToWorld(wishLocal);
      this.mp.update(dt, wish);
      this.followCam.update(dt, this.ball, wish);
      const roster = this.mp.players.map((p) => ({
        name: p.name,
        sizeCm: p.ball?.diameterCm ?? 0,
        you: p.id === this.mp.localId,
      }));
      this.ui.updateHud(this.ball.diameterCm, Math.max(0, this.timeLeft), {
        mode: 'size',
        multiplayer: true,
        roster,
      });
    }

    if (this.state === 'mp-result' && this.mp) {
      this.mp.update(dt, { x: 0, z: 0 });
    }

    this.renderer.render(this.scene, this.camera);
  };
}
