import { createHash } from 'crypto';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const analyticsCache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 30 * 1000;

export const buildAnalyticsCacheKey = (teamId: string, year: number, role: string, settings: unknown) => {
  const settingsHash = createHash('sha256')
    .update(JSON.stringify(settings ?? {}))
    .digest('hex');
  return `${teamId}:${year}:${role}:${settingsHash}`;
};

export const getAnalyticsCache = <T,>(key: string): T | null => {
  const entry = analyticsCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    analyticsCache.delete(key);
    return null;
  }
  return entry.value as T;
};

export const setAnalyticsCache = <T,>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS) => {
  analyticsCache.set(key, { value, expiresAt: Date.now() + ttlMs });
};

export const invalidateAnalyticsCache = (teamId?: string) => {
  if (!teamId) {
    analyticsCache.clear();
    return;
  }
  for (const key of analyticsCache.keys()) {
    if (key.startsWith(`${teamId}:`)) {
      analyticsCache.delete(key);
    }
  }
};

