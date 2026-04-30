import { useEffect, useRef, useCallback, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PeerInfo {
  userId: string;
  displayName: string;
  color: string;
  cursor: { x: number; y: number } | null;
}

export interface NodeLock {
  userId: string;
  displayName: string;
  color: string;
}

interface UseCollaborationOptions {
  projectId: string | null | undefined;
  userId: string | undefined;
  /** Called for each remote live-drag position update so FlowCanvas can apply it immediately. */
  onRemoteNodeMoves: (moves: Array<{ nodeId: string; position: { x: number; y: number } }>) => void;
}

export interface UseCollaborationResult {
  /** All peers currently in the same project room, keyed by userId. */
  peers: Map<string, PeerInfo>;
  /** Nodes currently locked by another user, keyed by nodeId. */
  lockedBy: Map<string, NodeLock>;
  /** Emit cursor world position (~30fps throttled). */
  emitCursorMove: (x: number, y: number) => void;
  /** Acquire drag lock for one or more nodes. */
  emitDragStart: (nodeIds: string[]) => void;
  /** Send live positions during drag — server relays to peers. */
  emitDragMove: (moves: Array<{ nodeId: string; position: { x: number; y: number } }>) => void;
  /** Release drag lock. */
  emitDragEnd: (nodeIds: string[]) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const CURSOR_THROTTLE_MS = 33; // ~30 fps

export function useCollaboration({
  projectId,
  userId,
  onRemoteNodeMoves,
}: UseCollaborationOptions): UseCollaborationResult {
  const socketRef = useRef<Socket | null>(null);
  const [peers, setPeers] = useState<Map<string, PeerInfo>>(new Map());
  const [lockedBy, setLockedBy] = useState<Map<string, NodeLock>>(new Map());
  const lastCursorEmit = useRef(0);
  const onRemoteNodeMovesRef = useRef(onRemoteNodeMoves);
  onRemoteNodeMovesRef.current = onRemoteNodeMoves;

  useEffect(() => {
    if (!projectId || !userId) return;

    const socket = io('/', {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-project', projectId);
    });

    socket.on('room-state', ({
      peers: initialPeers,
      locks,
    }: {
      peers: Array<{ userId: string; displayName: string; color: string }>;
      locks: Record<string, NodeLock>;
    }) => {
      setPeers(new Map(initialPeers.map((p) => [p.userId, { ...p, cursor: null }])));
      setLockedBy(new Map(Object.entries(locks)));
    });

    socket.on('user-joined', (p: { userId: string; displayName: string; color: string }) => {
      if (p.userId === userId) return;
      setPeers((prev) => new Map(prev).set(p.userId, { ...p, cursor: null }));
    });

    socket.on('user-left', ({ userId: leftId, releasedNodes }: { userId: string; releasedNodes: string[] }) => {
      setPeers((prev) => { const m = new Map(prev); m.delete(leftId); return m; });
      if (releasedNodes.length) {
        setLockedBy((prev) => {
          const m = new Map(prev);
          releasedNodes.forEach((n) => m.delete(n));
          return m;
        });
      }
    });

    socket.on('cursor-moved', ({ userId: uid, x, y }: { userId: string; x: number; y: number }) => {
      setPeers((prev) => {
        const peer = prev.get(uid);
        if (!peer) return prev;
        return new Map(prev).set(uid, { ...peer, cursor: { x, y } });
      });
    });

    socket.on('nodes-locked', ({
      userId: uid,
      displayName,
      color,
      nodeIds,
    }: { userId: string; displayName: string; color: string; nodeIds: string[] }) => {
      if (uid === userId) return;
      setLockedBy((prev) => {
        const m = new Map(prev);
        nodeIds.forEach((nodeId) => m.set(nodeId, { userId: uid, displayName, color }));
        return m;
      });
    });

    socket.on('nodes-moved', ({ moves }: { moves: Array<{ nodeId: string; position: { x: number; y: number } }> }) => {
      onRemoteNodeMovesRef.current(moves);
    });

    socket.on('nodes-released', ({ nodeIds }: { nodeIds: string[] }) => {
      setLockedBy((prev) => {
        const m = new Map(prev);
        nodeIds.forEach((n) => m.delete(n));
        return m;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setPeers(new Map());
      setLockedBy(new Map());
    };
  }, [projectId, userId]);

  const emitCursorMove = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - lastCursorEmit.current < CURSOR_THROTTLE_MS) return;
    lastCursorEmit.current = now;
    socketRef.current?.emit('cursor-move', { x, y });
  }, []);

  const emitDragStart = useCallback((nodeIds: string[]) => {
    socketRef.current?.emit('drag-start', { nodeIds });
  }, []);

  const emitDragMove = useCallback((moves: Array<{ nodeId: string; position: { x: number; y: number } }>) => {
    socketRef.current?.emit('drag-move', { moves });
  }, []);

  const emitDragEnd = useCallback((nodeIds: string[]) => {
    socketRef.current?.emit('drag-end', { nodeIds });
  }, []);

  return { peers, lockedBy, emitCursorMove, emitDragStart, emitDragMove, emitDragEnd };
}
