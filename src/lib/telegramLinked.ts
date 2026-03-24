import type { User } from '@/types';

/** True if profile has a stored Telegram user id (string, number, or BSON-serialized value). */
export function isTelegramLinked(user: User | null | undefined): boolean {
  if (!user) return false;
  const id = (user as { telegramUserId?: unknown }).telegramUserId;
  if (id === undefined || id === null) return false;
  return String(id).trim() !== '';
}
