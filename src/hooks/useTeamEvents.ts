'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePolling } from './usePolling';

type EventType = 'leaveRequestCreated' | 'leaveRequestUpdated' | 'leaveRequestDeleted' | 'settingsUpdated' | 'connected' | 'keepalive' | 'error';

type EventData = {
  type: EventType;
  data: unknown;
};

type UseTeamEventsOptions = {
  enabled?: boolean;
  onEvent?: (event: EventData) => void;
  onError?: (error: Error) => void;
  fallbackToPolling?: boolean;
  pollingCallback?: () => Promise<void> | void;
  pollingInterval?: number;
};

/**
 * Custom hook for real-time team updates using Server-Sent Events (SSE)
 * 
 * Automatically falls back to polling if SSE connection fails
 * 
 * @param teamId - The team ID to subscribe to events for
 * @param options - Configuration options
 * @returns Object with connection status and cleanup function
 */
export function useTeamEvents(
  teamId: string | null | undefined,
  options: UseTeamEventsOptions = {}
) {
  const {
    enabled = true,
    onEvent,
    onError,
    fallbackToPolling = true,
    pollingCallback,
    pollingInterval = 30000,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  const onErrorRef = useRef(onError);
  const teamIdRef = useRef(teamId);
  const enabledRef = useRef(enabled);
  const fallbackToPollingRef = useRef(fallbackToPolling);
  const pollingCallbackRef = useRef(pollingCallback);
  const isConnectingRef = useRef(false);

  // Keep refs updated
  useEffect(() => {
    onEventRef.current = onEvent;
    onErrorRef.current = onError;
    teamIdRef.current = teamId;
    enabledRef.current = enabled;
    fallbackToPollingRef.current = fallbackToPolling;
    pollingCallbackRef.current = pollingCallback;
  }, [onEvent, onError, teamId, enabled, fallbackToPolling, pollingCallback]);

  // Set up polling as fallback
  const { start: startPolling, stop: stopPolling } = usePolling(
    pollingCallback || (() => {}),
    {
      interval: pollingInterval,
      enabled: false, // Don't start automatically, will be enabled if SSE fails
      immediate: false,
    }
  );

  // Connect to SSE
  const connect = useCallback(() => {
    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current || eventSourceRef.current?.readyState === EventSource.OPEN) {
      return;
    }

    if (!teamIdRef.current || !enabledRef.current) {
      return;
    }

    // Get token from localStorage
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('[useTeamEvents] No token found, cannot connect to SSE');
      if (fallbackToPollingRef.current && pollingCallbackRef.current) {
        setIsUsingFallback(true);
        startPolling();
      }
      return;
    }

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    isConnectingRef.current = true;

    try {
      // Create EventSource connection
      const eventSource = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
      eventSourceRef.current = eventSource;

      // Handle connection open
      eventSource.onopen = () => {
        console.log('[useTeamEvents] SSE connection opened');
        isConnectingRef.current = false;
        setIsConnected(true);
        setIsUsingFallback(false);
        stopPolling(); // Stop polling if SSE is working
      };

      // Handle messages
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const eventType = event.type as EventType || 'message';
          
          // Handle keepalive events (silently)
          if (eventType === 'keepalive') {
            return;
          }

          // Handle connected events
          if (eventType === 'connected') {
            setIsConnected(true);
            setIsUsingFallback(false);
            stopPolling(); // Stop polling if SSE is working
            return;
          }

          // Handle error events
          if (eventType === 'error') {
            const error = new Error(data.message || 'Unknown error');
            if (onErrorRef.current) {
              onErrorRef.current(error);
            }
            // Fallback to polling if error occurs
            if (fallbackToPollingRef.current && pollingCallbackRef.current) {
              isConnectingRef.current = false;
              setIsUsingFallback(true);
              setIsConnected(false);
              eventSource.close();
              startPolling();
            }
            return;
          }

          // Call custom event handler
          if (onEventRef.current) {
            onEventRef.current({
              type: eventType,
              data,
            });
          }
        } catch (error) {
          console.error('[useTeamEvents] Error parsing event data:', error);
        }
      };

      // Handle specific event types
      eventSource.addEventListener('leaveRequestCreated', (event: MessageEvent) => {
        try {
          console.log('[useTeamEvents] Received leaveRequestCreated event:', event.data);
          const data = JSON.parse(event.data);
          if (onEventRef.current) {
            onEventRef.current({
              type: 'leaveRequestCreated',
              data,
            });
          }
        } catch (error) {
          console.error('[useTeamEvents] Error handling leaveRequestCreated:', error);
        }
      });

      eventSource.addEventListener('leaveRequestUpdated', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (onEventRef.current) {
            onEventRef.current({
              type: 'leaveRequestUpdated',
              data,
            });
          }
        } catch (error) {
          console.error('[useTeamEvents] Error handling leaveRequestUpdated:', error);
        }
      });

      eventSource.addEventListener('leaveRequestDeleted', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (onEventRef.current) {
            onEventRef.current({
              type: 'leaveRequestDeleted',
              data,
            });
          }
        } catch (error) {
          console.error('[useTeamEvents] Error handling leaveRequestDeleted:', error);
        }
      });

      eventSource.addEventListener('settingsUpdated', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (onEventRef.current) {
            onEventRef.current({
              type: 'settingsUpdated',
              data,
            });
          }
        } catch (error) {
          console.error('[useTeamEvents] Error handling settingsUpdated:', error);
        }
      });

      // Handle connection errors
      eventSource.onerror = (error) => {
        console.error('[useTeamEvents] SSE connection error:', error);
        console.error('[useTeamEvents] EventSource readyState:', eventSource.readyState);
        setIsConnected(false);
        
        // Only reconnect if connection was actually closed (not just a temporary error)
        if (eventSource.readyState === EventSource.CLOSED) {
          isConnectingRef.current = false;
          // Fallback to polling if connection fails
          if (fallbackToPollingRef.current && pollingCallbackRef.current) {
            console.log('[useTeamEvents] Falling back to polling');
            setIsUsingFallback(true);
            eventSource.close();
            startPolling();
          } else if (onErrorRef.current) {
            onErrorRef.current(new Error('SSE connection failed'));
          }
        }
      };
    } catch (error) {
      console.error('[useTeamEvents] Error creating EventSource:', error);
      isConnectingRef.current = false;
      setIsConnected(false);
      
      // Fallback to polling if initialization fails
      if (fallbackToPollingRef.current && pollingCallbackRef.current) {
        setIsUsingFallback(true);
        startPolling();
      } else if (onErrorRef.current) {
        onErrorRef.current(error instanceof Error ? error : new Error('Failed to create EventSource'));
      }
    }
  }, [startPolling, stopPolling]);

  // Cleanup function
  const disconnect = useCallback(() => {
    isConnectingRef.current = false;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
    stopPolling();
  }, [stopPolling]);

  // Connect on mount and when teamId or enabled changes
  useEffect(() => {
    if (enabled && teamId) {
      connect();
    } else {
      disconnect();
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, teamId]); // Only depend on actual values, not functions

  return {
    isConnected,
    isUsingFallback,
    connect,
    disconnect,
  };
}

