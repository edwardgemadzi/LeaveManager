import { Long } from 'mongodb';

/**
 * Telegram Bot API — send messages to a user who has linked their account.
 * Requires TELEGRAM_BOT_TOKEN. Never throws from public helpers.
 *
 * Note: Telegram only delivers private DMs after the user has opened the bot
 * in Telegram and tapped **Start** (or messaged the bot). Linking from the profile alone
 * does not open that chat until they start the bot — see profile hint + .env.example.
 */

export type TelegramSendOutcome =
  | { ok: true }
  | { ok: false; description: string };

/** Telegram user IDs are decimal strings; normalize from DB (number, string, BSON Long, etc.). */
export function normalizeTelegramUserChatId(
  raw: string | number | bigint | Long | null | undefined
): string | null {
  if (raw === undefined || raw === null) return null;
  if (Long.isLong(raw)) {
    const s = raw.toString();
    return /^\d+$/.test(s) ? s : null;
  }
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  return s;
}

export type TelegramBotIdentity =
  | { ok: true; username: string; id: number }
  | { ok: false; description: string };

export async function getTelegramBotIdentity(): Promise<TelegramBotIdentity> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { ok: false, description: 'TELEGRAM_BOT_TOKEN not configured' };
  }
  const url = `https://api.telegram.org/bot${token}/getMe`;
  try {
    const res = await fetch(url, { method: 'GET' });
    const data = (await res.json()) as {
      ok?: boolean;
      result?: { username?: string; id?: number };
      description?: string;
    };
    if (!res.ok || !data.ok || !data.result?.username) {
      return {
        ok: false,
        description: data?.description || `getMe HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      username: data.result.username,
      id: data.result.id ?? 0,
    };
  } catch (e) {
    return {
      ok: false,
      description: e instanceof Error ? e.message : 'getMe network error',
    };
  }
}

/** Compare token bot to NEXT_PUBLIC_TELEGRAM_BOT_USERNAME (widget bot). */
export function telegramPublicUsernameMatchesTokenBot(
  tokenBotUsername: string
): { matches: true } | { matches: false; expected: string; actual: string } {
  const expected = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
  if (!expected) {
    return { matches: true };
  }
  const a = expected.toLowerCase();
  const b = tokenBotUsername.trim().toLowerCase();
  if (a === b) return { matches: true };
  return { matches: false, expected: expected, actual: tokenBotUsername };
}

export async function sendTelegramMessageWithOutcome(params: {
  chatId: string;
  text: string;
}): Promise<TelegramSendOutcome> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[telegram] TELEGRAM_BOT_TOKEN not set — Telegram sending is disabled.');
    }
    return { ok: false, description: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  const chatId = normalizeTelegramUserChatId(params.chatId);
  if (!chatId) {
    return { ok: false, description: 'Invalid Telegram user id (chat_id)' };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: params.text,
        disable_web_page_preview: true,
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      description?: string;
    };
    if (!res.ok || !data.ok) {
      const description = data?.description || `HTTP ${res.status}`;
      console.error('[telegram] sendMessage failed:', description);
      return { ok: false, description };
    }
    return { ok: true };
  } catch (e) {
    console.error('[telegram] sendMessage error:', e);
    return { ok: false, description: e instanceof Error ? e.message : 'network error' };
  }
}

export async function sendTelegramMessage(params: {
  chatId: string;
  text: string;
}): Promise<boolean> {
  const out = await sendTelegramMessageWithOutcome(params);
  return out.ok;
}
