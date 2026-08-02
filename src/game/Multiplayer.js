import { NetSession, MP_COLORS, MAX_PLAYERS } from './NetSession.js';

const VOTE_SECONDS = 15;
const VOTE_CHOICES = ['same', 'next', 'pause', 'leave'];
/** Tie-break order when counts are equal (prefer rematch). */
const VOTE_TIEBREAK = ['same', 'next', 'pause', 'leave'];

/**
 * Online race + battle: host simulates; guests send input and apply snapshots.
 * Win: first to size goal, else biggest when time expires. Bump steals volume.
 * After match: 15s vote (same / next / pause / leave); non-votes default to same.
 */
export class Multiplayer {
  /** @param {import('./Game.js').Game} game */
  constructor(game) {
    this.game = game;
    this.net = new NetSession();
    /** @type {'idle' | 'lobby' | 'playing' | 'voting' | 'ended'} */
    this.phase = 'idle';
    /** @type {{ id: string, name: string, color: number, wish: {x:number,z:number}, ball: import('./Katamari.js').Katamari | null }[]} */
    this.players = [];
    this.localId = null;
    this.roomCode = null;
    this.isHost = false;
    this.stageId = null;
    this._stateAcc = 0;
    this._scoops = [];
    this._events = [];
    this._status = '';
    this._inputAcc = 0;
    /** @type {Set<number>} */
    this._predictedScoopIds = new Set();
    /** @type {Record<string, string>} */
    this._votes = {};
    /** Wall-clock deadline (Date.now ms) so background tabs don't freeze the timer. */
    this._voteEndsAt = 0;
    this._voteTimeoutSent = false;
    this._localVote = null;
    this._resolving = false;
    /** Race clock deadline (Date.now ms). */
    this._matchEndsAt = 0;
    this._matchTimeoutSent = false;
    /** @type {Map<string, number>} */
    this._scatterCooldown = new Map();
  }

  get localPlayer() {
    return this.players.find((p) => p.id === this.localId) ?? null;
  }

  get localBall() {
    return this.localPlayer?.ball ?? null;
  }

  async createLobby(name) {
    this.phase = 'lobby';
    this._status = 'Connecting…';
    this.game.ui.showMpLobby({ status: this._status, roomCode: null, players: [], isHost: true });

    const profile = { name: name || 'Prince', color: MP_COLORS[0] };
    try {
      const { roomCode, localId } = await this.net.host(profile);
      this.roomCode = roomCode;
      this.localId = localId;
      this.isHost = true;
      this.players = [{ id: localId, name: profile.name, color: profile.color, wish: { x: 0, z: 0 }, ball: null }];
      this._wireNet();
      this._status = 'Share the room code. Start when ready.';
      this._refreshLobby();
    } catch (e) {
      this._status = `Host failed: ${e.message || e}`;
      this.game.ui.showMpLobby({ status: this._status, roomCode: null, players: [], isHost: true });
    }
  }

  async joinLobby(code, name) {
    this.phase = 'lobby';
    this._status = 'Joining…';
    this.game.ui.showMpLobby({ status: this._status, roomCode: code, players: [], isHost: false });

    const color = MP_COLORS[1];
    const profile = { name: name || 'Prince', color };
    try {
      const { roomCode, localId } = await this.net.join(code, profile);
      this.roomCode = roomCode;
      this.localId = localId;
      this.isHost = false;
      this.players = [];
      this._wireNet();
      this._status = 'Waiting for host to start…';
      this._refreshLobby();
    } catch (e) {
      this._status = `Join failed: ${e.message || e}`;
      this.game.ui.showMpLobby({ status: this._status, roomCode: code, players: [], isHost: false });
    }
  }

  _wireNet() {
    this.net.on('message', ({ from, msg }) => this._onMessage(from, msg));
    this.net.on('peer', ({ peerId, joined }) => {
      if (!this.isHost) return;
      if (!joined) {
        this.players = this.players.filter((p) => p.id !== peerId);
        this._broadcastLobby();
        this._refreshLobby();
      }
    });
    this.net.on('error', ({ message }) => {
      this._status = message;
      if (this.phase === 'lobby') this._refreshLobby();
    });
  }

