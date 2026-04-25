import type { TeamSettings } from '@/types';

/**
 * Get the display name for a working days group.
 * Returns the custom name if set, otherwise returns the technical tag or a default message.
 * 
 * @param workingDaysTag - The technical working days tag (e.g., "MTWTF__")
 * @param teamSettings - Optional team settings containing workingDaysGroupNames mapping
 * @returns The display name for the group
 */
export function getWorkingDaysGroupDisplayName(
  workingDaysTag: string | undefined,
  teamSettings?: TeamSettings
): string {
  if (!workingDaysTag) {
    return 'No Schedule';
  }

  // If custom name exists, return it
  if (teamSettings?.workingDaysGroupNames?.[workingDaysTag]) {
    return teamSettings.workingDaysGroupNames[workingDaysTag];
  }

  // Otherwise return the technical tag
  return workingDaysTag;
}

/**
 * Get the display name with technical tag in parentheses for clarity.
 * Format: "Custom Name (MTWTF__)" or just "MTWTF__" if no custom name.
 * 
 * @param workingDaysTag - The technical working days tag
 * @param teamSettings - Optional team settings containing workingDaysGroupNames mapping
 * @returns The display name with technical tag
 */
export function getWorkingDaysGroupDisplayNameWithTag(
  workingDaysTag: string | undefined,
  teamSettings?: TeamSettings
): string {
  if (!workingDaysTag) {
    return 'No Schedule';
  }

  const customName = teamSettings?.workingDaysGroupNames?.[workingDaysTag];
  
  if (customName) {
    return `${customName} (${workingDaysTag})`;
  }

  return workingDaysTag;
}

/**
 * Compare two team IDs consistently, handling ObjectId and string formats.
 * Normalizes both IDs to strings and trims whitespace before comparison.
 * 
 * @param id1 - First team ID (can be string or ObjectId)
 * @param id2 - Second team ID (can be string or ObjectId)
 * @returns true if both IDs match after normalization, false otherwise
 */
export function teamIdsMatch(id1: string | undefined, id2: string | undefined): boolean {
  if (!id1 || !id2) return false;
  return id1.toString().trim() === id2.toString().trim();
}

/**
 * Convert a fixed working days tag back to a pattern array.
 * Only works for fixed schedules (tags like "MTWTF__").
 * 
 * @param tag - The working days tag (e.g., "MTWTF__")
 * @returns Pattern array [true, true, true, true, true, false, false] for Monday-Friday
 */
export function tagToFixedPattern(tag: string): boolean[] | null {
  if (!tag || tag === 'no-schedule') {
    return null;
  }

  // Check if it's a fixed schedule tag (contains letters M, T, W, T, F, S, S and underscores)
  // Rotating schedules use binary strings like "1010101010"
  if (/^[01]+$/.test(tag)) {
    // This is a rotating schedule tag (binary), can't convert to fixed pattern
    return null;
  }

  const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const pattern: boolean[] = [];
  
  // Ensure tag is exactly 7 characters (pad with _ if needed)
  const normalizedTag = tag.padEnd(7, '_').slice(0, 7);
  
  for (let i = 0; i < 7; i++) {
    // Check if the character at this position matches the expected day letter
    const char = normalizedTag[i];
    pattern.push(char === dayNames[i]);
  }
  
  return pattern;
}

