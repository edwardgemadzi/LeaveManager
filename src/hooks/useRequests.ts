import { LeaveRequest } from '@/types';
import { useAuthedSWR } from './useAuthedSWR';

type RequestsOptions = {
  teamId?: string | null;
  includeDeleted?: boolean;
  status?: string[];
  userId?: string;
  fields?: string[];
  enabled?: boolean;
};

export const useRequests = (options: RequestsOptions = {}) => {
  const {
    teamId,
    includeDeleted,
    status,
    userId,
    fields,
    enabled = true,
  } = options;

  const params = new URLSearchParams();
  if (teamId) params.set('teamId', teamId);
  if (includeDeleted) params.set('includeDeleted', 'true');
  if (status && status.length > 0) params.set('status', status.join(','));
  if (userId) params.set('userId', userId);
  if (fields && fields.length > 0) params.set('fields', fields.join(','));

  const key = `/api/leave-requests${params.toString() ? `?${params.toString()}` : ''}`;
  return useAuthedSWR<LeaveRequest[]>(enabled ? key : null);
};

