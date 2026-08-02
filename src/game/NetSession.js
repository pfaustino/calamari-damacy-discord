import Peer from 'peerjs';

const PREFIX = 'calamari-mp-';
const MAX_PLAYERS = 4;

function randomCode(len = 5) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += alphabet[(Math.random() * alphabet.length) | 0];
  }
  return out;
}

/**
 * PeerJS room: host opens connections; guests connect by room code.
 * Messages are JSON { type, ... }.
 */
export class NetSession {
  constructor() {
    this.peer = null;
    this.roomCode = null;
    this.isHost = false;
    /** @type {Map<string, import('peerjs').DataConnection>} */
    this.conns = new Map();
    this.localId = null;
    this._handlers = new Map();
    this._open = false;
  }

  on(type, fn) {
    this._handlers.set(type, fn);
  }

  _emit(type, payload) {
    this._handlers.get(type)?.(payload);
  }

  _peerId(code) {
    return `${PREFIX}${code}`;
  }

  /**
   * @param {{ name: string, color: number }} profile
   */
  async host(profile) {
    await this.destroy();
    this.isHost = true;
    this.roomCode = randomCode();
    this.peer = new Peer(this._peerId(this.roomCode), { debug: 0 });

    await this._waitOpen();
    this.localId = this.peer.id;
    this._open = true;

    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        if (this.conns.size >= MAX_PLAYERS - 1) {
          conn.send({ type: 'reject', reason: 'Room full' });
          conn.close();
          return;
        }
        this.conns.set(conn.peer, conn);
        this._wireConn(conn);
        this._emit('peer', { peerId: conn.peer, joined: true });
      });
    });

    this.peer.on('error', (err) => this._emit('error', { message: String(err) }));
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
    this.peer = new Peer({ debug: 0 });

    await this._waitOpen();
    this.localId = this.peer.id;
    this._open = true;

    const hostId = this._peerId(this.roomCode);
    const conn = this.peer.connect(hostId, { reliable: true });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Could not reach host')), 12_000);
      conn.on('open', () => {
        clearTimeout(t);
        resolve();
      });
      conn.on('error', (e) => {
        clearTimeout(t);
        reject(e);
      });
      this.peer.on('error', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });

    this.conns.set(hostId, conn);
    this._wireConn(conn);
    conn.send({ type: 'hello', profile, peerId: this.localId });
    this._emit('ready', { roomCode: this.roomCode, localId: this.localId, profile });
    return { roomCode: this.roomCode, localId: this.localId };
  }

  _waitOpen() {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('PeerJS timeout')), 15_000);
      this.peer.on('open', () => {
        clearTimeout(t);
        resolve();
      });
      this.peer.on('error', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
  }

  /** @param {import('peerjs').DataConnection} conn */
  _wireConn(conn) {
    conn.on('data', (raw) => {
      const msg = typeof raw === 'object' && raw ? raw : null;
      if (!msg?.type) return;
      this._emit('message', { from: conn.peer, msg });
    });
    conn.on('close', () => {
      this.conns.delete(conn.peer);
      this._emit('peer', { peerId: conn.peer, joined: false });
    });
  }

  /** Send to one peer (host→guest or guest→host). */
  sendTo(peerId, msg) {
    this.conns.get(peerId)?.send(msg);
  }

  /** Host broadcasts to all guests; guest sends to host. */
  send(msg) {
    for (const conn of this.conns.values()) {
      if (conn.open) conn.send(msg);
    }
  }

  async destroy() {
    for (const conn of this.conns.values()) {
      try {
        conn.close();
      } catch {
        /* ignore */
      }
    }
    this.conns.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        /* ignore */
      }
    }
    this.peer = null;
    this.roomCode = null;
    this.localId = null;
    this._open = false;
    this.isHost = false;
  }
}

export const MP_COLORS = [0xff6b8a, 0x5dade2, 0xfee440, 0x9b5de5];
export { MAX_PLAYERS };
