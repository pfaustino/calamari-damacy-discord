/**
 * HUD / overlay helpers for title → play → result → present → cosmos → multiplayer.
 */
import {
  canFetchGlobalLeaderboard,
  fetchGlobalLeaderboard,
  formatLeaderboardTime,
  isGlobalLeaderboardConfigured,
} from '../lib/globalLeaderboard.js';
import { setLeaderboardName } from './Progress.js';

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class UI {
  constructor() {
    this.hud = document.getElementById('hud');
    this.sizeValue = document.getElementById('hud-size-value');
    this.sizeGoal = document.getElementById('hud-size-goal');
    this.timerValue = document.getElementById('hud-timer-value');
    this.stageName = document.getElementById('hud-stage-name');
    this.mpRosterHud = document.getElementById('hud-mp-roster');
    this.mpEventHud = document.getElementById('hud-mp-event');
    this.title = document.getElementById('title-screen');
    this.pause = document.getElementById('pause-screen');
    this.result = document.getElementById('result-screen');
    this.resultTitle = document.getElementById('result-title');
    this.resultMessage = document.getElementById('result-message');
    this.resultStats = document.getElementById('result-stats');
    this.resultPrimary = document.getElementById('btn-result-primary');
    this.present = document.getElementById('present-screen');
    this.presentStarName = document.getElementById('present-star-name');
    this.presentMessage = document.getElementById('present-message');
    this.presentStats = document.getElementById('present-stats');
    this.risingStar = document.getElementById('rising-star');
    this.cosmos = document.getElementById('cosmos-screen');
    this.hungStars = document.getElementById('hung-stars');
    this.stageList = document.getElementById('stage-list');
    this.mpScreen = document.getElementById('mp-screen');
    this.mpResult = document.getElementById('mp-result-screen');
    this.leaderboard = document.getElementById('leaderboard-screen');
    this.pausePanel = 'main';
    this._eventTimer = 0;
    this._lbTab = 'local';
  }

  hideAllOverlays() {
    this.title.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.result.classList.add('hidden');
    this.present.classList.add('hidden');
    this.cosmos.classList.add('hidden');
    this.mpScreen?.classList.add('hidden');
    this.mpResult?.classList.add('hidden');
    this.leaderboard?.classList.add('hidden');
    this.hud.classList.add('hidden');
  }

  showTitle() {
    this.hideAllOverlays();
    this.title.classList.remove('hidden');
  }

  /**
   * Local stars + global API board. Mutates progress via setLeaderboardName.
   * @param {{ completed: string[], stars: object[], leaderboardName: string }} progress
   * @param {(next: object) => void} onProgress
   */
  showLeaderboard(progress, onProgress) {
    this.hideAllOverlays();
    this.leaderboard.classList.remove('hidden');
    this._lbTab = 'local';

    const nameInput = document.getElementById('leaderboard-name');
    const status = document.getElementById('leaderboard-status');
    const panelLocal = document.getElementById('leaderboard-panel-local');
    const tabLocal = document.getElementById('btn-lb-local');
    const tabGlobal = document.getElementById('btn-lb-global');
    const canFetch = canFetchGlobalLeaderboard();
    const canSubmit = isGlobalLeaderboardConfigured();

    nameInput.value = progress.leaderboardName ?? '';
    status.textContent = canSubmit
      ? ''
      : 'Name saves locally. Global submits need VITE_LEADERBOARD_WRITE_KEY in this build.';
    panelLocal.innerHTML = this._buildLocalLeaderboard(progress);
    tabGlobal.disabled = !canFetch;
    tabGlobal.title = canFetch ? '' : 'Global board unavailable';
    this._showLeaderboardTab('local');

    tabLocal.onclick = () => this._showLeaderboardTab('local');
    tabGlobal.onclick = () => {
      if (!canFetch) return;
      this._showLeaderboardTab('global');
      this._loadGlobalLeaderboard();
    };
    document.getElementById('btn-save-lb-name').onclick = () => {
      const next = setLeaderboardName(progress, nameInput.value);
      if (!next) {
        status.textContent = 'Enter a name (max 24 chars).';
        return;
      }
      onProgress(next);
      status.textContent = canSubmit
        ? 'Global name saved.'
        : 'Name saved locally. Global submits need VITE_LEADERBOARD_WRITE_KEY in this build.';
    };
  }

  _showLeaderboardTab(tab) {
    this._lbTab = tab;
    const isLocal = tab === 'local';
    document.getElementById('btn-lb-local').classList.toggle('is-active', isLocal);
    document.getElementById('btn-lb-global').classList.toggle('is-active', !isLocal);
    document.getElementById('leaderboard-panel-local').classList.toggle('hidden', !isLocal);
    document.getElementById('leaderboard-panel-global').classList.toggle('hidden', isLocal);
  }

  _buildLocalLeaderboard(progress) {
    const stars = [...(progress.stars ?? [])].sort((a, b) => (b.sizeCm ?? 0) - (a.sizeCm ?? 0));
    const best = stars[0]?.sizeCm ?? 0;
    const clears = progress.completed?.length ?? 0;
    let rows = '<p class="leaderboard-empty">No clears yet — hang a star to set your first record!</p>';
    if (stars.length) {
      rows = `
        <div class="leaderboard-table-wrap">
          <table class="leaderboard-table" aria-label="Local clears">
            <thead>
              <tr>
                <th>#</th>
                <th>Star</th>
                <th>Size</th>
                <th>Objects</th>
              </tr>
            </thead>
            <tbody>
              ${stars.map((star, i) => `
                <tr class="leaderboard-row${star.sizeCm === best ? ' leaderboard-row-best' : ''}">
                  <td>${i + 1}</td>
                  <td>${escapeHtml(star.starName ?? star.stageId ?? '—')}</td>
                  <td><strong>${star.sizeCm ?? 0} cm</strong>${star.sizeCm === best ? ' <span class="leaderboard-pr">PR</span>' : ''}</td>
                  <td>${star.count ?? '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    return `
      <p class="leaderboard-sub">Best clears on this device · ${clears} mission${clears === 1 ? '' : 's'}</p>
      <div class="leaderboard-bests">
        <div class="leaderboard-stat"><span>Best size</span><strong>${best > 0 ? `${best} cm` : '—'}</strong></div>
        <div class="leaderboard-stat"><span>Stars hung</span><strong>${stars.length}</strong></div>
      </div>
      <h3 class="leaderboard-section-title">Clears by size</h3>
      ${rows}
    `;
  }

  async _loadGlobalLeaderboard() {
    const loading = document.getElementById('global-loading');
    const rowsEl = document.getElementById('global-rows');
    loading.classList.remove('hidden');
    rowsEl.innerHTML = '';
    const result = await fetchGlobalLeaderboard(50);
    loading.classList.add('hidden');
    if (!result.ok) {
      rowsEl.innerHTML = `<p class="leaderboard-empty">${escapeHtml(result.error)}</p>`;
      return;
    }
    rowsEl.innerHTML = this._buildGlobalLeaderboardRows(result.rows);
  }

  _buildGlobalLeaderboardRows(rows) {
    if (!rows.length) {
      return '<p class="leaderboard-empty">No global scores yet — be the first!</p>';
    }
    return `
      <div class="leaderboard-table-wrap">
        <table class="leaderboard-table" aria-label="Global top clears">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Size</th>
              <th>Time</th>
              <th>Stage</th>
              <th>Objects</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, i) => `
              <tr class="leaderboard-row${i === 0 ? ' leaderboard-row-best' : ''}">
                <td>${i + 1}</td>
                <td>${escapeHtml(row.player)}</td>
                <td><strong>${row.value} cm</strong></td>
                <td>${formatLeaderboardTime(row.meta?.time)}</td>
                <td>${escapeHtml(row.meta?.stage ?? '—')}</td>
                <td>${row.meta?.objects ?? '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  showMpMenu() {
    this.hideAllOverlays();
    this.mpScreen.classList.remove('hidden');
    document.getElementById('mp-status').textContent = 'Host a room, or enter a code to join.';
    document.getElementById('mp-room-code').classList.add('hidden');
    document.getElementById('mp-roster').innerHTML = '';
    document.getElementById('btn-mp-start').classList.add('hidden');
    document.getElementById('btn-mp-host').classList.remove('hidden');
    document.getElementById('btn-mp-join').classList.remove('hidden');
  }

  showMpLobby({ status, roomCode, players, isHost, canStart = false }) {
    this.hideAllOverlays();
    this.mpScreen.classList.remove('hidden');
    document.getElementById('mp-status').textContent = status || '';
    const codeEl = document.getElementById('mp-room-code');
    if (roomCode) {
      codeEl.textContent = `Room code: ${roomCode}`;
      codeEl.classList.remove('hidden');
    } else {
      codeEl.classList.add('hidden');
    }
    const roster = document.getElementById('mp-roster');
    roster.innerHTML = '';
    for (const p of players || []) {
      const row = document.createElement('div');
      row.className = 'mp-roster-row';
      const swatch = document.createElement('span');
      swatch.className = 'mp-swatch';
      swatch.style.background = `#${(p.color >>> 0).toString(16).padStart(6, '0')}`;
      row.appendChild(swatch);
      const label = document.createElement('span');
      label.textContent = `${p.name}${p.you ? ' (you)' : ''}${isHost && p.you ? ' · host' : ''}`;
      row.appendChild(label);
      roster.appendChild(row);
    }
    document.getElementById('btn-mp-start').classList.toggle('hidden', !canStart);
    document.getElementById('btn-mp-host').classList.toggle('hidden', Boolean(roomCode));
    document.getElementById('btn-mp-join').classList.toggle('hidden', Boolean(roomCode));
  }

  showMpResult({ youWon, reason, rankings, stageName }) {
    this.hideAllOverlays();
    this.mpResult.classList.remove('hidden');
    document.getElementById('mp-result-title').textContent = youWon ? 'You win!' : 'Match over';
    const why =
      reason === 'goal'
        ? 'First to the size goal.'
        : 'Time up — biggest calamari wins.';
    document.getElementById('mp-result-message').textContent =
      `${why} (${stageName || 'Arena'})`;
    const box = document.getElementById('mp-result-rankings');
    box.innerHTML = '';
    (rankings || []).forEach((r, i) => {
      const row = document.createElement('div');
      row.className = `mp-rank-row${r.you ? ' you' : ''}`;
      row.textContent = `${i + 1}. ${r.name} — ${r.sizeCm} cm · ${r.count} objects`;
      box.appendChild(row);
    });
    for (const btn of document.querySelectorAll('.mp-vote-btn')) {
      btn.classList.remove('selected');
    }
  }

  /**
   * @param {{
   *   secondsLeft: number,
   *   votes: { id: string, name: string, color: number, vote: string | null, you: boolean }[],
   *   localVote: string | null,
   * }} state
   */
  updateMpVote(state) {
    const sec = Math.max(0, Math.ceil(state.secondsLeft ?? 0));
    const cd = document.getElementById('mp-vote-countdown');
    if (cd) {
      cd.textContent =
        sec > 0 ? `Next race in ${sec}…` : 'Starting…';
    }
    const board = document.getElementById('mp-vote-board');
    if (board) {
      const labels = {
        same: 'Same stage',
        next: 'Next stage',
        pause: 'Pause',
        leave: 'Leave',
      };
      board.innerHTML = '';
      for (const v of state.votes || []) {
        const row = document.createElement('div');
        row.className = `mp-vote-row${v.you ? ' you' : ''}`;
        const name = document.createElement('span');
        name.textContent = `${v.name}${v.you ? ' (you)' : ''}`;
        const choice = document.createElement('span');
        choice.className = 'mp-vote-choice-label';
        choice.textContent = v.vote ? labels[v.vote] || v.vote : '— (defaults to Same)';
        row.appendChild(name);
        row.appendChild(choice);
        board.appendChild(row);
      }
    }
    for (const btn of document.querySelectorAll('.mp-vote-btn')) {
      const vote = btn.getAttribute('data-vote');
      btn.classList.toggle('selected', vote === state.localVote);
    }
  }

  flashMpEvent(text) {
    if (!this.mpEventHud) return;
    this.mpEventHud.textContent = text;
    this.mpEventHud.classList.remove('hidden');
    clearTimeout(this._eventTimer);
    this._eventTimer = setTimeout(() => {
      this.mpEventHud.classList.add('hidden');
    }, 2200);
  }

  showPlaying(stage, opts = {}) {
    this.hideAllOverlays();
    this.hud.classList.remove('hidden');
    if (stage.mode === 'collect') {
      const label = stage.collectType ?? 'item';
      this.sizeGoal.textContent = `Collect ${stage.collectGoal} ${label}s`;
    } else {
      this.sizeGoal.textContent = `Goal ${stage.goalCm} cm`;
    }
    this.stageName.textContent = opts.multiplayer
      ? `${stage.name} · Race & Battle`
      : stage.name;
    if (this.mpRosterHud) {
      this.mpRosterHud.classList.toggle('hidden', !opts.multiplayer);
      this.mpRosterHud.innerHTML = '';
    }
  }

  showPause() {
    this.pause.classList.remove('hidden');
    this.showPausePanel('main');
  }

  hidePause() {
    this.pause.classList.add('hidden');
  }

  /** @param {'main' | 'sound' | 'about'} panel */
  showPausePanel(panel) {
    document.getElementById('pause-main').classList.toggle('hidden', panel !== 'main');
    document.getElementById('pause-sound').classList.toggle('hidden', panel !== 'sound');
    document.getElementById('pause-about').classList.toggle('hidden', panel !== 'about');
    this.pausePanel = panel;
  }

  syncSoundSliders(musicPct, sfxPct) {
    const music = document.getElementById('slider-music');
    const sfx = document.getElementById('slider-sfx');
    const musicVal = document.getElementById('slider-music-val');
    const sfxVal = document.getElementById('slider-sfx-val');
    if (music) music.value = String(musicPct);
    if (sfx) sfx.value = String(sfxPct);
    if (musicVal) musicVal.textContent = `${musicPct}%`;
    if (sfxVal) sfxVal.textContent = `${sfxPct}%`;
  }

  showResult({
    won,
    sizeCm,
    goalCm,
    count,
    collectCount = 0,
    collectGoal = 0,
    collectType = 'item',
    mode = 'size',
    timeLeft,
    stageName,
    kingLine,
    progress = { leaderboardName: '' },
    onSaveAndSubmit = null,
  }) {
    this.hideAllOverlays();
    this.result.classList.remove('hidden');
    if (won) {
      this.resultTitle.textContent = 'Mission complete!';
      this.resultMessage.textContent =
        mode === 'collect'
          ? `${kingLine} You scooped ${collectCount} ${collectType}s in ${stageName}.`
          : `${kingLine} You rolled a ${sizeCm} cm calamari in ${stageName}.`;
      this.resultPrimary.textContent = 'Present to the King';
    } else {
      this.resultTitle.textContent = mode === 'collect' ? 'Not enough…' : 'Too small…';
      this.resultMessage.textContent =
        timeLeft <= 0
          ? kingLine
          : mode === 'collect'
            ? `Keep hunting ${collectType}s.`
            : 'Keep rolling — anything smaller than you sticks.';
      this.resultPrimary.textContent = 'Try Again';
    }
    this.resultStats.textContent =
      mode === 'collect'
        ? `${collectCount}/${collectGoal} ${collectType}s · ${sizeCm} cm · ${count} objects`
        : `${sizeCm} cm · ${count} objects · goal ${goalCm} cm`;

    this._bindResultScoreSave(progress, onSaveAndSubmit);
  }

  /**
   * Prompt for a global name on every stage end and submit size when ready.
   * @param {{ leaderboardName?: string }} progress
   * @param {(name: string) => { ok: boolean, player?: string, reason?: string, error?: string } | null} onSaveAndSubmit
   */
  _bindResultScoreSave(progress, onSaveAndSubmit) {
    const nameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('result-name'));
    const status = document.getElementById('result-score-status');
    const saveBtn = document.getElementById('btn-result-save-score');
    if (!nameInput || !status || !saveBtn || !onSaveAndSubmit) return;

    nameInput.value = progress.leaderboardName ?? '';

    const applyStatus = (result) => {
      if (!result) {
        status.textContent = 'Enter a name to save your score.';
        return;
      }
      if (result.error) {
        status.textContent = result.error;
        return;
      }
      if (result.ok) {
        status.textContent = `Score submitted as ${result.player}.`;
        return;
      }
      if (result.reason === 'not_configured') {
        status.textContent = 'Name saved. Global board unavailable in this build.';
        return;
      }
      if (result.reason === 'no_name') {
        status.textContent = 'Enter a name to save your score.';
        return;
      }
      status.textContent = 'Could not save score.';
    };

    const save = () => applyStatus(onSaveAndSubmit(nameInput.value));
    saveBtn.onclick = save;
    nameInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    };

    if (progress.leaderboardName?.trim()) {
      applyStatus(onSaveAndSubmit(progress.leaderboardName));
    } else {
      status.textContent = 'Enter a name to save your score.';
      nameInput.focus();
    }
  }

  showPresent({ starName, kingPraise, sizeCm, count }) {
    this.hideAllOverlays();
    this.present.classList.remove('hidden');
    this.presentStarName.textContent = starName;
    this.presentMessage.textContent = kingPraise;
    this.presentStats.textContent = `${sizeCm} cm · ${count} objects → a star`;
    this.risingStar.classList.remove('rise');
    void this.risingStar.offsetWidth;
    this.risingStar.classList.add('rise');
  }

  /**
   * @param {object[]} stages
   * @param {{ completed: string[], stars: object[] }} progress
   * @param {(stageId: string) => boolean} isUnlocked
   * @param {(stageId: string) => void} onSelect
   */
  showCosmos(stages, progress, isUnlocked, onSelect) {
    this.hideAllOverlays();
    this.cosmos.classList.remove('hidden');

    this.hungStars.innerHTML = '';
    if (progress.stars.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'tagline';
      empty.style.margin = '0';
      empty.textContent = 'No stars yet. Complete a mission to hang one.';
      this.hungStars.appendChild(empty);
    } else {
      for (const star of progress.stars) {
        const chip = document.createElement('span');
        chip.className = 'hung-star-chip';
        chip.textContent = `${star.starName} (${star.sizeCm} cm)`;
        this.hungStars.appendChild(chip);
      }
    }

    this.stageList.innerHTML = '';
    for (const stage of stages) {
      const unlocked = isUnlocked(stage.id);
      const cleared = progress.completed.includes(stage.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `stage-card${cleared ? ' cleared' : ''}`;
      btn.disabled = !unlocked;
      btn.innerHTML = `
        <span class="stage-card-name">${stage.name}</span>
        <span class="stage-card-meta">${
          unlocked
            ? stage.mode === 'collect'
              ? `${stage.blurb} · Collect ${stage.collectGoal} ${stage.collectType}s`
              : `${stage.blurb} · Goal ${stage.goalCm} cm`
            : 'Locked — clear the previous mission'
        }</span>
      `;
      if (unlocked) {
        btn.addEventListener('click', () => onSelect(stage.id));
      }
      this.stageList.appendChild(btn);
    }
  }

  updateHud(sizeCm, timeSec, mission = {}) {
    this.sizeValue.textContent = `${sizeCm} cm`;
    if (mission.mode === 'collect') {
      const n = mission.collectCount ?? 0;
      const goal = mission.collectGoal ?? 0;
      const label = mission.collectType ?? 'item';
      this.sizeGoal.textContent = `${label}s ${n}/${goal}`;
    }
    const m = Math.floor(timeSec / 60);
    const s = Math.floor(timeSec % 60);
    this.timerValue.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    if (timeSec < 30) this.timerValue.style.color = '#ff6b6b';
    else this.timerValue.style.color = '';

    if (this.mpRosterHud && mission.multiplayer && mission.roster) {
      this.mpRosterHud.classList.remove('hidden');
      this.mpRosterHud.innerHTML = mission.roster
        .map(
          (r) =>
            `<span class="hud-mp-chip${r.you ? ' you' : ''}">${r.name} ${r.sizeCm}cm</span>`,
        )
        .join('');
    }
  }
}