type LeaveBand = 'excellent' | 'good' | 'fair' | 'needs-attention' | 'critical';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildLeaveBandTheme(band: LeaveBand): {
  scoreLabel: string;
  gradientColors: string;
  bgGradient: string;
  borderColor: string;
  textColor: string;
  badgeColor: string;
  quote: string;
} {
  switch (band) {
    case 'excellent':
      return {
        scoreLabel: 'Excellent',
        gradientColors: 'from-green-500 via-emerald-500 to-teal-500',
        bgGradient: 'bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/40 dark:to-emerald-900/40',
        borderColor: 'border-green-400 dark:border-green-600',
        textColor: 'text-green-700 dark:text-green-300',
        badgeColor: 'bg-green-100 dark:bg-green-900 text-green-900 dark:text-white',
        quote: 'Excellent planning keeps your leave flexible and stress-free.',
      };
    case 'good':
      return {
        scoreLabel: 'Good',
        gradientColors: 'from-blue-500 via-indigo-500 to-purple-500',
        bgGradient: 'bg-gradient-to-br from-blue-200 to-indigo-200 dark:from-blue-900/50 dark:to-indigo-900/50',
        borderColor: 'border-blue-500 dark:border-blue-500',
        textColor: 'text-blue-700 dark:text-blue-300',
        badgeColor: 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-white',
        quote: 'You are in a good spot - a little planning keeps it that way.',
      };
    case 'fair':
      return {
        scoreLabel: 'Fair',
        gradientColors: 'from-yellow-500 via-amber-500 to-orange-500',
        bgGradient: 'bg-gradient-to-br from-yellow-200 to-amber-200 dark:from-yellow-900/50 dark:to-amber-900/50',
        borderColor: 'border-yellow-500 dark:border-yellow-500',
        textColor: 'text-yellow-700 dark:text-yellow-300',
        badgeColor: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-white',
        quote: 'You can still make this work with early coordination.',
      };
    case 'needs-attention':
      return {
        scoreLabel: 'Needs Attention',
        gradientColors: 'from-orange-500 via-red-500 to-pink-500',
        bgGradient: 'bg-gradient-to-br from-orange-200 to-red-200 dark:from-orange-900/50 dark:to-red-900/50',
        borderColor: 'border-orange-500 dark:border-orange-500',
        textColor: 'text-orange-700 dark:text-orange-300',
        badgeColor: 'bg-orange-100 dark:bg-orange-900 text-orange-900 dark:text-white',
        quote: 'A small plan now prevents bigger problems later.',
      };
    case 'critical':
    default:
      return {
        scoreLabel: 'Requires Planning',
        gradientColors: 'from-red-600 via-rose-600 to-pink-600',
        bgGradient: 'bg-gradient-to-br from-red-200 to-rose-200 dark:from-red-900/50 dark:to-rose-900/50',
        borderColor: 'border-red-500 dark:border-red-500',
        textColor: 'text-red-700 dark:text-red-300',
        badgeColor: 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-white',
        quote: 'Act now to protect your remaining leave options.',
      };
  }
}

/**
 * Calculate time-based leave health score considering:
 * - How far into the year we are
 * - Expected usage vs actual usage
 * - Whether days were used too early (bad)
 * - Whether days were saved appropriately (good)
 * - Whether leave balance has been manually set by leader
 * 
 * @param baseBalance - Total leave balance for the year
 * @param used - Days already used
 * @param remainingBalance - Days remaining
 * @param realisticUsableDays - Realistic usable days considering constraints
 * @param willLose - Days that will be lost at year end
 * @param willCarryover - Days that will carry over
 * @param hasManualBalance - Whether leave balance has been manually set by leader
 * @returns Object with score, label, colors, quote, and message
 */
