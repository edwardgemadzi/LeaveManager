'use client';

/**
 * Local dev: Telegram webhooks require a public HTTPS URL (use a tunnel).
 */
export default function TelegramLocalDevHint() {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="text-xs text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 mt-2 space-y-1.5">
      <p className="font-semibold">Local dev: Telegram webhook</p>
      <ul className="list-disc list-inside text-amber-800 dark:text-amber-200 space-y-1">
        <li>
          Telegram must reach <code className="rounded bg-amber-100 dark:bg-amber-900/60 px-1">/api/telegram/webhook</code>{' '}
          over <strong>HTTPS</strong>. Use a tunnel (e.g. ngrok) and point{' '}
          <code className="rounded px-1 bg-amber-100 dark:bg-amber-900/60">setWebhook</code> at{' '}
          <code className="rounded px-1 bg-amber-100 dark:bg-amber-900/60">https://&lt;tunnel&gt;/api/telegram/webhook</code>.
        </li>
        <li>
          Open the app through the same public URL when testing deep-link linking so cookies and API calls match that
          host.
        </li>
      </ul>
    </div>
  );
}
