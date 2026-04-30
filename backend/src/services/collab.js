import { verifyToken } from './authService.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Deterministic peer colour from userId — same user always gets the same colour. */
function peerColor(userId) {
  const PALETTE = [
    '#e11d48', '#2563eb', '#16a34a', '#d97706',
    '#7c3aed', '#0891b2', '#be185d', '#ea580c',
  ];
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Parse the Cookie header without importing the `cookie` package. */
function parseCookieHeader(header = '') {
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    try {
      out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    } catch {
      // malformed value — skip
    }
  });
  return out;
}

// ─── In-process room state ────────────────────────────────────────────────────
//
// rooms: Map<projectId, { members: Map<userId, MemberInfo>, locks: Map<nodeId, LockInfo> }>
//
// Reset on server restart — presence data is ephemeral by design.
// For multi-instance deployments, replace with a Redis adapter:
//   npm i @socket.io/redis-adapter ioredis
//   io.adapter(createAdapter(pubClient, subClient))

const rooms = new Map();

function getRoom(projectId) {
  if (!rooms.has(projectId)) {
    rooms.set(projectId, { members: new Map(), locks: new Map() });
  }
  return rooms.get(projectId);
}

function leaveRoom(socket, projectId) {
  const room = getRoom(projectId);
  const { id: userId } = socket.collab;

  // Release all locks held by this user and collect the released node IDs
  const releasedNodes = [];
  room.locks.forEach((lock, nodeId) => {
    if (lock.userId === userId) {
      room.locks.delete(nodeId);
      releasedNodes.push(nodeId);
    }
  });

  room.members.delete(userId);
  if (room.members.size === 0) rooms.delete(projectId);

  // Notify remaining peers
  socket.to(`project:${projectId}`).emit('user-left', { userId, releasedNodes });
}

// ─── Setup ───────────────────────────────────────────────────────────────────

export function setupCollab(io) {
  // ── Auth middleware — reuse the same JWT cookie as REST ──────────────────
  io.use((socket, next) => {
    try {
      const cookies = parseCookieHeader(socket.handshake.headers.cookie);
      const token = cookies.auth_token;
      if (!token) return next(new Error('Not authenticated'));
      const payload = verifyToken(token);
      socket.collab = {
        id: payload.sub,
        displayName: payload.displayName ?? payload.email,
        color: peerColor(payload.sub),
      };
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { id: userId, displayName, color } = socket.collab;
    let currentProject = null;

    // ── join-project ────────────────────────────────────────────────────────
    socket.on('join-project', (projectId) => {
      if (!projectId || typeof projectId !== 'string') return;

      // Leave previous project if switching
      if (currentProject && currentProject !== projectId) {
        leaveRoom(socket, currentProject);
        socket.leave(`project:${currentProject}`);
      }

      currentProject = projectId;
      socket.join(`project:${projectId}`);

      const room = getRoom(projectId);
      room.members.set(userId, { socketId: socket.id, displayName, color });

      // Send this client the current room state (peers + lock map)
      const peers = [];
      room.members.forEach((m, uid) => {
        if (uid !== userId) peers.push({ userId: uid, displayName: m.displayName, color: m.color });
      });
      const locks = {};
      room.locks.forEach((lock, nodeId) => { locks[nodeId] = lock; });
      socket.emit('room-state', { peers, locks });

      // Notify others
      socket.to(`project:${projectId}`).emit('user-joined', { userId, displayName, color });
    });

    // ── cursor-move (relay only — never stored) ──────────────────────────────
    socket.on('cursor-move', ({ x, y }) => {
      if (!currentProject) return;
      socket.to(`project:${currentProject}`).emit('cursor-moved', { userId, x, y });
    });

    // ── drag-start (acquire lock) ────────────────────────────────────────────
    socket.on('drag-start', ({ nodeIds }) => {
      if (!currentProject || !Array.isArray(nodeIds)) return;
      const room = getRoom(currentProject);
      const acquired = [];
      for (const nodeId of nodeIds) {
        const existing = room.locks.get(nodeId);
        if (existing && existing.userId !== userId) continue; // locked by someone else — skip
        room.locks.set(nodeId, { userId, displayName, color });
        acquired.push(nodeId);
      }
      if (acquired.length) {
        socket.to(`project:${currentProject}`).emit('nodes-locked', {
          userId, displayName, color, nodeIds: acquired,
        });
      }
    });

    // ── drag-move (relay live positions) ────────────────────────────────────
    socket.on('drag-move', ({ moves }) => {
      // moves: Array<{ nodeId: string, position: { x: number, y: number } }>
      if (!currentProject || !Array.isArray(moves)) return;
      const room = getRoom(currentProject);
      // Only relay positions for nodes this user actually has locked
      const allowed = moves.filter((m) => room.locks.get(m.nodeId)?.userId === userId);
      if (allowed.length) {
        socket.to(`project:${currentProject}`).emit('nodes-moved', { userId, moves: allowed });
      }
    });

    // ── drag-end (release locks) ─────────────────────────────────────────────
    socket.on('drag-end', ({ nodeIds }) => {
      if (!currentProject || !Array.isArray(nodeIds)) return;
      const room = getRoom(currentProject);
      const released = [];
      for (const nodeId of nodeIds) {
        if (room.locks.get(nodeId)?.userId === userId) {
          room.locks.delete(nodeId);
          released.push(nodeId);
        }
      }
      if (released.length) {
        socket.to(`project:${currentProject}`).emit('nodes-released', { userId, nodeIds: released });
      }
    });

    // ── disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (currentProject) leaveRoom(socket, currentProject);
    });
  });
}
