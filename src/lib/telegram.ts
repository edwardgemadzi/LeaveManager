/**
 * Telegram Bot API — send messages to a user who has linked their account.
 * Requires TELEGRAM_BOT_TOKEN. Never throws from public helpers.
 *
 * Note: Telegram only delivers private DMs after the user has opened the bot
 * in Telegram and tapped **Start** (or messaged the bot). The website Login Widget
 * alone does not open that chat — see profile hint + .env.example.
 */

export type TelegramSendOutcome =
  | { ok: true }
  | { ok: false; description: string };

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

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: params.chatId,
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
      if (process.env.NODE_ENV === 'development') {
        console.error('[telegram] sendMessage failed:', description);
      } else {
        console.error('[telegram] sendMessage failed');
      }
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
