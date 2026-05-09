import type { User } from '@/types';

/** Display name for calendar labels and notifications (first/middle/last, then legacy fullName, then username). */
export function userDisplayName(user: User | null | undefined, fallback = 'Member'): string {
  if (!user) return fallback;
  const first = (user.firstName || '').trim();
  const middle = (user.middleName || '').trim();
  const last = (user.lastName || '').trim();
  const parts = [first, middle, last].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  const legacy = (user.fullName || '').trim();
  if (legacy) return legacy;
  return user.username?.trim() || fallback;
}
