import { Team, User } from '@/types';
import { useAuthedSWR } from './useAuthedSWR';

type TeamDataResponse = {
  team?: Team;
  currentUser?: User | null;
  members?: User[];
};

type TeamDataOptions = {
  members?: 'full' | 'summary' | 'none';
  currentUser?: 'full' | 'none';
};

export const useTeamData = (options: TeamDataOptions = {}) => {
  const params = new URLSearchParams();
  if (options.members) {
    params.set('members', options.members);
  }
  if (options.currentUser === 'none') {
    params.set('currentUser', 'none');
  }

  const query = params.toString();
  const key = `/api/team${query ? `?${query}` : ''}`;
  return useAuthedSWR<TeamDataResponse>(key);
};

