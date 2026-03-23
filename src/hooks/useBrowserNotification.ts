'use client';

import { useCallback } from 'react';

type BrowserNotificationMeta = {
  dedupeKey?: string;
  cooldownMs?: number;
  requestPermission?: boolean;
};

const recentNotificationByKey = new Map<string, number>();
let permissionRequestedThisSession = false;

export function useBrowserNotification() {
  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }, []);

  const showNotification = useCallback(async (
    title: string,
    body: string,
    options?: NotificationOptions,
    meta?: BrowserNotificationMeta
  ) => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    const dedupeKey = meta?.dedupeKey || `${title}:${body}`;
    const cooldownMs = meta?.cooldownMs ?? 15000;
    const now = Date.now();
    const lastShownAt = recentNotificationByKey.get(dedupeKey) ?? 0;
    if (now - lastShownAt < cooldownMs) {
      return;
    }

    const shouldRequestPermission = meta?.requestPermission ?? false;
    let hasPermission = Notification.permission === 'granted';

    if (!hasPermission && shouldRequestPermission && !permissionRequestedThisSession) {
      permissionRequestedThisSession = true;
      hasPermission = await requestPermission();
    }

    if (!hasPermission) {
      console.log(`[Notification] ${title}: ${body}`);
      return;
    }

    recentNotificationByKey.set(dedupeKey, now);
    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: dedupeKey,
      requireInteraction: false,
      silent: false,
      ...options,
    });

    // Auto-close after 5 seconds
    setTimeout(() => {
      notification.close();
    }, 5000);

    // Focus window on click
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }, [requestPermission]);

  return {
    showNotification,
    requestPermission,
  };
}

