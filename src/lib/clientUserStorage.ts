/**
 * Client-only helpers for the cached user blob in localStorage.
 * Dispatching {@link LEAVE_MANAGER_USER_STORAGE_EVENT} keeps Navbar and other UI in sync
 * when profile/auth updates the stored user without a route change.
 */
export const LEAVE_MANAGER_USER_STORAGE_EVENT = 'leaveManager:userStorageUpdated';

export function notifyUserStorageUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LEAVE_MANAGER_USER_STORAGE_EVENT));
}

export function setStoredUser(user: unknown): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('user', JSON.stringify(user));
  notifyUserStorageUpdated();
}

export function clearStoredUser(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('user');
  notifyUserStorageUpdated();
}
