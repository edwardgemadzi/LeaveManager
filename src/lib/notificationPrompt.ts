export function getNotificationPromptVersion(): number {
  return Number.parseInt(process.env.NEXT_PUBLIC_NOTIFICATION_PROMPT_VERSION || '1', 10);
}

/** True if the user should see the “add email / stay updated” banner. */
export function computeNeedsNotificationSetup(u: {
  email?: string | null;
  notificationPromptVersionSeen?: number;
}): boolean {
  const seen = u.notificationPromptVersionSeen ?? 0;
  // Always respect a dismiss — if the user has acknowledged the current version, don't show.
  if (seen >= getNotificationPromptVersion()) return false;
  // Show only if no email is set (primary goal of the banner).
  return !String(u.email || '').trim();
}
