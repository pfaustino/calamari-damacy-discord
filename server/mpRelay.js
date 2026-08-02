import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';

const MAX_PLAYERS = 4;
const ROOM_TTL_MS = 30 * 60 * 1000;

function randomCode(len = 5) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += alphabet[(Math.random() * alphabet.length) | 0];
  }
  return out;
}

/**
 * Lightweight room relay: host broadcasts; guests talk to host only.
 * @param {import('node:http').Server} httpServer
 * @param {string} [path='/mp']
 */
export function attachMpRelay(httpServer, path = '/mp') {
  const wss = new WebSocketServer({ server: httpServer, path });
  /** @type {Map<string, { code: string, hostId: string, clients: Map<string, import('ws').WebSocket>, created: number }>} */
  const roomsByCode = new Map();
  /** @type {WeakMap<import('ws').WebSocket, { id: string, roomCode: string | null, isHost: boolean }>} */
  const meta = new WeakMap();

  function send(ws, data) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  function leaveRoom(ws) {
    const m = meta.get(ws);
    if (!m?.roomCode) return;
    const room = roomsByCode.get(m.roomCode);
    if (!room) return;

    room.clients.delete(m.id);

    if (m.isHost) {
      for (const [, sock] of room.clients) {
        send(sock, { op: 'error', message: 'Host left the room' });
        try {
          sock.close();
        } catch {
          /* ignore */
        }
      }
      roomsByCode.delete(m.roomCode);
    } else {
      const hostWs = room.clients.get(room.hostId);
      if (hostWs) {
        send(hostWs, { op: 'peer', peerId: m.id, joined: false });
      }
      if (room.clients.size === 0) {
        roomsByCode.delete(m.roomCode);
      }
    }

    m.roomCode = null;
    m.isHost = false;
  }

  function broadcast(room, exceptId, data) {
    for (const [id, sock] of room.clients) {
      if (id !== exceptId) {
        send(sock, data);
      }
    }
  }

  wss.on('connection', (ws) => {
    const id = randomBytes(8).toString('hex');
    meta.set(ws, { id, roomCode: null, isHost: false });
    send(ws, { op: 'welcome', id });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      const m = meta.get(ws);
      if (!m || !msg?.op) return;

      if (msg.op === 'host') {
        leaveRoom(ws);
        const code = randomCode();
        const room = {
          code,
          hostId: m.id,
          clients: new Map([[m.id, ws]]),
          created: Date.now(),
        };
        roomsByCode.set(code, room);
        m.roomCode = code;
        m.isHost = true;
        send(ws, { op: 'hosted', roomCode: code, id: m.id });
        return;
      }

      if (msg.op === 'join') {
        leaveRoom(ws);
        const code = String(msg.roomCode || '').trim().toUpperCase();
        const room = roomsByCode.get(code);
        if (!room) {
          send(ws, { op: 'error', message: 'Room not found' });
          return;
        }
        if (room.clients.size >= MAX_PLAYERS) {
          send(ws, { op: 'error', message: 'Room full' });
          return;
        }
        room.clients.set(m.id, ws);
        m.roomCode = code;
        m.isHost = false;
        send(ws, {
          op: 'joined',
          roomCode: code,
          id: m.id,
          hostId: room.hostId,
        });
        const hostWs = room.clients.get(room.hostId);
        if (hostWs) {
          send(hostWs, { op: 'peer', peerId: m.id, joined: true });
        }
        return;
      }

      if (msg.op === 'send') {
        const room = m.roomCode ? roomsByCode.get(m.roomCode) : null;
        if (!room) return;

        const payload = msg.payload;
        const to = msg.to;

        if (to === 'all') {
          if (m.id !== room.hostId) return;
          broadcast(room, m.id, { op: 'msg', from: m.id, payload });
          return;
        }

        if (typeof to === 'string' && room.clients.has(to)) {
          send(room.clients.get(to), { op: 'msg', from: m.id, payload });
        }
      }
    });

    ws.on('close', () => leaveRoom(ws));
  });

  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of roomsByCode) {
      if (now - room.created > ROOM_TTL_MS) {
        for (const [, sock] of room.clients) {
          send(sock, { op: 'error', message: 'Room expired' });
          try {
            sock.close();
          } catch {
            /* ignore */
          }
        }
        roomsByCode.delete(code);
      }
    }
  }, 60_000);

  return wss;
}