  _onMessage(from, msg) {
    if (msg.type === 'hello' && this.isHost && this.phase === 'lobby') {
      if (this.players.length >= MAX_PLAYERS) {
        this.net.sendTo(from, { type: 'reject', reason: 'Room full' });
        return;
      }
      const color = MP_COLORS[this.players.length % MP_COLORS.length];
      const name = msg.profile?.name || 'Prince';
      this.players.push({
        id: from,
        name,
        color: msg.profile?.color ?? color,
        wish: { x: 0, z: 0 },
        ball: null,
      });
      this.net.sendTo(from, {
        type: 'welcome',
        yourId: from,
        players: this.players.map((p) => ({ id: p.id, name: p.name, color: p.color })),
        roomCode: this.roomCode,
      });
      this._broadcastLobby();
      this._refreshLobby();
      return;
    }

    if (msg.type === 'welcome' && !this.isHost) {
      this.localId = msg.yourId || this.localId;
      this.players = (msg.players || []).map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        wish: { x: 0, z: 0 },
        ball: null,
      }));
      this._status = 'Waiting for host to start…';
      this._refreshLobby();
      return;
    }

    if (msg.type === 'lobby' && !this.isHost) {
      this.players = (msg.players || []).map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        wish: { x: 0, z: 0 },
        ball: null,
      }));
      this._refreshLobby();
      return;
    }

    if (msg.type === 'reject') {
      this._status = msg.reason || 'Rejected';
      this._refreshLobby();
      return;
    }

    if (msg.type === 'start') {
      this._beginMatch(msg);
      return;
    }

    if (msg.type === 'input' && this.isHost && this.phase === 'playing') {
      const p = this.players.find((pl) => pl.id === from);
      if (p && msg.wish) p.wish = { x: msg.wish.x || 0, z: msg.wish.z || 0 };
      return;
    }

    if (msg.type === 'state' && !this.isHost && this.phase === 'playing') {
      this._applyState(msg);
      return;
    }

    if (msg.type === 'end') {
      this._enterVoting(msg);
      return;
    }

    if (msg.type === 'vote' && this.isHost && this.phase === 'voting') {
      if (VOTE_CHOICES.includes(msg.vote)) {
        this._votes[from] = msg.vote;
        this._broadcastVotes();
        this._refreshVoteUi();
      }
      return;
    }

    if (msg.type === 'vote-timeout' && this.isHost && this.phase === 'voting') {
      // Guest wall-clock expired — resolve even if host tab is backgrounded
      this._resolveVotes();
      return;
    }

    if (msg.type === 'match-timeout' && this.isHost && this.phase === 'playing') {
      this._endMatchByTime();
      return;
    }

    if (msg.type === 'votes' && !this.isHost && this.phase === 'voting') {
      this._votes = msg.votes || {};
      if (msg.voteEndsAt) this._voteEndsAt = msg.voteEndsAt;
      this._refreshVoteUi();
      return;
    }

    if (msg.type === 'resolve') {
      this._applyResolve(msg.decision, msg.stageId);
    }
  }

  _broadcastLobby() {
    this.net.send({
      type: 'lobby',
      players: this.players.map((p) => ({ id: p.id, name: p.name, color: p.color })),
    });
  }

  _refreshLobby() {
    this.game.ui.showMpLobby({
      status: this._status,
      roomCode: this.roomCode,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        you: p.id === this.localId,
      })),
      isHost: this.isHost,
      canStart: this.isHost && this.players.length >= 2,
    });
  }

  /** Host starts the match on a size-mode stage (or explicit stageId). */
  startMatch(stageId = null) {
    if (!this.isHost || this.players.length < 2) return;
    const stage = stageId
      ? this.game.stages.find((s) => s.id === stageId)
      : this._sizeStages()[0] ?? this.game.stages[0];
    const pick = stage ?? this.game.stages[0];
    const payload = {
      type: 'start',
      stageId: pick.id,
      matchEndsAt: Date.now() + (pick.timeLimit ?? 300) * 1000,
      players: this.players.map((p) => ({ id: p.id, name: p.name, color: p.color })),
    };
    this.net.send(payload);
    this._beginMatch(payload);
  }

  _sizeStages() {
    return this.game.stages.filter((s) => (s.mode ?? 'size') === 'size');
  }

  _nextStageId() {
    const list = this._sizeStages();
    if (list.length === 0) return this.game.stages[0]?.id;
    const idx = list.findIndex((s) => s.id === this.stageId);
    return list[(idx + 1 + list.length) % list.length].id;
  }

  _beginMatch(msg) {
    const stage = this.game.stages.find((s) => s.id === msg.stageId) ?? this.game.stages[0];
    this.stageId = stage.id;
    this.phase = 'playing';
    this._scoops = [];
    this._events = [];
    this._stateAcc = 0;
    this._predictedScoopIds.clear();
    this._votes = {};
    this._localVote = null;
    this._resolving = false;
    this._scatterCooldown.clear();
    this._matchEndsAt = msg.matchEndsAt || Date.now() + (stage.timeLimit ?? 300) * 1000;
    this._matchTimeoutSent = false;

    this.players = (msg.players || this.players).map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      wish: { x: 0, z: 0 },
      ball: null,
    }));

    this.game.beginMultiplayerStage(stage, this.players);
    this.game.timeLeft = this._matchSecondsLeft();
  }

  _matchSecondsLeft() {
    if (!this._matchEndsAt) return this.game.timeLeft;
    return Math.max(0, (this._matchEndsAt - Date.now()) / 1000);
  }

  /** Dev cheat / sync: shift the wall-clock race end. */
  nudgeMatchClock(deltaSec) {
    if (!this._matchEndsAt) return;
    this._matchEndsAt += deltaSec * 1000;
    this.game.timeLeft = this._matchSecondsLeft();
  }

  /** Called by Game after balls are created. */
  attachBalls(ballsById) {
    for (const p of this.players) {
      p.ball = ballsById[p.id] ?? null;
    }
  }

  /** Host: prop scooped — queue for guests to stick visually. */
  onPropScooped(propId, type, playerId) {
    if (!this.isHost) return;
    this._scoops.push({ propId, typeId: type.id, playerId });
  }

  onBumpSteal(attackerName, victimName, cm) {
    const text = `${attackerName} stole ${cm}cm from ${victimName}!`;
    this._events.push({ kind: 'steal', text });
    this.game.ui.flashMpEvent?.(text);
  }

  /**
   * @param {number} dt
   * @param {{ x: number, z: number }} localWish camera-relative already converted to world
   */
  update(dt, localWish) {
    if (this.phase === 'voting') {
      this._refreshVoteUi();
      if (this.isHost && !this._resolving && Date.now() >= this._voteEndsAt) {
        this._resolveVotes();
      } else if (!this.isHost && !this._resolving && Date.now() >= this._voteEndsAt) {
        // Nudge host — PeerJS still delivers while their tab is backgrounded
        if (!this._voteTimeoutSent) {
          this._voteTimeoutSent = true;
          this.net.send({ type: 'vote-timeout' });
        }
      }
      return;
    }

    if (this.phase !== 'playing') return;

    const local = this.localPlayer;
    if (local) local.wish = localWish;

    if (!this.isHost) {
      this.game.timeLeft = this._matchSecondsLeft();
      this._inputAcc += dt;
      if (this._inputAcc >= 1 / 20) {
        this._inputAcc = 0;
        this.net.send({ type: 'input', wish: localWish });
      }
      // Predict local ball + scoops/bounces; melt remotes
      if (local?.ball) {
        local.ball.update(dt, localWish);
        this.game.collectibles.predictGuest(dt, local.ball, this._predictedScoopIds);
      }
      for (const p of this.players) {
        if (!p.ball || p.id === this.localId) continue;
        p.ball.smoothToNet(dt);
        p.ball.tickVisuals(dt);
      }
      if (Date.now() >= this._matchEndsAt && !this._matchTimeoutSent) {
        this._matchTimeoutSent = true;
        this.net.send({ type: 'match-timeout' });
      }
      return;
    }

    // Host simulation
    const balls = this.players.map((p) => p.ball).filter(Boolean);
    for (const p of this.players) {
      if (!p.ball) continue;
      p.ball.update(dt, p.wish);
    }

    this.game.collectibles.update(dt, balls, {
      onScoop: (propId, type, ball) => {
        const owner = this.players.find((pl) => pl.ball === ball);
        this.onPropScooped(propId, type, owner?.id);
        this.game.audio?.shlurp(type.size);
        if (owner) this.game.onMpCollected?.(owner.id, type);
      },
    });

    this._resolveBallBall();

    this.game.timeLeft = this._matchSecondsLeft();

    // Race win: first to goal
    const goal = this.game.stage.goalCm || 40;
    for (const p of this.players) {
      if (p.ball && p.ball.diameterCm >= goal) {
        this._endMatch(p.id, 'goal');
        return;
      }
    }
    if (this.game.timeLeft <= 0) {
      this._endMatchByTime();
      return;
    }

    this._stateAcc += dt;
    if (this._stateAcc >= 1 / 20) {
      this._stateAcc = 0;
      this._broadcastState();
    }
  }

  _endMatchByTime() {
    if (this.phase !== 'playing') return;
    let best = this.players[0];
    for (const p of this.players) {
      if ((p.ball?.diameterCm ?? 0) > (best.ball?.diameterCm ?? 0)) best = p;
    }
    this._endMatch(best.id, 'time');
  }

  _resolveBallBall() {
    const e = this.game.tuning.bonkRestitution ?? 0.55;
    const list = this.players.filter((p) => p.ball);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].ball;
        const b = list[j].ball;
        let dx = b.position.x - a.position.x;
        let dz = b.position.z - a.position.z;
        let dist = Math.hypot(dx, dz);
        const reach = a.radius + b.radius;
        if (dist >= reach || dist < 1e-6) {
          if (dist < 1e-6) {
            dx = 1;
            dz = 0;
            dist = 1;
          } else continue;
        }
        const nx = dx / dist;
        const nz = dz / dist;
        const mA = Math.max(0.4, a.collisionMass);
        const mB = Math.max(0.4, b.collisionMass);
        const inv = 1 / mA + 1 / mB;
        const overlap = reach - dist + 0.01;
        a.position.x -= nx * overlap * ((1 / mA) / inv);
        a.position.z -= nz * overlap * ((1 / mA) / inv);
        b.position.x += nx * overlap * ((1 / mB) / inv);
        b.position.z += nz * overlap * ((1 / mB) / inv);
        a.group.position.x = a.position.x;
        a.group.position.z = a.position.z;
        b.group.position.x = b.position.x;
        b.group.position.z = b.position.z;

        const rvx = a.velocity.x - b.velocity.x;
        const rvz = a.velocity.z - b.velocity.z;
        const velAlong = rvx * nx + rvz * nz;
        if (velAlong > 0) {
          const jImp = ((1 + e) * velAlong) / inv;
          a.velocity.x -= (jImp / mA) * nx;
          a.velocity.z -= (jImp / mA) * nz;
          b.velocity.x += (jImp / mB) * nx;
          b.velocity.z += (jImp / mB) * nz;
          this.game.audio?.bonk(Math.min(1.5, velAlong / 5));
        }

        const impact = Math.abs(velAlong);
        // Scatter sticky junk from both balls (host only; synced via events)
        if (velAlong > 1.4 && impact > 1.4) {
          this._scatterPair(list[i], list[j], nx, nz, impact);
        }

        // Steal: larger ball takes volume when impact is solid
        if (impact > 2.2) {
          const bigger = a.radius >= b.radius ? list[i] : list[j];
          const smaller = bigger === list[i] ? list[j] : list[i];
          const ratio = bigger.ball.radius / Math.max(0.01, smaller.ball.radius);
          if (ratio >= 0.92) {
            const stealV = Math.min(
              smaller.ball.volume * 0.08,
              bigger.ball.volume * 0.05,
              0.35,
            );
            if (stealV > 0.02) {
              const before = smaller.ball.diameterCm;
              smaller.ball.removeVolume(stealV);
              bigger.ball.addVolume(stealV);
              const cm = Math.max(1, before - smaller.ball.diameterCm);
              this.onBumpSteal(bigger.name, smaller.name, cm);
            }
          }
        }
      }
    }
  }

  /**
   * @param {{ id: string, name: string, ball: import('./Katamari.js').Katamari }} pa
   * @param {{ id: string, name: string, ball: import('./Katamari.js').Katamari }} pb
   */
  _scatterPair(pa, pb, nx, nz, impact) {
    const key = [pa.id, pb.id].sort().join(':');
    const now = performance.now();
    const last = this._scatterCooldown.get(key) ?? 0;
    if (now - last < 450) return;
    this._scatterCooldown.set(key, now);

    const piecesA = pa.ball.scatterOnImpact(impact, -nx, -nz);
    const piecesB = pb.ball.scatterOnImpact(impact, nx, nz);
    const all = [];
    for (const piece of piecesA) {
      this.game.collectibles.addScattered(piece);
      all.push({
        playerId: pa.id,
        typeId: piece.typeId,
        propId: piece.propId,
        x: piece.x,
        z: piece.z,
        vx: piece.vx,
        vz: piece.vz,
      });
    }
    for (const piece of piecesB) {
      this.game.collectibles.addScattered(piece);
      all.push({
        playerId: pb.id,
        typeId: piece.typeId,
        propId: piece.propId,
        x: piece.x,
        z: piece.z,
        vx: piece.vx,
        vz: piece.vz,
      });
    }
    if (all.length > 0) {
      this._events.push({ kind: 'scatter', pieces: all });
      this.game.ui.flashMpEvent?.('Sticky junk scattered!');
      this.game.audio?.bonk(Math.min(1.6, impact / 4));
    }
  }

  _broadcastState() {
    const scoops = this._scoops.splice(0, this._scoops.length);
    const events = this._events.splice(0, this._events.length);
    this.net.send({
      type: 'state',
      timeLeft: this.game.timeLeft,
      matchEndsAt: this._matchEndsAt,
      scoops,
      events,
      players: this.players.map((p) => ({
        id: p.id,
        x: p.ball?.position.x ?? 0,
        z: p.ball?.position.z ?? 0,
        vx: p.ball?.velocity.x ?? 0,
        vz: p.ball?.velocity.z ?? 0,
        radius: p.ball?.radius ?? 0.5,
        volume: p.ball?.volume ?? 0.125,
        count: p.ball?.count ?? 0,
        y: p.ball?.position.y ?? 0.5,
      })),
    });
  }

  _applyState(msg) {
    if (msg.matchEndsAt) this._matchEndsAt = msg.matchEndsAt;
    this.game.timeLeft = this._matchSecondsLeft();
    // Legacy fallback
    if (!msg.matchEndsAt && msg.timeLeft != null) {
      this.game.timeLeft = msg.timeLeft;
    }
    if (msg.removed?.length) {
      this.game.collectibles.removeByIds(msg.removed);
    }
    for (const scoop of msg.scoops || []) {
      const p = this.players.find((pl) => pl.id === scoop.playerId);
      this.game.collectibles.applyScoop(
        scoop,
        p?.ball,
        this._predictedScoopIds,
        true,
      );
    }
    for (const ev of msg.events || []) {
      if (ev.kind === 'steal') this.game.ui.flashMpEvent?.(ev.text);
      if (ev.kind === 'scatter') this._applyScatterEvent(ev);
    }
    for (const snap of msg.players || []) {
      const p = this.players.find((pl) => pl.id === snap.id);
      if (!p?.ball) continue;
      if (snap.id === this.localId) p.ball.reconcileNet(snap);
      else p.ball.setNetTarget(snap);
    }
  }

  _applyScatterEvent(ev) {
    this.game.ui.flashMpEvent?.('Sticky junk scattered!');
    for (const piece of ev.pieces || []) {
      const p = this.players.find((pl) => pl.id === piece.playerId);
      if (p?.ball && piece.propId != null && piece.propId >= 0) {
        const dropped = p.ball.dropStuckProp(piece.propId);
        if (dropped?.mesh) {
          dropped.mesh.geometry?.dispose?.();
          if (dropped.mesh.material) {
            if (Array.isArray(dropped.mesh.material)) {
              dropped.mesh.material.forEach((m) => m.dispose?.());
            } else dropped.mesh.material.dispose?.();
          }
          dropped.mesh.removeFromParent();
        }
      }
      // Also clear predicted scoop tracking if this was ours
      if (piece.propId != null) this._predictedScoopIds.delete(piece.propId);
      this.game.collectibles.addScattered({
        typeId: piece.typeId,
        x: piece.x,
        z: piece.z,
        vx: piece.vx,
        vz: piece.vz,
      });
    }
  }

  _endMatch(winnerId, reason) {
    if (this.phase !== 'playing') return;
    const rankings = [...this.players]
      .map((p) => ({
        id: p.id,
        name: p.name,
        sizeCm: p.ball?.diameterCm ?? 0,
        count: p.ball?.count ?? 0,
        you: p.id === this.localId,
      }))
      .sort((a, b) => b.sizeCm - a.sizeCm);
    const payload = {
      type: 'end',
      winnerId,
      reason,
      rankings,
      voteSeconds: VOTE_SECONDS,
      voteEndsAt: Date.now() + VOTE_SECONDS * 1000,
      stageId: this.stageId,
    };
    if (this.isHost) this.net.send(payload);
    this._enterVoting(payload);
  }

  _enterVoting(msg) {
    this.phase = 'voting';
    this._votes = {};
    this._localVote = null;
    const secs = msg.voteSeconds ?? VOTE_SECONDS;
    this._voteEndsAt = msg.voteEndsAt || Date.now() + secs * 1000;
    this._voteTimeoutSent = false;
    this._resolving = false;
    if (msg.stageId) this.stageId = msg.stageId;
    this.game.endMultiplayer(msg);
    if (this.isHost) this._broadcastVotes();
    this._refreshVoteUi();
  }

  castVote(vote) {
    if (this.phase !== 'voting' || !VOTE_CHOICES.includes(vote)) return;
    this._localVote = vote;
    this._votes[this.localId] = vote;
    if (this.isHost) {
      this._broadcastVotes();
    } else {
      this.net.send({ type: 'vote', vote });
    }
    this._refreshVoteUi();
  }

  _voteSecondsLeft() {
    return Math.max(0, (this._voteEndsAt - Date.now()) / 1000);
  }

  _broadcastVotes() {
    this.net.send({
      type: 'votes',
      votes: { ...this._votes },
      voteEndsAt: this._voteEndsAt,
      secondsLeft: this._voteSecondsLeft(),
    });
  }

  _refreshVoteUi() {
    this.game.ui.updateMpVote({
      secondsLeft: this._voteSecondsLeft(),
      localVote: this._localVote,
      votes: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        vote: this._votes[p.id] ?? null,
        you: p.id === this.localId,
      })),
    });
  }

  _tallyVotes() {
    const counts = { same: 0, next: 0, pause: 0, leave: 0 };
    for (const p of this.players) {
      const v = this._votes[p.id] || 'same';
      if (counts[v] != null) counts[v] += 1;
      else counts.same += 1;
    }
    let best = 'same';
    let bestN = -1;
    for (const key of VOTE_TIEBREAK) {
      if (counts[key] > bestN) {
        bestN = counts[key];
        best = key;
      }
    }
    return best;
  }

  _resolveVotes() {
    if (!this.isHost || this._resolving) return;
    this._resolving = true;
    const decision = this._tallyVotes();
    let stageId = this.stageId;
    if (decision === 'next') stageId = this._nextStageId();
    else if (decision === 'same') stageId = this.stageId;
    this.net.send({ type: 'resolve', decision, stageId });
    this._applyResolve(decision, stageId);
  }

  _applyResolve(decision, stageId) {
    this._resolving = true;
    if (decision === 'leave') {
      this.game.leaveMultiplayer();
      return;
    }
    if (decision === 'pause') {
      this.phase = 'lobby';
      this._votes = {};
      this._localVote = null;
      this._status = 'Paused — host can start when ready.';
      this.game.returnToMpLobby();
      this._refreshLobby();
      return;
    }
    if (this.isHost) {
      this.startMatch(stageId || this.stageId);
    }
    // Guests wait for host's `start` message (already sent inside startMatch for host;
    // for guest, resolve arrives then start may arrive separately — host startMatch sends start)
  }

  async leave() {
    await this.net.destroy();
    this.phase = 'idle';
    this.players = [];
    this.localId = null;
    this.roomCode = null;
    this._votes = {};
    this._localVote = null;
  }
}
