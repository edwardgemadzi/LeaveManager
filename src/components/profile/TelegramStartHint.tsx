'use client';

/**
 * Telegram bots cannot DM a user until they open the bot in Telegram and tap Start.
 * The Login Widget only proves identity on the website.
 */
export default function TelegramStartHint({ botUsername }: { botUsername: string }) {
  const handle = botUsername.trim().replace(/^@/, '');
  const href = `https://t.me/${handle}`;

  return (
    <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 mt-2">
      <strong>To get messages:</strong> open{' '}
      <a href={href} target="_blank" rel="noreferrer" className="underline font-medium">
        @{handle}
      </a>{' '}
      in the Telegram app and tap <strong>Start</strong>. Entering your phone number in the
      login window only verifies your account; it does not open the bot chat, so the bot cannot
      send you leave updates until you start the bot once.
    </p>
  );
}
