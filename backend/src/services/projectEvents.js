import { EventEmitter } from 'events';

/**
 * In-process event bus for real-time canvas collaboration.
 *
 * One EventEmitter per process, one listener per connected SSE client.
 * When any entity is mutated, the route calls emitEntityChanged().
 * All clients watching that project receive a push and invalidate their cache.
 *
 * Scalability note: for multi-process / multi-instance deployments, replace
 * the EventEmitter bus with Redis pub/sub (ioredis). The exported interface
 * is identical — only this file changes.
 */
const bus = new EventEmitter();
bus.setMaxListeners(0); // one listener per SSE client, removed on close

/**
 * Broadcast an entity-changed signal to all clients watching a project.
 * Fire-and-forget — errors are swallowed so a bad listener never breaks a write.
 *
 * @param {string} projectId
 * @param {string} entityType  'codes' | 'themes' | 'insights' | 'annotations'
 */
export function emitEntityChanged(projectId, entityType) {
  if (!projectId) return;
  try {
    bus.emit(`project:${projectId}`, { type: 'entity-changed', entityType });
  } catch {
    // never propagate to the caller
  }
}

/**
 * Broadcast a job state change (progress, complete, error) to all clients watching a project.
 * The client uses this to invalidate the latestJob query for the relevant media file without polling.
 *
 * @param {string} projectId
 * @param {string} mediaFileId
 */
export function emitJobProgress(projectId, mediaFileId) {
  if (!projectId) return;
  try {
    bus.emit(`project:${projectId}`, { type: 'job-progress', mediaFileId });
  } catch {
    // never propagate to the caller
  }
}

/**
 * Subscribe to entity events for a project.
 * Returns an unsubscribe function — call it when the SSE connection closes.
 *
 * @param {string} projectId
 * @param {(msg: {type: string, entityType: string}) => void} handler
 * @returns {() => void} unsubscribe
 */
export function subscribeToProject(projectId, handler) {
  const event = `project:${projectId}`;
  bus.on(event, handler);
  return () => bus.off(event, handler);
}
