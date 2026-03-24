/**
 * Telegram Bot API — send messages to a user who has linked their account.
 * Requires TELEGRAM_BOT_TOKEN. Never throws from public helpers.
 */

export async function sendTelegramMessage(params: {
  chatId: string;
  text: string;
}): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[telegram] TELEGRAM_BOT_TOKEN not set — Telegram sending is disabled.');
    }
    return false;
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
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
      console.error('[telegram] sendMessage failed:', data?.description || res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[telegram] sendMessage error:', e);
    return false;
  }
}
