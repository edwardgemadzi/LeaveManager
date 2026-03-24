export function getNotificationPromptVersion(): number {
  return Number.parseInt(process.env.NEXT_PUBLIC_NOTIFICATION_PROMPT_VERSION || '1', 10);
}

/** True if the user should see the “add email / stay updated” banner. */
export function computeNeedsNotificationSetup(u: {
  email?: string | null;
  notificationPromptVersionSeen?: number;
}): boolean {
  if (!String(u.email || '').trim()) {
    return true;
  }
  const seen = u.notificationPromptVersionSeen ?? 0;
  return seen < getNotificationPromptVersion();
}
