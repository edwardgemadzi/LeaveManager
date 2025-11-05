'use client';

import { useToast } from '@/contexts/ToastContext';

export type NotificationType = 'success' | 'error' | 'info';

/**
 * Hook for showing notifications
 * Uses toast notifications (in-app, non-blocking) by default
 * For backward compatibility with existing code
 */
export function useNotification() {
  const { showSuccess, showError, showInfo, showToast } = useToast();

  return {
    showNotification: showToast,
    showSuccess,
    showError,
    showInfo,
  };
}

