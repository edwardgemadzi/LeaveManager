import crypto from 'crypto';

/**
 * Verify Telegram Login Widget payload per https://core.telegram.org/widgets/login
 */
export function verifyTelegramLoginPayload(data: Record<string, string | undefined>): boolean {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    return false;
  }
  const hash = data.hash;
  if (!hash || typeof hash !== 'string') {
    return false;
  }

  const entries = Object.entries(data).filter(([k, v]) => k !== 'hash' && v !== undefined && v !== '');
  entries.sort(([a], [b]) => a.localeCompare(b));
  const checkString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');

  if (hmac !== hash) {
    return false;
  }

  const authDate = Number(data.auth_date);
  if (!Number.isFinite(authDate)) {
    return false;
  }
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > 86400) {
    return false;
  }

  return true;
}
