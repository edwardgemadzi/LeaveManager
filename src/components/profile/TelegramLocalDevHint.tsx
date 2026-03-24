'use client';

/**
 * Telegram Login Widget only works when the browser hostname matches
 * the domain set via @BotFather → /setdomain (localhost ≠ 127.0.0.1).
 */
export default function TelegramLocalDevHint() {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="text-xs text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 mt-2 space-y-1.5">
      <p className="font-semibold">Local dev: “Bot domain invalid”</p>
      <ul className="list-disc list-inside text-amber-800 dark:text-amber-200 space-y-1">
        <li>
          In @BotFather run <code className="rounded bg-amber-100 dark:bg-amber-900/60 px-1">/setdomain</code>{' '}
          and enter the <strong>exact</strong> hostname you use in the address bar — no{' '}
          <code className="rounded px-1 bg-amber-100 dark:bg-amber-900/60">http://</code> or port.
        </li>
        <li>
          If you open <code className="rounded px-1 bg-amber-100 dark:bg-amber-900/60">http://localhost:3000</code>,
          set domain to <code className="rounded px-1 bg-amber-100 dark:bg-amber-900/60">localhost</code>.
          Do <strong>not</strong> use <code className="rounded px-1 bg-amber-100 dark:bg-amber-900/60">127.0.0.1</code>{' '}
          in the browser unless BotFather has <code className="rounded px-1 bg-amber-100 dark:bg-amber-900/60">127.0.0.1</code>{' '}
          (Telegram treats them as different sites).
        </li>
        <li>
          If BotFather refuses <code className="rounded px-1 bg-amber-100 dark:bg-amber-900/60">localhost</code>, use a
          tunnel (e.g. ngrok) with HTTPS, set <code className="rounded px-1 bg-amber-100 dark:bg-amber-900/60">/setdomain</code>{' '}
          to that hostname, and open the app via the tunnel URL.
        </li>
      </ul>
    </div>
  );
}
