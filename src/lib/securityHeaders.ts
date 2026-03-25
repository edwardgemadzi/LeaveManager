/**
 * Headers for JSON responses that must not be cached (sessions, credentials, user identity).
 * Mitigates shared-cache and browser history leakage of sensitive API payloads.
 */
export const NO_STORE_JSON_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
};
