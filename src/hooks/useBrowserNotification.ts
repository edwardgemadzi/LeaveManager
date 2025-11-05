'use client';

import { useCallback } from 'react';

export function useBrowserNotification() {
  const requestPermission = useCallback(async () => {
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
    options?: NotificationOptions
  ) => {
    const hasPermission = await requestPermission();
    
    if (!hasPermission) {
      // Fallback to console if permission denied
      console.log(`[Notification] ${title}: ${body}`);
      return;
    }

    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `notification-${Date.now()}`, // Unique tag to prevent duplicates
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

