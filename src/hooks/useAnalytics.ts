import { useAuthedSWR } from './useAuthedSWR';

type AnalyticsOptions = {
  year?: number;
  enabled?: boolean;
};

export const useAnalytics = (options: AnalyticsOptions = {}) => {
  const { year, enabled = true } = options;
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));

  const key = `/api/analytics${params.toString() ? `?${params.toString()}` : ''}`;
  return useAuthedSWR<Record<string, unknown>>(enabled ? key : null);
};

