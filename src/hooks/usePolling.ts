'use client';

import { useEffect, useRef, useCallback } from 'react';

interface UsePollingOptions {
  interval?: number;
  enabled?: boolean;
  immediate?: boolean;
}

export function usePolling(
  callback: () => Promise<void> | void,
  options: UsePollingOptions = {}
) {
  const { interval = 30000, enabled = true, immediate = false } = options;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  const enabledRef = useRef(enabled);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Keep enabled ref updated
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const start = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const poll = async () => {
      if (enabledRef.current) {
        await callbackRef.current();
      }
    };

    // Run immediately if requested
    if (immediate && enabled) {
      poll();
    }

    // Set up interval
    intervalRef.current = setInterval(poll, interval);
  }, [interval, enabled, immediate]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }

    return () => {
      stop();
    };
  }, [enabled, start, stop]);

  return {
    start,
    stop,
    isActive: intervalRef.current !== null,
  };
}

