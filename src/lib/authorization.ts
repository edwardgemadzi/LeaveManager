import { Team, User } from '@/types';

type AuthLike = {
  id: string;
  role: 'leader' | 'member';
};

function isDateWithinWindow(now: Date, startsAt: Date, endsAt: Date): boolean {
  return now >= new Date(startsAt) && now <= new Date(endsAt);
}

export function getAccessRole(user: Pick<User, 'role' | 'accessRole'>): string {
  return user.accessRole || user.role;
}

export function canApproveLeave(params: {
  authUser: AuthLike;
  actorProfile: User | null;
  team: Team | null;
  targetMemberId?: string;
  now?: Date;
}): {
  allowed: boolean;
  mode: 'leader' | 'delegated' | null;
  delegationMeta?: { delegatedBy?: string; scope?: string };
} {
  const now = params.now ?? new Date();
  const actorRole = getAccessRole(params.actorProfile ?? { role: params.authUser.role });
  if (params.authUser.role === 'leader' || actorRole === 'hr_admin') {
    return { allowed: true, mode: 'leader' };
  }

  const windows = params.team?.settings?.delegatedApprovers || [];
  const window = windows.find((entry) => {
    if (entry.userId !== params.authUser.id) return false;
    if (!isDateWithinWindow(now, entry.startsAt, entry.endsAt)) return false;
    if (!params.targetMemberId || entry.scope === 'all' || entry.scope === 'team' || !entry.scope) return true;
    if (entry.scope === 'member') {
      return (entry.memberIds || []).includes(params.targetMemberId);
    }
    return false;
  });

  if (window) {
    return {
      allowed: true,
      mode: 'delegated',
      delegationMeta: {
        delegatedBy: window.createdBy,
        scope: window.scope || 'team',
      },
    };
  }

  return { allowed: false, mode: null };
}

