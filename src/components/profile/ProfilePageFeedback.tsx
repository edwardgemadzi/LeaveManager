'use client';

type Props = {
  error: string;
  message: string;
  id?: string;
};

/** Page-level alerts so Telegram / profile actions aren’t hidden inside the password card. */
export default function ProfilePageFeedback({ error, message, id = 'profile-page-feedback' }: Props) {
  if (!error && !message) return null;
  return (
    <div id={id} className="mb-6 space-y-3" role="status" aria-live="polite">
      {error ? (
        <div className="text-red-800 dark:text-red-200 text-sm bg-red-50 dark:bg-red-950/40 p-4 rounded-lg border border-red-200 dark:border-red-800 font-medium">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="text-green-800 dark:text-green-200 text-sm bg-green-50 dark:bg-green-950/40 p-4 rounded-lg border border-green-200 dark:border-green-800 font-medium">
          {message}
        </div>
      ) : null}
    </div>
  );
}
