'use client';

import { useCallback } from 'react';

export type NotificationType = 'success' | 'error' | 'info';

export function useNotification() {
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
    message: string,
    type: NotificationType = 'info'
  ) => {
    const hasPermission = await requestPermission();
    
    if (!hasPermission) {
      // Fallback to console if permission denied
      console.log(`[${type.toUpperCase()}] ${message}`);
      return;
    }

    const titles = {
      success: 'Success',
      error: 'Error',
      info: 'Info'
    };

    const notification = new Notification(titles[type], {
      body: message,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `notification-${Date.now()}`, // Unique tag to prevent duplicates
      requireInteraction: false,
      silent: false,
    });

    // Auto-close after 2 seconds
    setTimeout(() => {
      notification.close();
    }, 2000);

    // Focus window on click
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }, [requestPermission]);

  const showSuccess = useCallback((message: string) => {
    return showNotification(message, 'success');
  }, [showNotification]);

  const showError = useCallback((message: string) => {
    return showNotification(message, 'error');
  }, [showNotification]);

  const showInfo = useCallback((message: string) => {
    return showNotification(message, 'info');
  }, [showNotification]);

  return {
    showNotification,
    showSuccess,
    showError,
    showInfo,
    requestPermission,
  };
}

