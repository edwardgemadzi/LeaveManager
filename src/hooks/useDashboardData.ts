import { useAuthedSWR } from './useAuthedSWR';
import { Team, User, LeaveRequest } from '@/types';

type DashboardOptions = {
  include?: string[];
  members?: 'full' | 'summary' | 'none';
  requestFields?: string[];
  enabled?: boolean;
};

type DashboardResponse = {
  team?: Team;
  currentUser?: User | null;
  members?: User[];
  requests?: LeaveRequest[];
  analytics?: unknown;
};

export const useDashboardData = (options: DashboardOptions = {}) => {
  const { include, members, requestFields, enabled = true } = options;

  const params = new URLSearchParams();
  if (include && include.length > 0) params.set('include', include.join(','));
  if (members) params.set('members', members);
  if (requestFields && requestFields.length > 0) params.set('requestFields', requestFields.join(','));

  const key = `/api/dashboard${params.toString() ? `?${params.toString()}` : ''}`;
  return useAuthedSWR<DashboardResponse>(enabled ? key : null);
};

