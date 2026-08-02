import { getMpWebSocketUrl } from '../lib/mpWsUrl.js';

const MAX_PLAYERS = 4;

/**
 * WebSocket room relay: host broadcasts; guests send to host.
 * Messages are JSON { type, ... } (game protocol).
 */
export class NetSession {
  constructor() {
    /** @type {WebSocket | null} */
    this.ws = null;
    this.roomCode = null;
    this.isHost = false;
    this.localId = null;
    /** @type {string | null} */
    this.hostId = null;
    this._handlers = new Map();
    /** @type {((data: object) => void) | null} */
    this._pendingHandler = null;
  }

  on(type, fn) {
    this._handlers.set(type, fn);
  }

  _emit(type, payload) {
    this._handlers.get(type)?.(payload);
  }

  _sendOp(op, extra = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ op, ...extra }));
  }

  _waitForOp(expectedOp, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this._pendingHandler = null;
        reject(new Error('WebSocket timeout'));
      }, timeoutMs);

      this._pendingHandler = (data) => {
        if (data.op === 'error') {
          clearTimeout(t);
          this._pendingHandler = null;
          reject(new Error(data.message || 'Connection failed'));
          return;
        }
        if (data.op === expectedOp) {
          clearTimeout(t);
          this._pendingHandler = null;
          resolve(data);
        }
      };
    });
  }

  _onSocketMessage(ev) {
    let data;
    try {
      data = JSON.parse(String(ev.data));
    } catch {
      return;
    }

    if (this._pendingHandler) {
      this._pendingHandler(data);
      if (this._pendingHandler) return;
    }

    if (data.op === 'msg' && data.payload?.type) {
      this._emit('message', { from: data.from, msg: data.payload });
      return;
    }
    if (data.op === 'peer') {
      this._emit('peer', { peerId: data.peerId, joined: Boolean(data.joined) });
      return;
    }
    if (data.op === 'error') {
      this._emit('error', { message: data.message || 'Connection error' });
    }
  }

  async _connect() {
    const url = getMpWebSocketUrl();
    const ws = new WebSocket(url);
    this.ws = ws;

    const welcome = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('WebSocket timeout')), 15_000);
      const onMsg = (ev) => {
        let data;
        try {
          data = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (data.op === 'welcome') {
          clearTimeout(t);
          ws.removeEventListener('message', onMsg);
          resolve(data);
        }
      };
      ws.addEventListener('message', onMsg);
      ws.addEventListener('error', () => {
        clearTimeout(t);
        reject(new Error('Could not connect to multiplayer server'));
      }, { once: true });
    });

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('WebSocket timeout')), 15_000);
      ws.addEventListener('open', () => {
        clearTimeout(t);
        resolve();
      }, { once: true });
      ws.addEventListener('error', () => {
        clearTimeout(t);
        reject(new Error('Could not connect to multiplayer server'));
      }, { once: true });
    });

    const data = await welcome;
    this.localId = data.id;
    ws.onmessage = (ev) => this._onSocketMessage(ev);
    ws.onclose = () => {
      this._emit('error', { message: 'Disconnected from multiplayer server' });
    };
  }

  /**
   * @param {{ name: string, color: number }} profile
   */
  async host(profile) {
    await this.destroy();
    this.isHost = true;
    await this._connect();

    const hostedPromise = this._waitForOp('hosted');
    this._sendOp('host', { profile });
    const hosted = await hostedPromise;

    this.roomCode = hosted.roomCode;
    this.localId = hosted.id;
    this.hostId = this.localId;
    this._emit('ready', { roomCode: this.roomCode, localId: this.localId, profile });
    return { roomCode: this.roomCode, localId: this.localId };
  }

  /**
   * @param {string} code
   * @param {{ name: string, color: number }} profile
   */
  async join(code, profile) {
    await this.destroy();
    this.isHost = false;
    this.roomCode = code.trim().toUpperCase();
    await this._connect();

    const joinedPromise = this._waitForOp('joined');
    this._sendOp('join', { roomCode: this.roomCode, profile });
    const joined = await joinedPromise;

    this.localId = joined.id;
    this.hostId = joined.hostId;
    this._sendOp('send', {
      to: this.hostId,
      payload: { type: 'hello', profile, peerId: this.localId },
    });
    this._emit('ready', { roomCode: this.roomCode, localId: this.localId, profile });
    return { roomCode: this.roomCode, localId: this.localId };
  }

  /** Send to one peer (host→guest or guest→host). */
  sendTo(peerId, msg) {
    this._sendOp('send', { to: peerId, payload: msg });
  }

  /** Host broadcasts to all guests; guest sends to host. */
  send(msg) {
    if (this.isHost) {
      this._sendOp('send', { to: 'all', payload: msg });
      return;
    }
    if (this.hostId) {
      this.sendTo(this.hostId, msg);
    }
  }

  async destroy() {
    this._pendingHandler = null;
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.ws = null;
    this.roomCode = null;
    this.localId = null;
    this.hostId = null;
    this.isHost = false;
  }
}

export const MP_COLORS = [0xff6b8a, 0x5dade2, 0xfee440, 0x9b5de5];
export { MAX_PLAYERS };
