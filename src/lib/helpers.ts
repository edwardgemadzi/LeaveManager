import { TeamSettings } from '@/types';

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
  carryoverExpiryDate?: Date
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
  const yearEnd = new Date(currentYear, 11, 31);
  const today = new Date();
  
  // Calculate how far into the year we are (0.0 to 1.0)
  const totalDaysInYear = Math.floor((yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
  const daysElapsed = Math.floor((today.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
  const yearProgress = Math.min(1.0, Math.max(0.0, daysElapsed / totalDaysInYear));
  
  // Calculate expected usage based on time of year
  // If we're 50% through the year, we'd expect ~50% usage for balanced usage
  const usagePercentage = baseBalance > 0 ? (used / baseBalance) * 100 : 0;
  const expectedUsagePercentage = yearProgress * 100;
  
  // Calculate usage deviation from expected
  const usageDeviation = usagePercentage - expectedUsagePercentage;
  
  // Determine if they used too much too early (bad) or saved appropriately (good)
  const isOverUsedEarly = usageDeviation > 20; // Used 20%+ more than expected for this time of year
  const isUnderUsed = usageDeviation < -10; // Used 10%+ less than expected (saved appropriately)
  
  // Score logic considering time of year and usage patterns
  let score = 'excellent';
  let gradientColors = 'from-green-500 via-emerald-500 to-teal-500';
  let bgGradient = 'bg-gradient-to-br from-green-200 to-emerald-200 dark:from-green-900/50 dark:to-emerald-900/50';
  let borderColor = 'border-green-500 dark:border-green-500';
  let textColor = 'text-green-700 dark:text-green-300';
  let badgeColor = 'bg-green-100 dark:bg-green-900 text-green-900 dark:text-white';
  let quote = '';
  let message = '';
  let scoreLabel = 'Excellent';
  
  // Priority 0: Handle zero balance case (especially when manually set)
  if (remainingBalance === 0) {
    if (hasManualBalance) {
      // Manually set to 0 - needs coordination
      score = 'needs-attention';
      gradientColors = 'from-orange-500 via-red-500 to-pink-500';
      bgGradient = 'bg-gradient-to-br from-orange-200 to-red-200 dark:from-orange-900/50 dark:to-red-900/50';
      borderColor = 'border-orange-500 dark:border-orange-500';
      textColor = 'text-orange-700 dark:text-orange-300';
      badgeColor = 'bg-orange-100 dark:bg-orange-900 text-orange-900 dark:text-white';
      quote = 'Your leave balance has been adjusted.';
      message = `Your leave balance has been manually set to 0 by your team leader. You currently have no remaining leave days available. Please coordinate with your team leader to discuss your leave allocation and any adjustments that may be needed.`;
      scoreLabel = 'No Leave Available';
    } else {
      // Used all leave naturally
      score = 'critical';
      gradientColors = 'from-red-600 via-rose-600 to-pink-600';
      bgGradient = 'bg-gradient-to-br from-red-200 to-rose-200 dark:from-red-900/50 dark:to-red-900/50';
      borderColor = 'border-red-500 dark:border-red-500';
      textColor = 'text-red-700 dark:text-red-300';
      badgeColor = 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-white';
      quote = 'Remember: Taking breaks is essential for productivity and well-being.';
      message = `You have no remaining leave days available. All ${Math.round(baseBalance)} days have been used this year. Consider discussing leave options with your team leader for better planning next year.`;
      scoreLabel = 'No Leave Available';
    }
  }
  // Priority 1: Check if they can use all remaining days (excellent availability)
  else if (realisticUsableDays >= remainingBalance && remainingBalance > 0) {
    if (isOverUsedEarly) {
      // Used too much too early - warn about future availability
      score = 'good';
      gradientColors = 'from-blue-500 via-indigo-500 to-purple-500';
      bgGradient = 'bg-gradient-to-br from-blue-200 to-indigo-200 dark:from-blue-900/50 dark:to-indigo-900/50';
      borderColor = 'border-blue-500 dark:border-blue-500';
      textColor = 'text-blue-700 dark:text-blue-300';
      badgeColor = 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-white';
      quote = 'Plan ahead - you\'ve used more leave early in the year.';
      message = `Good availability! You can use all your remaining ${Math.round(remainingBalance)} days. However, you've used ${Math.round(usagePercentage)}% of your leave while we're only ${Math.round(yearProgress * 100)}% through the year. Make sure to save some days for unexpected needs later in the year.`;
      scoreLabel = 'Good - Plan Ahead';
    } else if (isUnderUsed) {
      // Saved appropriately - excellent
      score = 'excellent';
      gradientColors = 'from-green-500 via-emerald-500 to-teal-500';
      bgGradient = 'bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/40 dark:to-emerald-900/40';
      borderColor = 'border-green-400 dark:border-green-600';
      textColor = 'text-green-700 dark:text-green-300';
      badgeColor = 'bg-green-100 dark:bg-green-900 text-green-900 dark:text-white';
      quote = 'Excellent planning! You\'ve saved leave appropriately.';
      message = `Excellent! You can use all your remaining ${Math.round(remainingBalance)} days, and you've saved appropriately for this time of year (${Math.round(usagePercentage)}% used vs ${Math.round(yearProgress * 100)}% through the year). This gives you flexibility for unexpected needs.`;
      scoreLabel = 'Excellent';
    } else {
      // On track - excellent
      score = 'excellent';
      gradientColors = 'from-green-500 via-emerald-500 to-teal-500';
      bgGradient = 'bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/40 dark:to-emerald-900/40';
      borderColor = 'border-green-400 dark:border-green-600';
      textColor = 'text-green-700 dark:text-green-300';
      badgeColor = 'bg-green-100 dark:bg-green-900 text-green-900 dark:text-white';
      quote = 'Take time to recharge. Your well-being matters!';
      message = `Excellent! You can use all your remaining ${Math.round(remainingBalance)} days. Your usage (${Math.round(usagePercentage)}%) is well-balanced for this time of year (${Math.round(yearProgress * 100)}% through).`;
      scoreLabel = 'Excellent';
    }
  }
  // Priority 2: Check if they can use most remaining days (good availability)
  else if (realisticUsableDays >= remainingBalance * 0.7) {
    if (isOverUsedEarly) {
      // Used too much too early - needs attention
      score = 'fair';
      gradientColors = 'from-yellow-500 via-amber-500 to-orange-500';
      bgGradient = 'bg-gradient-to-br from-yellow-200 to-amber-200 dark:from-yellow-900/50 dark:to-amber-900/50';
      borderColor = 'border-yellow-500 dark:border-yellow-500';
      textColor = 'text-yellow-700 dark:text-yellow-300';
      badgeColor = 'bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-white';
      quote = 'You\'ve used more leave early in the year. Plan carefully.';
      message = `Fair. You can use most of your remaining ${Math.round(remainingBalance)} days (${Math.round(realisticUsableDays)} usable). However, you've used ${Math.round(usagePercentage)}% of your leave while we're only ${Math.round(yearProgress * 100)}% through the year. Consider saving some days for unexpected needs.`;
      scoreLabel = 'Fair - Plan Carefully';
    } else {
      // Good availability
      score = 'good';
      gradientColors = 'from-blue-500 via-indigo-500 to-purple-500';
      bgGradient = 'bg-gradient-to-br from-blue-200 to-indigo-200 dark:from-blue-900/50 dark:to-indigo-900/50';
      borderColor = 'border-blue-500 dark:border-blue-500';
      textColor = 'text-blue-700 dark:text-blue-300';
      badgeColor = 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-white';
      quote = 'Plan ahead to make the most of your leave days.';
      message = `Good! You can use most of your remaining ${Math.round(remainingBalance)} days (${Math.round(realisticUsableDays)} usable). Plan ahead and coordinate with your team to ensure you can take your well-deserved time off.`;
      scoreLabel = 'Good';
    }
  }
  // Priority 3: Check if they can use some remaining days (fair availability)
  else if (realisticUsableDays >= remainingBalance * 0.3) {
    score = 'fair';
    gradientColors = 'from-yellow-500 via-amber-500 to-orange-500';
    bgGradient = 'bg-gradient-to-br from-yellow-200 to-amber-200 dark:from-yellow-900/50 dark:to-amber-900/50';
    borderColor = 'border-yellow-500 dark:border-yellow-500';
    textColor = 'text-yellow-700 dark:text-yellow-300';
    badgeColor = 'bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-white';
    quote = 'Work-life balance is crucial. Use your leave wisely!';
    message = `Fair. You can use some of your remaining ${Math.round(remainingBalance)} days (${Math.round(realisticUsableDays)} usable). ${isOverUsedEarly ? `Note: You've used ${Math.round(usagePercentage)}% of your leave while we're only ${Math.round(yearProgress * 100)}% through the year. ` : ''}Coordinate early with your team to maximize your opportunities to take time off.`;
    scoreLabel = 'Fair';
  }
  // Priority 4: Limited days available (needs attention)
  else if (realisticUsableDays > 0) {
    score = 'needs-attention';
    gradientColors = 'from-orange-500 via-red-500 to-pink-500';
    bgGradient = 'bg-gradient-to-br from-orange-200 to-red-200 dark:from-orange-900/50 dark:to-red-900/50';
    borderColor = 'border-orange-500 dark:border-orange-500';
    textColor = 'text-orange-700 dark:text-orange-300';
    badgeColor = 'bg-orange-100 dark:bg-orange-900 text-orange-900 dark:text-white';
    quote = 'Rest is not a reward for finishing everything. Rest is a vital part of the process.';
    message = `Needs attention. You can realistically use ${Math.round(realisticUsableDays)} days out of ${Math.round(remainingBalance)} remaining. ${isOverUsedEarly ? `You've used ${Math.round(usagePercentage)}% of your leave while we're only ${Math.round(yearProgress * 100)}% through the year. ` : ''}Plan carefully and communicate with your team early.`;
    scoreLabel = 'Needs Attention';
  }
  // Priority 5: No days available (critical)
  else {
    score = 'critical';
    gradientColors = 'from-red-600 via-rose-600 to-pink-600';
    bgGradient = 'bg-gradient-to-br from-red-200 to-rose-200 dark:from-red-900/50 dark:to-rose-900/50';
    borderColor = 'border-red-500 dark:border-red-500';
    textColor = 'text-red-700 dark:text-red-300';
    badgeColor = 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-white';
    quote = 'Remember: Taking breaks is essential for productivity and well-being.';
    message = `Limited availability. All usable days are already booked. ${isOverUsedEarly ? `You've used ${Math.round(usagePercentage)}% of your leave while we're only ${Math.round(yearProgress * 100)}% through the year. ` : ''}Consider discussing leave options with your team leader for better planning next year.`;
    scoreLabel = 'Requires Planning';
  }
  
  // Add messages about carryover or loss
  if (willCarryover > 0) {
    message += ` Great news: ${Math.round(willCarryover)} days will carry over to next year!`;
    
    // Add carryover limitations if applicable
    if (carryoverLimitedToMonths && carryoverLimitedToMonths.length > 0) {
      const monthNames = carryoverLimitedToMonths.map(m => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]).join(', ');
      message += ` Note: These carryover days can only be used in ${monthNames} of next year.`;
    }
    
    if (carryoverMaxDays && willCarryover > carryoverMaxDays) {
      const excessDays = Math.round(willCarryover - carryoverMaxDays);
      message += ` Warning: Only ${carryoverMaxDays} days can carry over. ${excessDays} day${excessDays !== 1 ? 's' : ''} will be lost.`;
    }
    
    if (carryoverExpiryDate) {
      const expiryDate = new Date(carryoverExpiryDate);
      message += ` Important: Carryover days expire on ${expiryDate.toLocaleDateString()}. Use them before this date.`;
    }
  } else if (willLose > 0) {
    message += ` Note: ${Math.round(willLose)} days will be lost at year end if not used.`;
  }
  
  // Add coordination advice if manual balance is set (but not if we already added it in the zero balance case)
  if (hasManualBalance && remainingBalance !== 0) {
    message += ` Your leave balance has been manually adjusted by your team leader. Please coordinate with your leader if you have questions about your leave allocation or need to discuss adjustments.`;
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
  carryoverExpiryDate?: Date
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

