/**
 * Event broadcasting system for team-wide updates
 * 
 * This is an in-memory event system suitable for single-server deployments.
 * For multi-server deployments, you would need Redis Pub/Sub or similar.
 * 
 * Events are scoped to teamId for privacy and security.
 */

type EventType = 'leaveRequestCreated' | 'leaveRequestUpdated' | 'leaveRequestDeleted' | 'settingsUpdated';

type EventData = {
  type: EventType;
  teamId: string;
  data: unknown;
};

type EventCallback = (event: EventData) => void;

// Map of teamId -> Set of callbacks
const eventListeners = new Map<string, Set<EventCallback>>();

/**
 * Broadcast an event to all listeners for a team
 */
export function broadcastTeamUpdate(
  teamId: string,
  type: EventType,
  data: unknown
): void {
  const listeners = eventListeners.get(teamId);
  if (!listeners || listeners.size === 0) {
    return;
  }

  const event: EventData = {
    type,
    teamId,
    data,
  };

  // Broadcast to all listeners
  listeners.forEach((callback) => {
    try {
      callback(event);
    } catch (error) {
      console.error(`Error in event callback for team ${teamId}:`, error);
    }
  });
}

/**
 * Subscribe to events for a team
 * Returns an unsubscribe function
 */
export function subscribeToTeamEvents(
  teamId: string,
  callback: EventCallback
): () => void {
  if (!eventListeners.has(teamId)) {
    eventListeners.set(teamId, new Set());
  }

  const listeners = eventListeners.get(teamId)!;
  listeners.add(callback);

  // Return unsubscribe function
  return () => {
    unsubscribeFromTeamEvents(teamId, callback);
  };
}

/**
 * Unsubscribe a callback from team events
 */
export function unsubscribeFromTeamEvents(
  teamId: string,
  callback: EventCallback
): void {
  const listeners = eventListeners.get(teamId);
  if (!listeners) {
    return;
  }

  listeners.delete(callback);

  // Clean up empty sets to prevent memory leaks
  if (listeners.size === 0) {
    eventListeners.delete(teamId);
  }
}

/**
 * Get the number of active listeners for a team (for debugging)
 */
export function getListenerCount(teamId: string): number {
  return eventListeners.get(teamId)?.size || 0;
}