export function calculateTimeBasedLeaveScore(
  baseBalance: number,
  used: number,
  remainingBalance: number,
  realisticUsableDays: number,
  willLose: number,
  willCarryover: number,
  hasManualBalance: boolean = false,
  carryoverLimitedToMonths?: number[],
  carryoverMaxDays?: number,
  carryoverExpiryDate?: Date,
  approvedFutureDays: number = 0,
  pendingFutureDays: number = 0,
  asOfDate?: Date
): {
  score: string;
  scoreLabel: string;
  gradientColors: string;
  bgGradient: string;
  borderColor: string;
  textColor: string;
  badgeColor: string;
  quote: string;
  message: string;
} {
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const nextYearStart = new Date(currentYear + 1, 0, 1);
  const today = asOfDate ? new Date(asOfDate) : new Date();
  const totalDaysInYear = Math.max(1, Math.floor((nextYearStart.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)));
  const daysElapsed = Math.floor((today.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
  const yearProgress = clamp(daysElapsed / totalDaysInYear, 0, 1);
  const usagePct = baseBalance > 0 ? (used / baseBalance) * 100 : 0;
  const expectedPct = yearProgress * 100;
  const deviation = Math.abs(usagePct - expectedPct);

  const normalizedApprovedFutureDays = Math.max(0, approvedFutureDays);
  const normalizedPendingFutureDays = Math.max(0, pendingFutureDays);
  const approvalCertainty =
    normalizedApprovedFutureDays /
    Math.max(1, normalizedApprovedFutureDays + normalizedPendingFutureDays);
  const confidencePenalty = approvalCertainty >= 0.8 ? 0 : approvalCertainty >= 0.5 ? -5 : -10;

  const lossRiskSignal =
    100 -
    Math.min(
      100,
      (Math.max(0, willLose) / Math.max(1, Math.max(0, remainingBalance) + Math.max(0, willLose))) * 120
    );
  const pacingSignal = Math.max(0, 100 - deviation * 2.5);
  const accessSignal =
    remainingBalance <= 0
      ? 100
      : clamp((Math.max(0, realisticUsableDays) / Math.max(1, remainingBalance)) * 100, 0, 100);

  const baseline = clamp(
    0.45 * lossRiskSignal + 0.3 * pacingSignal + 0.25 * accessSignal + confidencePenalty,
    0,
    100
  );

  let band: LeaveBand =
    baseline >= 85 ? 'excellent' : baseline >= 70 ? 'good' : baseline >= 50 ? 'fair' : baseline >= 30 ? 'needs-attention' : 'critical';

  let message = '';

  if (remainingBalance === 0) {
    const totalAllocated = used + normalizedApprovedFutureDays;
    const coverageTarget = Math.max(3, baseBalance * 0.15);
    const isMostlyAllocated =
      baseBalance > 0 &&
      normalizedApprovedFutureDays > 0 &&
      used < baseBalance &&
      totalAllocated >= baseBalance * 0.9;
    const isPlannedZero = !hasManualBalance && (normalizedApprovedFutureDays >= coverageTarget || isMostlyAllocated);

    if (isPlannedZero) {
      band = pacingSignal >= 85 ? 'excellent' : 'good';
      message = `You have fully allocated your leave for this year, and no days are left unplanned. ${
        pacingSignal >= 85
          ? 'Your leave pacing is well-aligned with the calendar.'
          : 'Your plan is solid, but keep an eye on how leave is spread across the remaining months.'
      }`;
    } else if (hasManualBalance) {
      band = 'needs-attention';
      message =
        'Your leave balance has been manually set to zero. Please coordinate with your team leader if you need adjustments or clarification.';
    } else {
      band = 'critical';
      message =
        'You have no remaining leave balance and no clear approved future allocation coverage. Coordinate with your team leader to discuss options.';
    }
  } else if (realisticUsableDays <= 0) {
    band = yearProgress >= 0.5 ? 'critical' : 'needs-attention';
    message = `All realistically usable leave windows are currently blocked (${Math.round(remainingBalance)} days remaining, 0 realistically usable). Prioritize early coordination to unblock dates.`;
  } else {
    message = `Your leave profile combines loss risk (${Math.round(lossRiskSignal)}), pacing (${Math.round(
      pacingSignal
    )}), and access (${Math.round(accessSignal)}).`;
  }

  const phase: 'early' | 'mid' | 'late' =
    yearProgress < 0.5 ? 'early' : yearProgress <= 0.8 ? 'mid' : 'late';
  const bandRank: Record<LeaveBand, number> = {
    excellent: 4,
    good: 3,
    fair: 2,
    'needs-attention': 1,
    critical: 0,
  };

  if (willLose > 0 && remainingBalance > 0) {
    const maxBandForPhase: LeaveBand =
      phase === 'early' ? 'fair' : phase === 'mid' ? 'needs-attention' : 'critical';
    if (bandRank[band] > bandRank[maxBandForPhase]) {
      band = maxBandForPhase;
    }

    if (willLose > 5) {
      band = phase === 'early' ? 'needs-attention' : 'critical';
    } else if (willLose > 2 && phase !== 'early' && bandRank[band] > bandRank['needs-attention']) {
      band = 'needs-attention';
    }
  }

  const hasCarryoverRestrictions =
    (carryoverLimitedToMonths?.length ?? 0) > 0 ||
    carryoverExpiryDate !== undefined ||
    (carryoverMaxDays !== undefined && carryoverMaxDays <= 0);

  const canApplyCarryoverUplift =
    willCarryover > 0 &&
    willLose <= 0 &&
    remainingBalance > 0 &&
    !hasCarryoverRestrictions;

  if (canApplyCarryoverUplift) {
    if (band === 'good') band = 'excellent';
    if (band === 'fair') band = 'good';
    if (band === 'needs-attention') band = 'fair';
    if (band === 'critical') band = 'needs-attention';
  }

  if (!message) {
    message =
      band === 'excellent'
        ? 'Your leave health is strong across pacing, risk, and usable access.'
        : band === 'good'
          ? 'Your leave health is in a good place. Keep coordinating proactively.'
          : band === 'fair'
            ? 'You still have options, but planning early will protect your leave.'
            : band === 'needs-attention'
              ? 'Risk is rising. Act soon to avoid losing leave flexibility.'
              : 'Immediate planning is needed to avoid losing leave opportunities.';
  }

  if (willCarryover > 0) {
    message += ` Carryover projection: ${Math.round(willCarryover)} day${Math.round(willCarryover) !== 1 ? 's' : ''}.`;
    if (carryoverLimitedToMonths && carryoverLimitedToMonths.length > 0) {
      const monthNames = carryoverLimitedToMonths
        .map((m) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m])
        .join(', ');
      message += ` Use window is limited to: ${monthNames}.`;
    }
    if (carryoverMaxDays !== undefined && willCarryover > carryoverMaxDays) {
      const excessDays = Math.round(willCarryover - carryoverMaxDays);
      message += ` Policy cap allows ${carryoverMaxDays} carryover day${carryoverMaxDays !== 1 ? 's' : ''}; ${excessDays} day${excessDays !== 1 ? 's' : ''} may be lost.`;
    }
    if (carryoverExpiryDate) {
      message += ` Carryover expires on ${new Date(carryoverExpiryDate).toLocaleDateString()}.`;
    }
  } else if (willLose > 0) {
    message += ` Projected loss: ${Math.round(willLose)} day${Math.round(willLose) !== 1 ? 's' : ''} by year end.`;
  }

  if (hasManualBalance && remainingBalance !== 0) {
    message += ' Your balance includes a manual adjustment from your team leader.';
  }

  const theme = buildLeaveBandTheme(band);

  return {
    score: band,
    scoreLabel: theme.scoreLabel,
    gradientColors: theme.gradientColors,
    bgGradient: theme.bgGradient,
    borderColor: theme.borderColor,
    textColor: theme.textColor,
    badgeColor: theme.badgeColor,
    quote: theme.quote,
    message,
  };
}

/**
 * Calculate time-based team health score considering:
 * - How far into the year we are
 * - Team utilization rate vs expected for time of year
 * - Members at risk of losing days
 * - Whether team is using leave too early or too late
 * 
 * @param totalMembers - Total number of team members
 * @param maxLeavePerYear - Maximum leave per year per member
 * @param totalRemainingBalance - Total remaining leave balance across team
 * @param totalRealisticUsableDays - Total realistic usable days considering constraints
 * @param membersAtRisk - Number of members at risk of losing days
 * @param totalWillLose - Total days that will be lost at year end
 * @param totalWillCarryover - Total days that will carry over
 * @returns Object with score, label, colors, quote, and message
 */
export function calculateTimeBasedTeamHealthScore(
  totalMembers: number,
  maxLeavePerYear: number,
  totalRemainingBalance: number,
  totalRealisticUsableDays: number,
  membersAtRisk: number,
  totalWillLose: number,
  totalWillCarryover: number,
  carryoverLimitedToMonths?: number[],
  carryoverMaxDays?: number,
  carryoverExpiryDate?: Date,
  totalRemainderDays?: number
): {
  score: string;
  scoreLabel: string;
  gradientColors: string;
  bgGradient: string;
  borderColor: string;
  textColor: string;
  badgeColor: string;
  quote: string;
  message: string;
} {
  if (totalMembers === 0) {
    return {
      score: 'no-members',
      scoreLabel: 'No Members',
      gradientColors: 'from-zinc-400 via-slate-400 to-gray-400',
      bgGradient: 'bg-gradient-to-br from-zinc-100 to-slate-100 dark:from-zinc-900/40 dark:to-slate-900/40',
      borderColor: 'border-zinc-300 dark:border-zinc-600',
      textColor: 'text-zinc-600 dark:text-zinc-400',
      badgeColor: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
      quote: 'Add members to start tracking team leave health.',
      message: 'No members are assigned to this team yet. Invite members to begin managing leave.',
    };
  }

  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear, 11, 31);
  const today = new Date();
  
  // Calculate how far into the year we are (0.0 to 1.0)
  const totalDaysInYear = Math.floor((yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
  const daysElapsed = Math.floor((today.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
  const yearProgress = Math.min(1.0, Math.max(0.0, daysElapsed / totalDaysInYear));
  
  // Calculate team utilization metrics
  const totalLeaveAllocated = totalMembers * maxLeavePerYear;
  const totalUsed = totalLeaveAllocated - totalRemainingBalance;
  const utilizationRate = totalLeaveAllocated > 0 ? (totalUsed / totalLeaveAllocated) * 100 : 0;
  const expectedUtilizationRate = yearProgress * 100;
  const utilizationDeviation = utilizationRate - expectedUtilizationRate;
  
  // Calculate efficiency rate (usable days vs remaining balance)
  const efficiencyRate = totalRemainingBalance > 0
    ? (totalRealisticUsableDays / totalRemainingBalance) * 100
    : 0;
  
  // Determine if team is using leave too early or too late
  const isOverUtilizedEarly = utilizationDeviation > 20; // Used 20%+ more than expected for this time of year
  const isUnderUtilized = utilizationDeviation < -15; // Used 15%+ less than expected (might lose days)
  
  // Score logic considering time of year and team health
  let score = 'excellent';
  let gradientColors = 'from-green-500 via-emerald-500 to-teal-500';
  let bgGradient = 'bg-gradient-to-br from-green-200 to-emerald-200 dark:from-green-900/50 dark:to-emerald-900/50';
  let borderColor = 'border-green-500 dark:border-green-500';
  let textColor = 'text-green-700 dark:text-green-300';
  let badgeColor = 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200';
  let quote = '';
  let message = '';
  let scoreLabel = 'Excellent';
  
  // Priority 1: Check for members at risk and days that will be lost
  if (membersAtRisk === 0 && totalWillLose === 0 && efficiencyRate >= 80) {
    if (isOverUtilizedEarly) {
      // Team used too much too early - warn about future availability
      score = 'good';
      gradientColors = 'from-blue-500 via-indigo-500 to-purple-500';
      bgGradient = 'bg-gradient-to-br from-blue-200 to-indigo-200 dark:from-blue-900/50 dark:to-indigo-900/50';
      borderColor = 'border-blue-500 dark:border-blue-500';
      textColor = 'text-blue-700 dark:text-blue-300';
      badgeColor = 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200';
      quote = 'Good team health, but plan ahead for the rest of the year.';
      message = `Good! No members are at risk of losing days, and the team has good access to usable leave (${Math.round(efficiencyRate)}% efficiency). However, your team has used ${Math.round(utilizationRate)}% of allocated leave while we're only ${Math.round(yearProgress * 100)}% through the year. Encourage members to save some days for unexpected needs later.`;
      scoreLabel = 'Good - Plan Ahead';
    } else if (isUnderUtilized && yearProgress > 0.7) {
      // Late in year and under-utilized - risk of losing days
      score = 'fair';
      gradientColors = 'from-yellow-500 via-amber-500 to-orange-500';
      bgGradient = 'bg-gradient-to-br from-yellow-200 to-amber-200 dark:from-yellow-900/50 dark:to-amber-900/50';
      borderColor = 'border-yellow-500 dark:border-yellow-500';
      textColor = 'text-yellow-700 dark:text-yellow-300';
      badgeColor = 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200';
      quote = 'Encourage your team to use their entitled leave.';
      message = `Fair. No members are currently at risk, but your team has used ${Math.round(utilizationRate)}% of allocated leave while we're ${Math.round(yearProgress * 100)}% through the year. With ${Math.round(totalRemainingBalance)} days remaining, encourage members to plan their time off to avoid losing days.`;
      scoreLabel = 'Fair - Encourage Usage';
    } else {
      // Excellent team health
      score = 'excellent';
      gradientColors = 'from-green-500 via-emerald-500 to-teal-500';
      bgGradient = 'bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/40 dark:to-emerald-900/40';
      borderColor = 'border-green-400 dark:border-green-600';
      textColor = 'text-green-700 dark:text-green-300';
      badgeColor = 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200';
      quote = 'A well-rested team is a productive team. Great leadership!';
      message = `Excellent! Your team has healthy leave utilization (${Math.round(utilizationRate)}% used vs ${Math.round(yearProgress * 100)}% through the year). No members are at risk of losing days, and the team has good access to usable leave (${Math.round(efficiencyRate)}% efficiency).`;
      scoreLabel = 'Excellent';
    }
  }
  // Priority 2: Some members at risk or moderate efficiency
  else if (membersAtRisk <= totalMembers * 0.2 && efficiencyRate >= 60) {
    score = 'good';
    gradientColors = 'from-blue-500 via-indigo-500 to-purple-500';
    bgGradient = 'bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40';
    borderColor = 'border-blue-400 dark:border-blue-600';
    textColor = 'text-blue-700 dark:text-blue-300';
    badgeColor = 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200';
    quote = 'Proactive planning prevents leave conflicts. Keep it up!';
    message = `Good! Your team is managing leave well overall (${Math.round(utilizationRate)}% utilized). ${membersAtRisk} member${membersAtRisk !== 1 ? 's' : ''} ${membersAtRisk === 1 ? 'may' : 'may'} need attention to ensure they can use their remaining days effectively. ${isOverUtilizedEarly ? `Note: Your team has used more leave than expected for this time of year (${Math.round(yearProgress * 100)}% through). ` : ''}`;
    scoreLabel = 'Good';
  }
  // Priority 3: Moderate risk
  else if (membersAtRisk <= totalMembers * 0.4 && efficiencyRate >= 40) {
    score = 'fair';
    gradientColors = 'from-yellow-500 via-amber-500 to-orange-500';
    bgGradient = 'bg-gradient-to-br from-yellow-200 to-amber-200 dark:from-yellow-900/50 dark:to-amber-900/50';
    borderColor = 'border-yellow-500 dark:border-yellow-500';
    textColor = 'text-yellow-700 dark:text-yellow-300';
    badgeColor = 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200';
    quote = 'Team coordination is key to effective leave management.';
    message = `Fair. ${membersAtRisk} member${membersAtRisk !== 1 ? 's' : ''} ${membersAtRisk === 1 ? 'is' : 'are'} at risk of losing leave days. ${isOverUtilizedEarly ? `Your team has used ${Math.round(utilizationRate)}% of leave while we're only ${Math.round(yearProgress * 100)}% through the year. ` : ''}Consider coordinating with members to help them plan their remaining time off effectively.`;
    scoreLabel = 'Fair';
  }
  // Priority 4: High risk
  else if (membersAtRisk > 0 || totalWillLose > 0) {
    score = 'needs-attention';
    gradientColors = 'from-orange-500 via-red-500 to-pink-500';
    bgGradient = 'bg-gradient-to-br from-orange-200 to-red-200 dark:from-orange-900/50 dark:to-red-900/50';
    borderColor = 'border-orange-500 dark:border-orange-500';
    textColor = 'text-orange-700 dark:text-orange-300';
    badgeColor = 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200';
    quote = 'Support your team by helping them use their entitled leave.';
    message = `Needs attention. ${membersAtRisk} member${membersAtRisk !== 1 ? 's' : ''} ${membersAtRisk === 1 ? 'is' : 'are'} at risk of losing leave days. ${totalWillLose > 0 ? `Approximately ${Math.round(totalWillLose)} days will be lost at year end. ` : ''}${isOverUtilizedEarly ? `Your team has used ${Math.round(utilizationRate)}% of leave while we're only ${Math.round(yearProgress * 100)}% through the year. ` : ''}Consider proactive planning to help members utilize their leave.`;
    scoreLabel = 'Needs Attention';
  }
  // Priority 5: Critical situation
  else {
    score = 'critical';
    gradientColors = 'from-red-600 via-rose-600 to-pink-600';
    bgGradient = 'bg-gradient-to-br from-red-200 to-rose-200 dark:from-red-900/50 dark:to-rose-900/50';
    borderColor = 'border-red-500 dark:border-red-500';
    textColor = 'text-red-700 dark:text-red-300';
    badgeColor = 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200';
    quote = 'Effective leave management supports team well-being and retention.';
    message = `Requires immediate attention. Many team members are at risk of losing leave days. ${isOverUtilizedEarly ? `Your team has used ${Math.round(utilizationRate)}% of leave while we're only ${Math.round(yearProgress * 100)}% through the year. ` : ''}Consider reviewing leave policies and coordinating with members to ensure they can take their entitled time off.`;
    scoreLabel = 'Requires Planning';
  }
  
  // Add messages about carryover
  if (totalWillCarryover > 0) {
    message += ` Great news: ${Math.round(totalWillCarryover)} days will carry over to next year!`;
    
    // Add carryover limitations if applicable
    if (carryoverLimitedToMonths && carryoverLimitedToMonths.length > 0) {
      const monthNames = carryoverLimitedToMonths.map(m => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]).join(', ');
      message += ` Note: These carryover days can only be used in ${monthNames} of next year.`;
    }
    
    if (carryoverMaxDays && totalWillCarryover > carryoverMaxDays) {
      const excessDays = Math.round(totalWillCarryover - carryoverMaxDays);
      message += ` Warning: Only ${carryoverMaxDays} days can carry over. ${excessDays} day${excessDays !== 1 ? 's' : ''} will be lost.`;
    }
    
    if (carryoverExpiryDate) {
      const expiryDate = new Date(carryoverExpiryDate);
      message += ` Important: Carryover days expire on ${expiryDate.toLocaleDateString()}.`;
    }
  }
  
  return {
    score,
    scoreLabel,
    gradientColors,
    bgGradient,
    borderColor,
    textColor,
    badgeColor,
    quote,
    message,
  };
}

