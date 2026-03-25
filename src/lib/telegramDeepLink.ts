import crypto from 'crypto';

/** How long a deep-link token stays valid (Telegram app flow). */
export const TELEGRAM_DEEP_LINK_TTL_MS = 15 * 60 * 1000;

/**
 * Telegram deep-link start payload: 1–64 chars, [A-Za-z0-9_-].
 * https://core.telegram.org/bots/features#deep-linking
 */
export function generateTelegramDeepLinkToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Parse /start payload from a private chat message (optionally /start@BotName payload).
 */
export function parseStartDeepLinkPayload(text: string | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  const m = t.match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]+))?$/);
  if (!m?.[1]) return null;
  return m[1].length > 64 ? null : m[1];
}
